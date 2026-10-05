require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const { NseIndia } = require("stock-nse-india");
const { NseMcpClient } = require("./nseMcpClient");
const nseMcpClient = new NseMcpClient();

/*
 * IMPORTANT NSE PRODUCTION CONTROL
 * --------------------------------
 * Render was previously opening many NSE requests at the same time.
 * That is especially bad for NSE/Akamai-protected endpoints.
 *
 * Keep ONE NseIndia instance and serialize every NSE SDK call through a
 * small queue. This does not bypass NSE protection; it simply prevents EMA360
 * from creating request bursts. A 403 is never retried aggressively.
 */
const rawNseIndia = new NseIndia();

const NSE_QUEUE_MIN_GAP_MS = Math.max(500, Number(process.env.NSE_QUEUE_MIN_GAP_MS || 1200));
let nseQueue = Promise.resolve();
let nseLastRequestAt = 0;

function queueNseCall(label, fn) {
    const run = nseQueue.then(async () => {
        const wait = Math.max(0, NSE_QUEUE_MIN_GAP_MS - (Date.now() - nseLastRequestAt));
        if (wait > 0) {
            await new Promise(resolve => setTimeout(resolve, wait));
        }

        nseLastRequestAt = Date.now();

        try {
            return await fn();
        } catch (error) {
            const status = error?.response?.status || error?.status || "";
            if (String(status) === "403" || /403/.test(String(error?.message || ""))) {
                console.error(`❌ NSE 403 (${label}). No aggressive retry will be attempted.`);
            }
            throw error;
        }
    });

    // Keep the queue alive after a failed request.
    nseQueue = run.catch(() => undefined);
    return run;
}

// Proxy all SDK methods so existing EMA360 code automatically uses the queue.
const nseIndia = new Proxy(rawNseIndia, {
    get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);

        if (typeof value !== "function") {
            return value;
        }

        return (...args) =>
            queueNseCall(String(property), () => value.apply(target, args));
    }
});

// Cache NSE symbols and tokens so we don't repeatedly fetch them
let NSE_STOCKS_CACHE = [];
const NSE_TOKEN_CACHE = new Map();

// ============================================================
// NSE SCANNER PRIORITY CACHE
// ============================================================

let NSE_PRIORITY_CACHE = [];
let NSE_PRIORITY_CACHE_TIME = 0;
let NSE_PRIORITY_INFLIGHT = null;

// Keep the priority snapshot for 5 minutes.
// We do NOT want to rebuild the entire NSE ranking for every scan.
const NSE_PRIORITY_CACHE_TTL_MS = 5 * 60 * 1000;

const express = require("express");
const { SmartAPI, WebSocketV2 } = require("smartapi-javascript");

const app = express();

const cors = require("cors");

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "http://localhost:5173";

app.use(
    cors({
        origin: FRONTEND_URL,
        credentials: true
    })
);

// Scanner Magic Filters / Backtest / Alerts send JSON bodies.
app.use(express.json({ limit: "1mb" }));

/* =========================================================
   EMA360 + ANGEL ONE OAUTH / PUBLISHER LOGIN
   ---------------------------------------------------------
   Flow:

   1. User clicks "Connect with Broker Account" in React.
   2. React sends the browser to /api/auth/angel/start.
   3. Backend redirects to Angel One's official login page.
   4. User logs in on Angel One. EMA360 never receives the PIN/TOTP.
   5. Angel One redirects to /api/auth/angel/callback.
   6. Backend validates the OAuth state, stores the broker tokens
      server-side in the current session, sets an HttpOnly cookie,
      and redirects back to EMA360.
   7. React calls /api/auth/me and opens the dashboard.

   IMPORTANT:
   - Configure the exact callback URL in the Angel One API app.
   - New Login authentication is handled by the documented login API.
     The old Publisher redirect flow is not used by this server. Current Angel One API-app rules can vary by app type.
   - Sessions are kept in memory in this version. A persistent store
     should be used before deploying multiple backend instances.
========================================================= */

const SESSION_COOKIE = "ema360_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/*
 * Each EMA360 browser session owns its own Angel One SmartAPI session.
 * There is intentionally NO fixed client code, PIN or TOTP secret in .env.
 */
const authSessions = new Map();

function timingSafeEqualText(a, b) {
    const aa = Buffer.from(String(a));
    const bb = Buffer.from(String(b));

    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
}

function parseCookies(header = "") {
    const cookies = {};

    for (const part of String(header).split(";")) {
        const index = part.indexOf("=");
        if (index === -1) continue;

        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (!key) continue;

        try {
            cookies[key] = decodeURIComponent(value);
        } catch {
            cookies[key] = value;
        }
    }

    return cookies;
}

function cookieFlags(maxAgeSeconds) {
    const isProduction =
        process.env.NODE_ENV === "production";

    if (isProduction) {
        return `Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAgeSeconds}`;
    }

    return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function setAuthCookie(res, sessionId) {
    res.setHeader(
        "Set-Cookie",
        `ema360_session=${encodeURIComponent(sessionId)}; ${cookieFlags(
            Math.floor(SESSION_TTL_MS / 1000)
        )}`
    );
}

function clearAuthCookie(res) {
    res.setHeader(
        "Set-Cookie",
        `ema360_session=; ${cookieFlags(0)}`
    );
}

function getAuthenticatedSession(req) {
    const cookies = parseCookies(req.headers.cookie || "");
    const sessionId = cookies.ema360_session;

    console.log("🔐 AUTH DEBUG:", {
        path: req.path,
        hasCookie: Boolean(sessionId),
        cookieLength: sessionId ? sessionId.length : 0,
        sessionExists: sessionId
            ? authSessions.has(sessionId)
            : false,
        activeSessions: authSessions.size,
        cfRay: req.headers["cf-ray"] || null
    });

    if (!sessionId) {
        console.log("❌ AUTH DEBUG: NO SESSION COOKIE");
        return null;
    }

    const session = authSessions.get(sessionId);

    if (!session) {
        console.log("❌ AUTH DEBUG: COOKIE EXISTS BUT SESSION NOT FOUND");
        return null;
    }

    if (Date.now() > session.expiresAt) {
        console.log("❌ AUTH DEBUG: SESSION EXPIRED");
        authSessions.delete(sessionId);
        return null;
    }

    console.log(
        `✅ AUTH DEBUG: SESSION VALID FOR ${session.user?.clientId || "unknown"}`
    );

    return { sessionId, session };
}

function publicUser(user) {
    if (!user) return null;

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        clientId: user.clientId,
        broker: "angelone"
    };
}

/* =========================================================
   ANGEL ONE — CURRENT NEW LOGIN FLOW

   Angel's current SmartAPI documentation uses the
   loginByPassword endpoint for the New Login/API flow.
   The user supplies THEIR Client ID, PIN and current TOTP.

   IMPORTANT:
   - ANGEL_CLIENT_CODE is NOT read from .env.
   - ANGEL_PIN is NOT read from .env.
   - ANGEL_TOTP_SECRET is NOT read from .env.
   - JWT/feed/refresh tokens stay server-side.
========================================================= */

app.post("/api/auth/angel/login", async (req, res) => {
    try {
        const clientId = String(req.body?.clientId || "").trim();
        const pin = String(req.body?.pin || "").trim();
        const totp = String(req.body?.totp || "").trim();

        if (!clientId || !pin || !totp) {
            return res.status(400).json({
                success: false,
                message: "Angel One Client ID, PIN and TOTP are required."
            });
        }

        const apiKey = String(process.env.ANGEL_API_KEY || "").trim();

        if (!apiKey) {
            return res.status(500).json({
                success: false,
                message: "ANGEL_API_KEY is not configured on the backend."
            });
        }

        console.log(`🔐 Angel One login attempt for client ${clientId}`);

        const loginResponse = await axios.post(
            "https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword",
            {
                clientcode: clientId,
                password: pin,
                totp
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-PrivateKey": apiKey,
                    "X-UserType": "USER",
                    "X-SourceID": "WEB",
                    "X-MACAddress": "00:00:00:00:00:00"
                },
                timeout: 15000
            }
        );

        const login = loginResponse.data;

        if (!login?.status || !login?.data?.jwtToken) {
            console.error("❌ Angel One login rejected:", login);

            return res.status(401).json({
                success: false,
                message:
                    login?.message ||
                    "Angel One authentication failed."
            });
        }

        const jwtToken = login.data.jwtToken;
        const refreshToken = login.data.refreshToken || null;
        const feedToken = login.data.feedToken || null;

        const profileResponse = await axios.get(
            "https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/getProfile",
            {
                headers: {
                    Authorization: `Bearer ${jwtToken}`,
                    "X-PrivateKey": apiKey,
                    "X-UserType": "USER",
                    "X-SourceID": "WEB",
                    "X-MACAddress": "00:00:00:00:00:00",
                    Accept: "application/json"
                },
                timeout: 15000
            }
        );

        const profile = profileResponse.data?.data || {};
        const connectedClientId = String(
            profile.clientcode || clientId
        ).trim();

        const user = {
            id: crypto.randomUUID(),
            name: String(profile.name || connectedClientId),
            email: profile.email || null,
            clientId: connectedClientId,
            broker: "angelone"
        };

        const sessionId = crypto.randomBytes(32).toString("hex");

        authSessions.set(sessionId, {
            user,
            jwtToken,
            refreshToken,
            feedToken,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_TTL_MS
        });

        // Start this user's Angel One live feed.
        await startAngelWebSocket(sessionId, authSessions.get(sessionId));

        setAuthCookie(res, sessionId);

        console.log(
            `✅ Angel One login successful for ${connectedClientId}`
        );

        return res.json({
            success: true,
            user: publicUser(user),
            dataSource: "angel",
            brokerConnected: true
        });
    } catch (error) {
        console.error(
            "❌ Angel One user login failed:",
            error?.response?.data || error?.message || error
        );

        return res.status(401).json({
            success: false,
            message:
                error?.response?.data?.message ||
                "Angel One authentication failed. Check your Client ID, PIN and TOTP."
        });
    }
});

/* =========================================================
   CURRENT EMA360 SESSION
========================================================= */

app.get("/api/auth/me", (req, res) => {
    const authenticated = getAuthenticatedSession(req);

    if (!authenticated) {
        return res.status(401).json({
            success: false,
            message: "Not authenticated."
        });
    }

    return res.json({
        success: true,
        user: publicUser(authenticated.session.user),
        dataSource: "angel",
        brokerConnected: true
    });
});

/* =========================================================
   LOGOUT
========================================================= */

app.post("/api/auth/logout", async (req, res) => {
    const authenticated = getAuthenticatedSession(req);

    if (authenticated) {
        const { sessionId, session } = authenticated;

        try {
            if (session.jwtToken && session.user?.clientId) {
                await axios.post(
                    "https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/logout",
                    { clientcode: session.user.clientId },
                    {
                        headers: {
                            Authorization: `Bearer ${session.jwtToken}`,
                            "X-PrivateKey": process.env.ANGEL_API_KEY,
                            "X-UserType": "USER",
                            "X-SourceID": "WEB",
                            "X-MACAddress": "00:00:00:00:00:00",
                            "Content-Type": "application/json",
                            Accept: "application/json"
                        },
                        timeout: 10000
                    }
                );
            }
        } catch (error) {
            console.warn(
                "⚠️ Angel One logout request failed:",
                error?.response?.data?.message || error?.message
            );
        }

        stopAngelWebSocket(sessionId);
        authSessions.delete(sessionId);
    }

    clearAuthCookie(res);

    return res.json({
        success: true,
        message: "Logged out successfully."
    });
});

setInterval(() => {
    const now = Date.now();

    for (const [sessionId, session] of authSessions.entries()) {
        if (now > session.expiresAt) {
            stopAngelWebSocket(sessionId);
            authSessions.delete(sessionId);
        }
    }
}, 60 * 1000).unref();

const clients = new Map();

// Live Angel One state is kept per authenticated EMA360 session.
const angelWebSockets = new Map();
const latestTicksBySession = new Map();

let latestTicks = {};
let instrumentMaster = [];
let symbolTokens = {};

/* =========================================================
   STEP 1 — HISTORICAL DATA CACHE + RATE-LIMITED QUEUE

   Goals:
   1. Do not repeatedly request the same historical data.
   2. Share one request when multiple browser requests arrive together.
   3. Keep Angel One candle requests spaced out.
   4. Keep ONE Angel One WebSocket for live data.
========================================================= */

const historicalCache = new Map();
const historicalInFlight = new Map();

const HISTORICAL_CACHE_TTL_MS = 0;


// =========================================================
// HISTORICAL REQUEST QUEUE
// =========================================================

// Keep historical requests strictly one-at-a-time.
// 500ms = maximum 2 requests/sec.
const ANGEL_CANDLE_MIN_INTERVAL_MS = 1000;

let historicalRequestQueue = Promise.resolve();
let lastAngelCandleRequestAt = 0;


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function enqueueHistoricalRequest(requestFunction) {

    const queuedRequest =
        historicalRequestQueue.then(async () => {

            const elapsed =
                Date.now() - lastAngelCandleRequestAt;

            const wait =
                Math.max(
                    0,
                    ANGEL_CANDLE_MIN_INTERVAL_MS - elapsed
                );

            if (wait > 0) {
                await sleep(wait);
            }

            lastAngelCandleRequestAt =
                Date.now();

            return requestFunction();
        });


    // Keep the queue alive even if one request fails.
    historicalRequestQueue =
        queuedRequest.catch(() => { });


    return queuedRequest;
}


function historicalCacheKey(
    stock,
    timeframe
) {
    return `${stock}::${timeframe}`;
}


/* =========================================================
   ANGEL ONE
========================================================= */

// No global Angel One account is configured here.
// Each authenticated user gets their own SmartAPI instance.



/* =========================================================
   NIFTY 50 STOCK LIST
========================================================= */

const stocks = [
    "NIFTY 50",
    "ADANIENT",
    "ADANIPORTS",
    "APOLLOHOSP",
    "ASIANPAINT",
    "AXISBANK",
    "BAJAJ-AUTO",
    "BAJFINANCE",
    "BAJAJFINSV",
    "BEL",
    "BHARTIARTL",
    "CIPLA",
    "COALINDIA",
    "DRREDDY",
    "EICHERMOT",
    "ETERNAL",
    "GRASIM",
    "HCLTECH",
    "HDFCBANK",
    "HDFCLIFE",
    "HEROMOTOCO",
    "HINDALCO",
    "HINDUNILVR",
    "ICICIBANK",
    "INDUSINDBK",
    "INFY",
    "ITC",
    "JIOFIN",
    "JSWSTEEL",
    "KOTAKBANK",
    "LT",
    "M&M",
    "MARUTI",
    "MAXHEALTH",
    "NESTLEIND",
    "NTPC",
    "ONGC",
    "POWERGRID",
    "RELIANCE",
    "SBILIFE",
    "SBIN",
    "SHRIRAMFIN",
    "SUNPHARMA",
    "TATACONSUM",
    "TATAMOTORS",
    "TATASTEEL",
    "TCS",
    "TECHM",
    "TITAN",
    "TRENT",
    "ULTRACEMCO"
];


/* =========================================================
   INSTRUMENT MASTER
========================================================= */

async function loadInstrumentMaster() {

    console.log(
        "📚 Loading Angel One instrument master..."
    );

    const response = await fetch(
        "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
    );

    if (!response.ok) {

        throw new Error(
            `Instrument master failed: ${response.status}`
        );
    }

    instrumentMaster =
        await response.json();



    console.log(
        `📚 Instrument master loaded: ${instrumentMaster.length} instruments`
    );


    /*
       NIFTY 50 index
    */

    symbolTokens["NIFTY 50"] = {
        token: "99926000",
        exchange: "NSE",
        tradingsymbol: "NIFTY"
    };


    /*
       NSE equity stocks
    */

    for (const stock of stocks) {

        if (stock === "NIFTY 50") {
            continue;
        }

        const instrument =
            instrumentMaster.find(item =>

                String(item.exch_seg)
                    .toUpperCase() === "NSE"

                &&

                String(item.symbol)
                    .toUpperCase() ===
                `${stock}-EQ`.toUpperCase()
            );


        if (!instrument) {

            console.warn(
                `⚠️ Token not found for ${stock}`
            );

            continue;
        }


        symbolTokens[stock] = {

            token:
                String(instrument.token),

            exchange:
                "NSE",

            tradingsymbol:
                instrument.symbol

        };
    }


    /*
       Print token map
    */

    console.log(
        "\n🔑 NIFTY 50 TOKEN MAP:"
    );


    for (const stock of stocks) {

        if (symbolTokens[stock]) {

            console.log(
                `${stock} → ${symbolTokens[stock].token}`
            );

        } else {

            console.log(
                `${stock} → ❌ NOT FOUND`
            );
        }
    }


    console.log("");
}


/* =========================================================
   DATE HELPERS
========================================================= */

function formatDateIST(date) {

    const parts =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: "Asia/Kolkata",

                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }
        ).formatToParts(date);


    const values = {};


    for (const part of parts) {

        values[part.type] =
            part.value;
    }


    return (
        `${values.year}-${values.month}-${values.day}`
    );
}


function getTodayRange() {

    const date =
        formatDateIST(
            new Date()
        );


    return {

        fromdate:
            `${date} 09:15`,

        todate:
            `${date} 15:30`

    };
}


/* =========================================================
   CANDLE CONVERTER
========================================================= */

function convertCandles(data) {

    if (!Array.isArray(data)) {
        return [];
    }

    const candles = data
        .map(candle => ({
            time: candle[0],
            o: Number(candle[1]),
            h: Number(candle[2]),
            l: Number(candle[3]),
            c: Number(candle[4]),
            v: Number(candle[5])
        }))
        .filter(candle =>
            candle.time &&
            Number.isFinite(candle.o) &&
            Number.isFinite(candle.h) &&
            Number.isFinite(candle.l) &&
            Number.isFinite(candle.c) &&
            Number.isFinite(candle.v)
        );

    /*
     * ALWAYS chronological.
     */

    candles.sort(
        (a, b) =>
            new Date(a.time).getTime() -
            new Date(b.time).getTime()
    );

    /*
     * Remove duplicate timestamps.
     */

    const unique = [];
    const seen = new Set();

    for (const candle of candles) {

        const key =
            String(candle.time);

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        unique.push(candle);
    }

    return unique;
}


/* =========================================================
   ANGEL ONE LIVE WEBSOCKET — PER USER SESSION
========================================================= */

async function startAngelWebSocket(sessionId, session) {
    if (!session?.jwtToken || !session?.feedToken || !session?.user?.clientId) {
        console.warn("⚠️ Cannot start Angel One WebSocket: incomplete session tokens.");
        return;
    }

    /* Close an older socket for the same EMA360 session, if any. */
    const existing = angelWebSockets.get(sessionId);
    if (existing) {
        try { existing.close(); } catch (_) {}
        angelWebSockets.delete(sessionId);
    }

    try {
        if (!Object.keys(symbolTokens).length) {
            await loadInstrumentMaster();
        }

        const ws = new WebSocketV2({
            jwttoken: session.jwtToken,
            apikey: process.env.ANGEL_API_KEY,
            clientcode: session.user.clientId,
            feedtype: session.feedToken
        });

        angelWebSockets.set(sessionId, ws);

        await ws.connect();
        console.log(`🟢 Angel One WebSocket connected for ${session.user.clientId}`);

        const tokens = Object.values(symbolTokens)
            .map(item => String(item.token))
            .filter(Boolean);

        if (!tokens.length) {
            console.warn("⚠️ No Angel One instrument tokens available for WebSocket subscription.");
            return;
        }

        ws.fetchData({
            correlationID: `ema360-${sessionId.slice(0, 8)}`,
            action: 1,
            mode: 1,
            exchangeType: 1,
            tokens
        });

        console.log(`📡 Angel One WebSocket subscribed to ${tokens.length} instruments for ${session.user.clientId}`);

        ws.on("tick", data => {
            if (!data || typeof data !== "object") return;

            const token = String(data.token ?? "").replace(/"/g, "");
            if (!token) return;

            const rawLtp = Number(data.last_traded_price);
            const normalizedTick = {
                ...data,
                token,
                ltp: Number.isFinite(rawLtp) ? rawLtp / 100 : null
            };

            let sessionTicks = latestTicksBySession.get(sessionId);
            if (!sessionTicks) {
                sessionTicks = {};
                latestTicksBySession.set(sessionId, sessionTicks);
            }
            sessionTicks[token] = normalizedTick;

            // Keep this for backwards-compatible diagnostics only.
            latestTicks[token] = normalizedTick;

            for (const [clientRes, clientSessionId] of clients.entries()) {
                if (clientSessionId !== sessionId) continue;
                try {
                    clientRes.write(`data: ${JSON.stringify(normalizedTick)}\n\n`);
                } catch (_) {}
            }
        });

        ws.on("error", error => {
            console.error(`❌ Angel One WebSocket error for ${session.user.clientId}:`, error?.message || error);
        });

        ws.on("close", () => {
            if (angelWebSockets.get(sessionId) === ws) {
                angelWebSockets.delete(sessionId);
            }
            console.log(`🔴 Angel One WebSocket closed for ${session.user.clientId}`);
        });
    } catch (error) {
        angelWebSockets.delete(sessionId);
        console.error(`❌ Could not start Angel One WebSocket for ${session.user.clientId}:`, error?.message || error);
    }
}

function stopAngelWebSocket(sessionId) {
    const ws = angelWebSockets.get(sessionId);
    if (ws) {
        try { ws.close(); } catch (_) {}
        angelWebSockets.delete(sessionId);
    }
    latestTicksBySession.delete(sessionId);
}

/* =========================================================
   HISTORICAL DATA
========================================================= */

async function getHistoricalCandles(
    stock,
    timeframe,
    angelSession
) {

    if (!angelSession?.jwtToken) {
        throw new Error("Angel One account is not connected.");
    }

    const instrument =
        symbolTokens[stock];


    if (!instrument) {

        throw new Error(
            `No Angel One token found for ${stock}`
        );
    }


    /*
       Angel One supported intervals.

       4H / 1W / 1Month are constructed
       from lower timeframes.
    */

    /*
   Angel One supported intervals ONLY.

   These timeframes are passed directly to Angel One.
   EMA360 does NOT create/aggregate its own historical candles.
*/
    const timeframeConfig = {

        "1M": {
            interval: "ONE_MINUTE",
            days: 30
        },

        "3M": {
            interval: "THREE_MINUTE",
            days: 60
        },

        "5M": {
            interval: "FIVE_MINUTE",
            days: 100
        },

        "15M": {
            interval: "FIFTEEN_MINUTE",
            days: 200
        },

        "30M": {
            interval: "THIRTY_MINUTE",
            days: 200
        },

        "1H": {
            interval: "ONE_HOUR",
            days: 400
        },

        "1D": {
            interval: "ONE_DAY",
            days: 2000
        }

    };


    const config =
        timeframeConfig[timeframe];


    if (!config) {

        throw new Error(
            `Unsupported timeframe: ${timeframe}`
        );
    }


    /* =====================================================
       CACHE CHECK
    ===================================================== */

    const key =
        historicalCacheKey(
            stock,
            timeframe
        );


    const cached =
        historicalCache.get(key);


    if (
        cached &&

        Date.now() -
        cached.cachedAt
        <
        HISTORICAL_CACHE_TTL_MS
    ) {

        console.log(
            `♻️ CACHE HIT ${stock} ${timeframe} (${cached.data.length} candles)`
        );

        return cached.data;
    }


    /* =====================================================
       IN-FLIGHT REQUEST CHECK

       If two browser components request:

       RELIANCE + 5M

       at the same time,

       only ONE Angel One request is made.
    ===================================================== */

    if (
        historicalInFlight.has(key)
    ) {

        console.log(
            `⏳ SHARING IN-FLIGHT REQUEST ${stock} ${timeframe}`
        );

        return historicalInFlight.get(key);
    }


    /* =====================================================
       CREATE ONE REQUEST
    ===================================================== */

    const requestPromise =
        (async () => {

            try {

                const toDate = new Date();

                // If today is Saturday or Sunday,
                // use the previous Friday as the latest trading day.
                const day = toDate.getDay();

                if (day === 6) {
                    toDate.setDate(toDate.getDate() - 1);
                } else if (day === 0) {
                    toDate.setDate(toDate.getDate() - 2);
                }

                const fromDate = new Date();

                fromDate.setDate(
                    fromDate.getDate() -
                    config.days
                );

                const fromdate =
                    `${formatDateIST(fromDate)} 09:15`;

                const todate =
                    `${formatDateIST(toDate)} 15:30`;


                console.log(
                    `📊 Angel One request ${stock} ${timeframe} (${config.interval})`
                );


                console.log(
                    `   From: ${fromdate}`
                );


                console.log(
                    `   To:   ${todate}`
                );


                /*
                   Rate-limit protection.
                */


                let response = null;

                for (let attempt = 1; attempt <= 3; attempt++) {

                    response =
                        await enqueueHistoricalRequest(
                            async () => {
                                const apiResponse =
                                    await axios.post(
                                        "https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData",
                                        {
                                            exchange: instrument.exchange,
                                            symboltoken: instrument.token,
                                            interval: config.interval,
                                            fromdate,
                                            todate
                                        },
                                        {
                                            headers: {
                                                Authorization: `Bearer ${angelSession.jwtToken}`,
                                                "X-PrivateKey": process.env.ANGEL_API_KEY,
                                                "X-UserType": "USER",
                                                "X-SourceID": "WEB",
                                                "X-MACAddress": "00:00:00:00:00:00",
                                                "Content-Type": "application/json",
                                                Accept: "application/json"
                                            },
                                            timeout: 20000
                                        }
                                    );

                                return apiResponse.data;
                            }
                        );


                    // SUCCESS
                    if (
                        response &&
                        response.status === true &&
                        Array.isArray(response.data)
                    ) {
                        break;
                    }


                    // RATE LIMIT / 403
                    if (
                        response?.status === 403 ||
                        response?.errorcode === "AB1021" ||
                        response?.message === "Too many requests"
                    ) {

                        const retryDelay =
                            attempt * 2000;

                        console.warn(
                            `⚠️ Angel One rate limit for ${stock} ${timeframe}. ` +
                            `Retry ${attempt}/3 after ${retryDelay}ms`
                        );

                        await sleep(retryDelay);

                        continue;
                    }


                    // Any other error → don't retry
                    break;
                }


                if (
                    !response ||
                    !response.status ||
                    !Array.isArray(response.data)
                ) {

                    console.error("❌ ANGEL ONE RAW RESPONSE:", response);

                    console.error("❌ FAILED CANDLE REQUEST:", {
                        stock,
                        token: instrument.token,
                        exchange: instrument.exchange,
                        interval: config.interval,
                        fromdate,
                        todate
                    });


                    throw new Error(
                        response?.message ||
                        `No historical data for ${stock}`
                    );
                }


                const result =
                    convertCandles(
                        response.data
                    );


                /*
                   Save to cache.
                */

                historicalCache.set(
                    key,
                    {

                        data:
                            result,

                        cachedAt:
                            Date.now()

                    }
                );


                console.log(
                    `✅ ${stock} ${timeframe}: ${result.length} candles cached`
                );


                return result;

            }

            finally {

                historicalInFlight.delete(
                    key
                );
            }

        })();


    historicalInFlight.set(
        key,
        requestPromise
    );


    return requestPromise;
}


/* =========================================================
   TIMEFRAME AGGREGATION
========================================================= */

function aggregateCandles(
    candles,
    minutes
) {

    if (!candles.length) {
        return [];
    }


    const result = [];

    let current = null;


    for (
        const candle of candles
    ) {

        const time =
            new Date(
                candle.time
            ).getTime();


        const bucket =
            Math.floor(
                time /
                (minutes * 60 * 1000)
            )
            *
            (minutes * 60 * 1000);


        if (
            !current ||

            current.bucket !==
            bucket
        ) {

            current = {

                bucket,

                time:
                    new Date(
                        bucket
                    ).toISOString(),

                o:
                    candle.o,

                h:
                    candle.h,

                l:
                    candle.l,

                c:
                    candle.c,

                v:
                    candle.v

            };


            result.push(
                current
            );

        }

        else {

            current.h =
                Math.max(
                    current.h,
                    candle.h
                );


            current.l =
                Math.min(
                    current.l,
                    candle.l
                );


            current.c =
                candle.c;


            current.v +=
                candle.v;
        }
    }


    return result;
}


/* =========================================================
   CALENDAR AGGREGATION
========================================================= */

function aggregateCalendarCandles(
    candles,
    type
) {

    if (!candles.length) {
        return [];
    }


    const result = [];

    let current = null;


    for (
        const candle of candles
    ) {

        const date =
            new Date(
                candle.time
            );


        let key;


        /* =================================================
           WEEK
        ================================================= */

        if (
            type === "week"
        ) {

            const day =
                date.getUTCDay();


            const diff =
                day === 0
                    ? -6
                    : 1 - day;


            const monday =
                new Date(date);


            monday.setUTCDate(
                monday.getUTCDate() +
                diff
            );


            key =
                monday
                    .toISOString()
                    .slice(0, 10);
        }


        /* =================================================
           MONTH
        ================================================= */

        else {

            key =
                date
                    .toISOString()
                    .slice(0, 7);
        }


        if (
            !current ||

            current.key !== key
        ) {

            current = {

                key,

                time:
                    candle.time,

                o:
                    candle.o,

                h:
                    candle.h,

                l:
                    candle.l,

                c:
                    candle.c,

                v:
                    candle.v

            };


            result.push(
                current
            );

        }

        else {

            current.h =
                Math.max(
                    current.h,
                    candle.h
                );


            current.l =
                Math.min(
                    current.l,
                    candle.l
                );


            current.c =
                candle.c;


            current.v +=
                candle.v;
        }
    }


    return result;
}


/* =========================================================
   ANGEL ONE SERVER-WIDE LOGIN REMOVED
   ---------------------------------------------------------
   EMA360 no longer reads ANGEL_CLIENT_CODE, ANGEL_PIN or
   ANGEL_TOTP_SECRET from .env. User-specific SmartAPI sessions
   are created by /api/auth/angel/login above.
========================================================= */


/* =========================================================
   ROOT
========================================================= */

app.get(
    "/",
    (req, res) => {

        res.send(
            "EMA360 backend is running!"
        );

    }
);


/* =========================================================
   SYMBOLS
========================================================= */

app.get(
    "/api/symbols",
    (req, res) => {

        res.setHeader(
            "Access-Control-Allow-Origin",
            FRONTEND_URL
        );


        res.json(
            symbolTokens
        );

    }
);


/* =========================================================
   HISTORICAL CANDLES API
========================================================= */

app.get(
    "/api/historical-candles",
    async (req, res) => {

        res.setHeader(
            "Access-Control-Allow-Origin",
            FRONTEND_URL
        );


        try {

            const authenticated = getAuthenticatedSession(req);

            if (!authenticated?.session?.jwtToken) {
                return res.status(401).json({
                    success: false,
                    message: "Connect an Angel One account first."
                });
            }

            const stock =
                req.query.symbol;


            const timeframe =
                req.query.timeframe ||
                "5M";


            if (!stock) {

                return res
                    .status(400)
                    .json({

                        error:
                            "symbol is required"

                    });
            }


            const candles =
                await getHistoricalCandles(

                    stock,

                    timeframe,
                    authenticated.session

                );


            res.json(
                candles
            );

        }


        catch (error) {

            console.error(
                "❌ Historical candle error:",
                error
            );


            res
                .status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


/* =========================================================
   CACHE STATUS
========================================================= */

app.get(
    "/api/cache-status",
    (req, res) => {

        res.setHeader(
            "Access-Control-Allow-Origin",
            FRONTEND_URL
        );


        const entries = [];


        for (
            const [
                key,
                value
            ]
            of historicalCache.entries()
        ) {

            entries.push({

                key,

                candles:
                    value.data.length,

                ageMs:
                    Date.now() -
                    value.cachedAt

            });
        }


        res.json({

            cacheEntries:
                entries.length,

            inFlight:
                historicalInFlight.size,

            minCandleRequestIntervalMs:
                ANGEL_CANDLE_MIN_INTERVAL_MS,

            cacheTtlMs:
                HISTORICAL_CACHE_TTL_MS,

            entries

        });

    }
);


/* =========================================================
   LIVE STREAM
========================================================= */

app.get(
    "/api/stream",
    (req, res) => {

        res.setHeader(
            "Content-Type",
            "text/event-stream"
        );


        res.setHeader(
            "Cache-Control",
            "no-cache"
        );


        res.setHeader(
            "Connection",
            "keep-alive"
        );


        res.setHeader(
            "Access-Control-Allow-Origin",
            FRONTEND_URL
        );


        res.flushHeaders();


        res.write(
            ": connected\n\n"
        );


        const authenticated = getAuthenticatedSession(req);

        if (!authenticated) {
            return res.status(401).end();
        }

        const sessionId = authenticated.sessionId;
        clients.set(res, sessionId);

        console.log(
            `🌐 Browser connected to live stream for ${authenticated.session.user.clientId}`
        );


        /*
           Immediately send the latest
           known ticks.

           This means a newly opened
           browser does not have to wait
           for the next Angel One tick.
        */

        const sessionTicks =
            latestTicksBySession.get(sessionId) || {};

        for (
            const tick
            of Object.values(
                sessionTicks
            )
        ) {

            try {

                res.write(
                    `data: ${JSON.stringify(tick)}\n\n`
                );

            }

            catch (error) {

                console.error(
                    "❌ Failed to send initial tick:",
                    error
                );

            }
        }


        /* =================================================
           HEARTBEAT
        ================================================= */

        const heartbeat =
            setInterval(
                () => {

                    try {

                        res.write(
                            `event: heartbeat\ndata: ${JSON.stringify({
                                message:
                                    "EMA360 stream is alive"
                            })}\n\n`
                        );

                    }

                    catch (error) {

                        console.error(
                            "❌ Heartbeat failed:",
                            error
                        );

                    }

                },

                15000
            );


        /* =================================================
           CLIENT DISCONNECT
        ================================================= */

        req.on(
            "close",
            () => {

                clearInterval(
                    heartbeat
                );


                clients.delete(
                    res
                );


                console.log(
                    "🌐 Browser disconnected"
                );

            }
        );

    }
);

// ============================================================
// NSE SCANNER - NSE ONLY
// ============================================================

function normalizeNseCandles(response) {
    if (!response) return [];

    const rawData = Array.isArray(response)
        ? response
        : Array.isArray(response.data)
            ? response.data
            : [];

    return rawData
        .map((candle) => ({
            time: Number(candle.time),
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close),
            volume: Number(candle.volume),
        }))
        .filter(
            (candle) =>
                Number.isFinite(candle.time) &&
                Number.isFinite(candle.open) &&
                Number.isFinite(candle.high) &&
                Number.isFinite(candle.low) &&
                Number.isFinite(candle.close) &&
                Number.isFinite(candle.volume)
        )
        .sort((a, b) => a.time - b.time);
}

const NSE_COMPANY_CACHE = new Map();

async function getNseCompanyName(symbol) {

    if (NSE_COMPANY_CACHE.has(symbol)) {
        return NSE_COMPANY_CACHE.get(symbol);
    }

    try {

        const details =
            await nseIndia.getEquityDetails(symbol);

        const companyName =
            details?.info?.companyName ||
            details?.companyName ||
            symbol;

        NSE_COMPANY_CACHE.set(
            symbol,
            companyName
        );

        return companyName;

    } catch (error) {

        console.log(
            `Company name lookup failed for ${symbol}:`,
            error.message
        );

        return symbol;
    }
}

// ------------------------------------------------------------
// GET ALL NSE EQUITY STOCK SYMBOLS
// ------------------------------------------------------------
async function getNseStocks() {
    if (NSE_STOCKS_CACHE.length > 0) {
        return NSE_STOCKS_CACHE;
    }

    console.log("Fetching complete NSE stock list...");

    const symbols = await nseIndia.getAllStockSymbols();

    NSE_STOCKS_CACHE = [...new Set(
        symbols
            .map((symbol) => String(symbol).trim().toUpperCase())
            .filter(Boolean)
    )];

    console.log(
        `NSE stock universe loaded: ${NSE_STOCKS_CACHE.length} stocks`
    );

    return NSE_STOCKS_CACHE;
}

// ============================================================
// BUILD NSE PRIORITY LIST
// ============================================================
//
// Purpose:
//
// 1. Get the complete NSE stock universe.
// 2. Get the latest NSE daily price/change for each stock.
// 3. Sort stocks by % change, highest first.
// 4. Cache the result so every scan does NOT rebuild it.
//
// The scanner frontend will use this list to scan high-change
// stocks first.
//
// IMPORTANT:
// This is ONLY for scan ordering.
// It does NOT decide whether a stock passes the condition.
// The normal candle condition check still happens later.
// ============================================================

async function getNsePriorityStocks() {

    const now = Date.now();

    // --------------------------------------------------------
    // RETURN CACHE IF IT IS STILL FRESH
    // --------------------------------------------------------

    if (
        NSE_PRIORITY_CACHE.length > 0 &&
        (now - NSE_PRIORITY_CACHE_TIME) <
        NSE_PRIORITY_CACHE_TTL_MS
    ) {

        console.log(
            `⚡ Using cached NSE priority list: ${NSE_PRIORITY_CACHE.length} stocks`
        );

        return NSE_PRIORITY_CACHE;
    }


    // --------------------------------------------------------
    // IF ANOTHER REQUEST IS ALREADY BUILDING THE LIST,
    // WAIT FOR THAT SAME REQUEST.
    // --------------------------------------------------------

    if (NSE_PRIORITY_INFLIGHT) {

        console.log(
            "⏳ NSE priority list is already being built. Waiting..."
        );

        return NSE_PRIORITY_INFLIGHT;
    }


    // --------------------------------------------------------
    // BUILD ONLY ONCE
    // --------------------------------------------------------

    NSE_PRIORITY_INFLIGHT =
        (async () => {

            try {

                console.log(
                    "🚀 Building NSE priority list..."
                );


                const symbols =
                    await getNseStocks();


                console.log(
                    `📊 NSE priority calculation started for ${symbols.length} stocks`
                );


                const results = [];

                let cursor = 0;

                // ------------------------------------------------
                // LIMITED CONCURRENCY
                // ------------------------------------------------
                //
                // We do NOT fire 2000 requests at once.
                // A small number of workers keeps NSE requests
                // controlled while still being much faster than
                // checking every stock one-by-one.
                // ------------------------------------------------

                const WORKERS = 6;


                async function worker() {

                    while (true) {

                        const index =
                            cursor++;


                        if (
                            index >=
                            symbols.length
                        ) {

                            return;
                        }


                        const symbol =
                            symbols[index];


                        try {

                            const today =
                                new Date();


                            // We only need a few recent trading
                            // days because we need the latest
                            // close and previous close.

                            const start =
                                new Date(
                                    today.getTime() -
                                    10 *
                                    24 *
                                    60 *
                                    60 *
                                    1000
                                );


                            const dailyResponse =
                                await nseIndia.getEquityHistoricalData(
                                    symbol,
                                    {
                                        start,
                                        end: today
                                    }
                                );


                            // ------------------------------------------------
                            // NSE RESPONSE CAN BE:
                            //
                            // [
                            //   {
                            //      data: [...]
                            //   }
                            // ]
                            //
                            // ------------------------------------------------

                            let dailyRaw = [];


                            if (
                                Array.isArray(
                                    dailyResponse
                                )
                            ) {

                                dailyRaw =
                                    dailyResponse.flatMap(
                                        item =>
                                            Array.isArray(
                                                item?.data
                                            )
                                                ? item.data
                                                : []
                                    );

                            }

                            else if (
                                Array.isArray(
                                    dailyResponse?.data
                                )
                            ) {

                                dailyRaw =
                                    dailyResponse.data;

                            }


                            if (
                                dailyRaw.length === 0
                            ) {

                                return;
                            }


                            // ------------------------------------------------
                            // PARSE DAILY DATA
                            // ------------------------------------------------

                            const daily =
                                dailyRaw
                                    .map(row => {

                                        const date =
                                            row.mTIMESTAMP ||
                                            row.mtimestamp ||
                                            row.CH_TIMESTAMP ||
                                            row.chTimestamp ||
                                            row.date ||
                                            row.timestamp;


                                        const close =
                                            Number(
                                                row.CH_CLOSING_PRICE ??
                                                row.chClosingPrice ??
                                                row.close ??
                                                row.CLOSE ??
                                                0
                                            );


                                        const previousClose =
                                            Number(
                                                row.CH_PREVIOUS_CLS_PRICE ??
                                                row.chPreviousClsPrice ??
                                                row.previousClose ??
                                                row.PREVIOUS_CLOSE ??
                                                0
                                            );


                                        return {
                                            date,
                                            close,
                                            previousClose
                                        };

                                    })

                                    .filter(row =>

                                        row.date &&

                                        Number.isFinite(
                                            row.close
                                        ) &&

                                        row.close > 0

                                    )

                                    .sort(
                                        (a, b) =>
                                            new Date(
                                                a.date
                                            ).getTime()
                                            -
                                            new Date(
                                                b.date
                                            ).getTime()
                                    );


                            if (
                                daily.length === 0
                            ) {

                                return;
                            }


                            // ------------------------------------------------
                            // LATEST TRADING DAY
                            // ------------------------------------------------

                            const latest =
                                daily[
                                    daily.length - 1
                                ];


                            let previousClose =
                                Number(
                                    latest.previousClose
                                );


                            // If NSE did not provide previous
                            // close inside the latest row,
                            // use the previous daily candle.

                            if (
                                !Number.isFinite(
                                    previousClose
                                ) ||
                                previousClose <= 0
                            ) {

                                if (
                                    daily.length >= 2
                                ) {

                                    previousClose =
                                        Number(
                                            daily[
                                                daily.length - 2
                                            ].close
                                        );

                                }

                            }


                            const price =
                                Number(
                                    latest.close
                                );


                            if (
                                !Number.isFinite(
                                    price
                                ) ||
                                price <= 0 ||
                                !Number.isFinite(
                                    previousClose
                                ) ||
                                previousClose <= 0
                            ) {

                                return;
                            }


                            // ------------------------------------------------
                            // CALCULATE % CHANGE
                            // ------------------------------------------------

                            const change =
                                (
                                    (
                                        price -
                                        previousClose
                                    ) /
                                    previousClose
                                ) *
                                100;


                            if (
                                !Number.isFinite(
                                    change
                                )
                            ) {

                                return;
                            }


                            results.push({

                                symbol,

                                price,

                                previousClose,

                                change

                            });


                        }

                        catch (error) {

                            console.log(
                                `Priority change failed for ${symbol}:`,
                                error.message
                            );

                        }

                    }

                }


                // ------------------------------------------------
                // START LIMITED WORKERS
                // ------------------------------------------------

                const workers =
                    Array.from(
                        {
                            length:
                                Math.min(
                                    WORKERS,
                                    symbols.length
                                )
                        },
                        () => worker()
                    );


                await Promise.all(
                    workers
                );


                // ------------------------------------------------
                // SORT HIGHEST % CHANGE FIRST
                // ------------------------------------------------

                results.sort(
                    (a, b) =>
                        Number(b.change) -
                        Number(a.change)
                );


                // ------------------------------------------------
                // SAVE CACHE
                // ------------------------------------------------

                NSE_PRIORITY_CACHE =
                    results;

                NSE_PRIORITY_CACHE_TIME =
                    Date.now();


                console.log(
                    `✅ NSE priority list ready: ${results.length} stocks`
                );


                if (
                    results.length > 0
                ) {

                    console.log(
                        "🔥 TOP NSE PRIORITY STOCKS:",
                        results
                            .slice(0, 20)
                            .map(
                                item =>
                                    `${item.symbol} ${item.change.toFixed(2)}%`
                            )
                    );

                }


                return results;

            }

            finally {

                NSE_PRIORITY_INFLIGHT =
                    null;

            }

        })();


    return NSE_PRIORITY_INFLIGHT;
}


// ============================================================
// MAGIC FILTER PARSER
// ============================================================
// Converts natural English / Hinglish / common broken-English
// scanner requests into the SAME condition objects used by the
// React scanner. This deliberately uses no paid AI service and
// therefore requires no API key.
// ============================================================

function normalizeMagicPrompt(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[×✕]/g, "x")
        .replace(/₹/g, " rs ")
        .replace(/%/g, " percent ")
        .replace(/[“”‘’]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function magicNumber(value, fallback = null) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function magicTimeframeFromText(text) {
    const normalized = text
        .replace(/minutes?/g, "m")
        .replace(/mins?/g, "m")
        .replace(/hours?/g, "h")
        .replace(/hrs?/g, "h")
        .replace(/daily|day|1 day/g, "1d");

    const match = normalized.match(/\b(1|3|5|15|30|60)\s*(m|h)\b/);
    if (!match) {
        if (/\b5\s*minute|\b5m\b/.test(text)) return "5m";
        if (/\b15\s*minute|\b15m\b/.test(text)) return "15m";
        if (/\b30\s*minute|\b30m\b/.test(text)) return "30m";
        if (/\b1\s*hour|\b1h\b/.test(text)) return "1h";
        if (/\bdaily\b|\b1d\b|\bday\b/.test(text)) return "1d";
        if (/\b3\s*minute|\b3m\b/.test(text)) return "3m";
        if (/\b1\s*minute|\b1m\b/.test(text)) return "1m";
        return null;
    }

    if (match[2] === "h") {
        return match[1] === "1" ? "1h" : null;
    }

    return `${match[1]}m`;
}

function magicConditionKey(condition) {
    return JSON.stringify({
        type: condition.type,
        value: condition.value ?? null,
        period: condition.period ?? null,
        multiplier: condition.multiplier ?? null
    });
}

function parseMagicFilterPrompt(prompt) {
    const text = normalizeMagicPrompt(prompt);
    const conditions = [];
    const explanations = [];

    const add = (condition, explanation) => {
        if (!condition || !condition.type) return;
        const key = magicConditionKey(condition);
        if (!conditions.some(item => magicConditionKey(item) === key)) {
            conditions.push(condition);
            explanations.push(explanation);
        }
    };

    const timeframe = magicTimeframeFromText(text);

    // ------------------------------------------------------------
    // Five consecutive green candles
    // ------------------------------------------------------------
    if (
        /(?:5|five)\s*(?:consecutive\s*)?(?:green|bullish)\s*candles?/.test(text) ||
        /(?:5|five)\s*(?:green|bullish)\s*(?:candle|candles)/.test(text) ||
        /5\s*green\s*(?:hai|ho|hona|hove)/.test(text)
    ) {
        add(
            { type: "five_green" },
            "5 consecutive green candles"
        );
    }

    // ------------------------------------------------------------
    // Volume > multiplier × SMA(volume, period)
    // Examples:
    // 5 min volume 2x sma 10
    // volume double average
    // 5 min ka volume sma 10 se 2 guna zyada
    // ------------------------------------------------------------
    const volumeMultiplierPatterns = [
        /volume.{0,80}?(\d+(?:\.\d+)?)\s*x.{0,40}?(?:sma|average|avg)/,
        /(?:sma|average|avg).{0,30}?volume.{0,50}?(\d+(?:\.\d+)?)\s*x/,
        /volume.{0,80}?(?:double|twice|2\s*times|2\s*guna|2\s*gun|do\s*guna).{0,40}?(?:average|avg|sma)/,
        /(?:average|avg|sma).{0,40}?(?:se|than|ke).{0,20}?(?:volume|volume\s*ka).{0,50}?(?:double|2\s*times|2\s*guna)/
    ];

    let volumeMultiplier = null;
    for (const pattern of volumeMultiplierPatterns) {
        const match = text.match(pattern);
        if (match) {
            volumeMultiplier = magicNumber(match[1], 2);
            if (!match[1]) volumeMultiplier = 2;
            break;
        }
    }

    if (volumeMultiplier !== null) {
        let period = 10;
        const periodMatch = text.match(/(?:sma|average|avg)[^0-9]{0,20}(\d{1,3})/);
        if (periodMatch) period = magicNumber(periodMatch[1], 10);

        add(
            {
                type: "volume_multiple_sma",
                multiplier: volumeMultiplier,
                period
            },
            `Volume > ${volumeMultiplier} × SMA(Volume,${period})`
        );
    } else if (
        /rising\s+volume|increasing\s+volume|volume\s+(?:is\s+)?(?:rising|increasing|high|strong)|volume\s*(?:badh|badha|zyada|jyada|high)|volume\s+(?:upar|up)/.test(text)
    ) {
        const periodMatch = text.match(/(?:sma|average|avg)[^0-9]{0,20}(\d{1,3})/);
        const period = magicNumber(periodMatch?.[1], 10);
        add(
            { type: "volume_above_sma", period },
            `Volume > SMA(Volume,${period})`
        );
    }

    // ------------------------------------------------------------
    // Close / price above or below EMA N
    // ------------------------------------------------------------
    const emaAbove =
        text.match(/(?:close|price|stock).{0,60}(?:above|over|greater\s+than|higher\s+than|upar|ke\s+upar|se\s+upar).{0,20}?(?:ema|exponential\s+moving\s+average)\s*(\d{1,3})/) ||
        text.match(/(?:ema|exponential\s+moving\s+average)\s*(\d{1,3}).{0,40}(?:above|upar|ke\s+upar)/) ||
        text.match(/(?:\b\d{1,3}\s*)?(?:ema|exponential\s+moving\s+average)\s*(\d{1,3})?\s*(?:ke\s+)?(?:upar|above)/) ||
        text.match(/\b(\d{1,3})\s*(?:ema|exponential\s+moving\s+average)\s*(?:ke\s+)?(?:upar|above)/);

    if (emaAbove) {
        const period = magicNumber(emaAbove[1], 20);
        add(
            { type: "close_above_ema", period },
            `Close > EMA ${period}`
        );
    }

    const emaBelow =
        text.match(/(?:close|price|stock).{0,60}(?:below|under|less\s+than|lower\s+than|neeche|niche|ke\s+neeche|se\s+neeche).{0,20}?(?:ema|exponential\s+moving\s+average)\s*(\d{1,3})/) ||
        text.match(/(?:ema|exponential\s+moving\s+average)\s*(\d{1,3}).{0,40}(?:below|neeche|niche|ke\s+neeche)/) ||
        text.match(/\b(\d{1,3})\s*(?:ema|exponential\s+moving\s+average)\s*(?:ke\s+)?(?:neeche|niche|below)/);

    if (emaBelow) {
        const period = magicNumber(emaBelow[1], 20);
        add(
            { type: "close_below_ema", period },
            `Close < EMA ${period}`
        );
    }

    // Exact existing shorthand: close above EMA 20 / close below EMA 20.
    if (/(?:close|price).{0,15}(?:>|above).{0,15}ema\s*20/.test(text)) {
        add({ type: "close_above_ema", period: 20 }, "Close > EMA 20");
    }
    if (/(?:close|price).{0,15}(?:<|below).{0,15}ema\s*20/.test(text)) {
        add({ type: "close_below_ema", period: 20 }, "Close < EMA 20");
    }

    // ------------------------------------------------------------
    // Price above / below a numeric value
    // ------------------------------------------------------------
    const priceAbove =
        text.match(/(?:price|stock|share|close).{0,30}(?:above|over|greater\s+than|higher\s+than|upar|ke\s+upar|se\s+upar|>)\s*(?:rs\s*)?(\d+(?:\.\d+)?)/) ||
        text.match(/(?:above|over|upar|ke\s+upar)\s*(?:rs\s*)?(\d+(?:\.\d+)?)/) ||
        text.match(/(?:price|stock|share|close)\s*(?:is\s*)?(?:rs\s*)?(\d+(?:\.\d+)?)\s*(?:(?:ke|se)\s+)?(?:upar|above|over)/);

    if (priceAbove) {
        const value = magicNumber(priceAbove[1]);
        if (value !== null) add({ type: "price_above", value }, `Price > ${value}`);
    }

    const priceBelow =
        text.match(/(?:price|stock|share|close).{0,30}(?:below|under|less\s+than|lower\s+than|neeche|niche|ke\s+neeche|se\s+neeche|<)\s*(?:rs\s*)?(\d+(?:\.\d+)?)/) ||
        text.match(/(?:below|under|neeche|niche|ke\s+neeche)\s*(?:rs\s*)?(\d+(?:\.\d+)?)/) ||
        text.match(/(?:price|stock|share|close)\s*(?:is\s*)?(?:rs\s*)?(\d+(?:\.\d+)?)\s*(?:(?:ke|se)\s+)?(?:neeche|niche|below|under)/);

    if (priceBelow) {
        const value = magicNumber(priceBelow[1]);
        if (value !== null) add({ type: "price_below", value }, `Price < ${value}`);
    }

    // ------------------------------------------------------------
    // % change / momentum
    // ------------------------------------------------------------
    const changeAbove =
        text.match(/(?:up|gain|gained|increase|increased|rising|badh|badha|upar).{0,35}?(?:by|of|se|more\s+than|above)?\s*(\d+(?:\.\d+)?)\s*(?:percent|per\s*cent|pct)/) ||
        text.match(/(?:change|percent\s*change).{0,30}(?:above|over|greater\s+than|>)\s*(\d+(?:\.\d+)?)\s*(?:percent|pct)?/);

    if (changeAbove) {
        const value = magicNumber(changeAbove[1]);
        if (value !== null) add({ type: "change_above", value }, `% Change > ${value}%`);
    }

    const changeBelow =
        text.match(/(?:down|fall|fell|decrease|decreased|falling|gir|gira|neeche).{0,35}?(?:by|of|se|more\s+than|below)?\s*(\d+(?:\.\d+)?)\s*(?:percent|per\s*cent|pct)/) ||
        text.match(/(?:change|percent\s*change).{0,30}(?:below|under|less\s+than|<)\s*(\d+(?:\.\d+)?)\s*(?:percent|pct)?/);

    if (changeBelow) {
        const value = magicNumber(changeBelow[1]);
        if (value !== null) add({ type: "change_below", value }, `% Change < ${value}%`);
    }

    // "stocks going upwards" / "upar ja rahe stocks" = positive daily change.
    if (
        !conditions.some(c => c.type === "change_above") &&
        /stocks?.{0,20}(?:going|moving|trading|ja|chal).{0,30}(?:up|upwards|upar|badh|positive)/.test(text) ||
        /(?:stocks?|shares?).{0,20}(?:upar|badh|badhe|chadh).{0,20}(?:rahe|rhe|hai|hain)/.test(text)
    ) {
        add({ type: "change_above", value: 0 }, "% Change > 0%");
    }

    if (
        !conditions.some(c => c.type === "change_below") &&
        /stocks?.{0,20}(?:going|moving|trading).{0,30}(?:down|downwards|neeche|falling|negative)/.test(text)
    ) {
        add({ type: "change_below", value: 0 }, "% Change < 0%");
    }

    // ------------------------------------------------------------
    // If the user says only "volume 2x" without explicitly saying
    // SMA/average, treat it as the common 10-period volume average.
    // ------------------------------------------------------------
    if (
        volumeMultiplier === null &&
        !conditions.some(c => c.type === "volume_above_sma") &&
        /volume.{0,20}(?:2x|2\s*times|double|twice|2\s*guna|2\s*gun)/.test(text)
    ) {
        add(
            { type: "volume_multiple_sma", multiplier: 2, period: 10 },
            "Volume > 2 × SMA(Volume,10)"
        );
    }

    return {
        success: conditions.length > 0,
        timeframe: timeframe || null,
        conditions,
        explanations,
        normalizedPrompt: text,
        message: conditions.length > 0
            ? "Magic Filter understood the request."
            : "I could not map that sentence to a supported scanner condition yet. Try mentioning volume, SMA, EMA, price, % change, green candles, above/upar, or below/neeche."
    };
}

// ============================================================
// SERVER-SIDE CONDITION HELPERS
// Used by the NSE backtest. The live React scanner has its own
// equivalent checks so normal scanning behavior stays unchanged.
// ============================================================

function serverSma(values, period) {
    if (!Array.isArray(values) || values.length < period) return null;
    const recent = values.slice(-period).map(Number);
    if (recent.some(value => !Number.isFinite(value))) return null;
    return recent.reduce((sum, value) => sum + value, 0) / period;
}

function serverEma(values, period) {
    if (!Array.isArray(values) || values.length < period) return null;
    const multiplier = 2 / (period + 1);
    let result = values.slice(0, period).reduce((sum, value) => sum + Number(value), 0) / period;
    for (let i = period; i < values.length; i++) {
        const value = Number(values[i]);
        if (!Number.isFinite(value)) return null;
        result = ((value - result) * multiplier) + result;
    }
    return result;
}

function serverDateKey(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}

function buildDailyChangeMap(candles) {
    const byDay = new Map();

    for (const candle of candles) {
        const day = serverDateKey(candle.time);
        if (!day) continue;
        byDay.set(day, Number(candle.close));
    }

    const days = [...byDay.keys()].sort();
    const map = new Map();

    for (let i = 1; i < days.length; i++) {
        const previousClose = Number(byDay.get(days[i - 1]));
        const currentClose = Number(byDay.get(days[i]));
        if (previousClose > 0 && Number.isFinite(currentClose)) {
            map.set(
                days[i],
                ((currentClose - previousClose) / previousClose) * 100
            );
        }
    }

    return map;
}

function checkServerCondition(condition, candles, dailyChangeMap, currentIndex) {
    const history = candles.slice(0, currentIndex + 1);
    const closes = history.map(c => Number(c.close));
    const volumes = history.map(c => Number(c.volume));
    const latestClose = closes[closes.length - 1];
    const latestVolume = volumes[volumes.length - 1];

    if (!condition || !history.length) return false;

    if (condition.type === "close_above_ema20" || condition.type === "close_above_ema") {
        const period = Number(condition.period || 20);
        const value = serverEma(closes, period);
        return value !== null && latestClose > value;
    }

    if (condition.type === "close_below_ema20" || condition.type === "close_below_ema") {
        const period = Number(condition.period || 20);
        const value = serverEma(closes, period);
        return value !== null && latestClose < value;
    }

    if (condition.type === "volume_2x_sma10") {
        const value = serverSma(volumes, 10);
        return value !== null && latestVolume > (2 * value);
    }

    if (condition.type === "volume_multiple_sma") {
        const period = Number(condition.period || 10);
        const multiplier = Number(condition.multiplier || 2);
        const value = serverSma(volumes, period);
        return value !== null && latestVolume > (multiplier * value);
    }

    if (condition.type === "volume_above_sma") {
        const period = Number(condition.period || 10);
        const value = serverSma(volumes, period);
        return value !== null && latestVolume > value;
    }

    if (condition.type === "five_green") {
        if (history.length < 5) return false;
        return history.slice(-5).every(c => Number(c.close) > Number(c.open));
    }

    if (condition.type === "price_above") {
        return latestClose > Number(condition.value);
    }

    if (condition.type === "price_below") {
        return latestClose < Number(condition.value);
    }

    if (condition.type === "change_above" || condition.type === "change_below") {
        const day = serverDateKey(history[history.length - 1].time);
        const change = Number(dailyChangeMap?.get(day));
        if (!Number.isFinite(change)) return false;
        const value = Number(condition.value || 0);
        return condition.type === "change_above" ? change > value : change < value;
    }

    return false;
}

// ------------------------------------------------------------
// GET NSE TOKEN FOR SYMBOL
// ------------------------------------------------------------
async function getNseToken(symbol) {
    if (NSE_TOKEN_CACHE.has(symbol)) {
        return NSE_TOKEN_CACHE.get(symbol);
    }

    try {
        const info = await nseIndia.getEquitySymbolInfo(symbol);

        if (!info || !info.scripcode) {
            console.log(`No NSE token found for ${symbol}`);
            return null;
        }

        const token = String(info.scripcode);

        NSE_TOKEN_CACHE.set(symbol, token);

        return token;
    } catch (error) {
        console.log(
            `Token lookup failed for ${symbol}:`,
            error.message
        );

        return null;
    }
}


function keepOnlyCompletedCandles(candles, timeframe) {

    if (!Array.isArray(candles) || candles.length === 0) {
        return [];
    }

    const minutes = {
        "1m": 1,
        "3m": 3,
        "5m": 5,
        "15m": 15,
        "30m": 30,
        "1h": 60
    }[timeframe];

    if (!minutes) {
        return candles;
    }

    const intervalMs =
        minutes * 60 * 1000;

    const nowMs = Date.now();

    const completed = candles.filter(candle => {

        const timeMs =
            new Date(candle.time).getTime();

        if (!Number.isFinite(timeMs)) {
            return false;
        }

        return (
            timeMs + intervalMs <= nowMs
        );
    });

    // ---------------------------------------------------------
    // Remove only the NSE 15:30 closing/post-market candle
    // if it is the LAST candle in the completed series.
    //
    // Do NOT remove all historical candles after 15:30.
    // ---------------------------------------------------------

    if (completed.length > 0) {

        const last =
            completed[completed.length - 1];

        const lastDate =
            new Date(last.time);

        const istParts =
            new Intl.DateTimeFormat(
                "en-GB",
                {
                    timeZone: "Asia/Kolkata",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false
                }
            ).formatToParts(lastDate);

        const hour =
            Number(
                istParts.find(
                    p => p.type === "hour"
                )?.value
            );

        const minute =
            Number(
                istParts.find(
                    p => p.type === "minute"
                )?.value
            );

        if (
            hour === 15 &&
            minute >= 30
        ) {
            completed.pop();
        }
    }

    return completed;
}


// ------------------------------------------------------------
// FETCH NSE CANDLES FOR SELECTED TIMEFRAME
// ------------------------------------------------------------
async function getNseCandles(symbol, timeframe = "5m", includeIncomplete = false) {
    try {
        const token = await getNseToken(symbol);

        console.log(
            "DIAGNOSTIC TOKEN:",
            symbol,
            "=>",
            token
        );

        if (!token) {
            console.log(
                "❌ NO NSE TOKEN FOR:",
                symbol
            );

            return [];
        }

        /*
         * Large warm-up windows are intentional. Chartink calculates
         * indicators from a historical intraday series; using only the
         * latest 10 days can make EMA20 differ at the latest candle.
         */
        const timeframeConfig = {
            "1m": {
                interval: 1,
                days: 15
            },

            "3m": {
                interval: 3,
                days: 30
            },

            "5m": {
                interval: 5,
                days: 60
            },

            "15m": {
                interval: 15,
                days: 120
            },

            "30m": {
                interval: 30,
                days: 180
            },

            "1h": {
                interval: 60,
                days: 365
            },

            "1d": {
                interval: "D",
                days: 1000
            }
        };

        const config = timeframeConfig[timeframe];

        if (!config) {
            throw new Error(
                `Unsupported NSE timeframe: ${timeframe}`
            );
        }

        const now = new Date();

        const start = new Date(
            now.getTime() -
            config.days * 24 * 60 * 60 * 1000
        );

        const response =
            await nseIndia.getEquityChartHistoricalData(
                symbol,
                {
                    start,
                    end: now,
                },
                token,
                "Equity",
                "I",
                config.interval
            );

        console.log(
            "NSE RAW RESPONSE:",
            symbol,
            "type =",
            Array.isArray(response)
                ? "ARRAY"
                : typeof response,
            "length =",
            Array.isArray(response)
                ? response.length
                : Array.isArray(response?.data)
                    ? response.data.length
                    : "NO DATA ARRAY"
        );

        const candles = normalizeNseCandles(response);

        console.log(
            "NSE NORMALIZED:",
            symbol,
            "candles =",
            candles.length
        );

        if (candles.length > 0) {
            console.log(
                "NSE FIRST CANDLE:",
                candles[0]
            );

            console.log(
                "NSE LAST CANDLE:",
                candles[candles.length - 1]
            );
        }

        // Normal scanner behavior:
        // only completed candles are returned.
        //
        // Diagnostic mode:
        // return the raw NSE series, including the latest
        // possibly-incomplete candle.
        return includeIncomplete
            ? candles
            : keepOnlyCompletedCandles(candles, timeframe);

    } catch (error) {

        console.log(
            `NSE ${timeframe} candle fetch failed for ${symbol}:`,
            error.message
        );

        return [];
    }
}

function getIstDateKey(value) {
    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
        return null;
    }

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}

// ------------------------------------------------------------
// NSE RESULT DISPLAY STATS
// ------------------------------------------------------------
//
// Scanner condition:
//     NSE 5-minute candles
//
// Result table:
//     NSE DAILY historical data
//
// price        = latest NSE daily closing price
// previousClose= NSE previous closing price
// change       = calculated from those two values
// dailyVolume  = NSE daily traded quantity
//
// IMPORTANT:
// getEquityHistoricalData() returns:
//
// [
//   {
//      data: [ ...daily rows... ],
//      meta: {...}
//   }
// ]
//
// Therefore we MUST extract response[0].data.
// ------------------------------------------------------------

async function getNseResultStatsFromCandles(symbol, candles) {

    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {
        return null;
    }


    // ========================================================
    // FETCH DAILY NSE DATA
    // ========================================================

    try {

        const today =
            new Date();


        const start =
            new Date(
                today.getTime() -
                10 * 24 * 60 * 60 * 1000
            );


        const dailyResponse =
            await nseIndia.getEquityHistoricalData(
                symbol,
                {
                    start,
                    end: today
                }
            );


        console.log(
            `NSE DAILY RAW ${symbol}:`,
            JSON.stringify(
                dailyResponse,
                null,
                2
            )
        );


        // ====================================================
        // IMPORTANT:
        //
        // Response structure is:
        //
        // [
        //   {
        //      data: [...]
        //      meta: {...}
        //   }
        // ]
        // ====================================================

        let dailyRaw = [];


        if (
            Array.isArray(dailyResponse)
        ) {

            dailyRaw =
                dailyResponse.flatMap(
                    item =>
                        Array.isArray(item?.data)
                            ? item.data
                            : []
                );

        }

        else if (
            Array.isArray(
                dailyResponse?.data
            )
        ) {

            dailyRaw =
                dailyResponse.data;

        }


        console.log(
            `NSE DAILY ROWS ${symbol}:`,
            dailyRaw.length
        );


        if (
            dailyRaw.length > 0
        ) {

            console.log(
                `NSE DAILY FIRST ROW ${symbol}:`,
                dailyRaw[0]
            );

            console.log(
                `NSE DAILY LAST ROW ${symbol}:`,
                dailyRaw[
                    dailyRaw.length - 1
                ]
            );

        }


        // ====================================================
        // PARSE DAILY ROWS
        // ====================================================

        const daily =
            dailyRaw
                .map(row => {

                    return {

                        date:
                            row.mTIMESTAMP ||
                            row.mtimestamp ||
                            row.CH_TIMESTAMP ||
                            row.chTimestamp ||
                            row.date ||
                            row.timestamp,


                        close:
                            Number(
                                row.CH_CLOSING_PRICE ??
                                row.chClosingPrice ??
                                row.close ??
                                row.CLOSE ??
                                0
                            ),


                        previousClose:
                            Number(
                                row.CH_PREVIOUS_CLS_PRICE ??
                                row.chPreviousClsPrice ??
                                row.previousClose ??
                                row.PREVIOUS_CLOSE ??
                                0
                            ),


                        volume:
                            Number(
                                row.CH_TOT_TRADED_QTY ??
                                row.chTotTradedQty ??
                                row.totalTradedQuantity ??
                                row.volume ??
                                row.TOT_TRADED_QTY ??
                                0
                            )

                    };

                })

                .filter(row =>

                    Number.isFinite(
                        row.close
                    )

                    &&

                    row.close > 0

                    &&

                    Number.isFinite(
                        row.volume
                    )

                )

                .sort(
                    (a, b) =>
                        new Date(
                            a.date
                        ).getTime()
                        -
                        new Date(
                            b.date
                        ).getTime()
                );


        console.log(
            `NSE DAILY PARSED ${symbol}:`,
            daily
        );


        // ====================================================
        // GET LATEST NSE TRADING DAY
        // ====================================================

        if (
            daily.length > 0
        ) {

            const latestDaily =
                daily[
                    daily.length - 1
                ];


            // ------------------------------------------------
            // NSE historical row already contains
            // PREVIOUS CLOSE.
            // ------------------------------------------------

            let previousClose =
                Number(
                    latestDaily.previousClose
                );


            // ------------------------------------------------
            // Safety fallback:
            // previous daily candle
            // ------------------------------------------------

            if (
                !Number.isFinite(
                    previousClose
                )
                ||
                previousClose <= 0
            ) {

                if (
                    daily.length >= 2
                ) {

                    previousClose =
                        Number(
                            daily[
                                daily.length - 2
                            ].close
                        );

                }

            }


            const price =
                Number(
                    latestDaily.close
                );


            const dailyVolume =
                Number(
                    latestDaily.volume
                );


            // =================================================
            // FINAL VALIDATION
            // =================================================

            if (

                Number.isFinite(
                    price
                )

                &&

                price > 0

                &&

                Number.isFinite(
                    previousClose
                )

                &&

                previousClose > 0

                &&

                Number.isFinite(
                    dailyVolume
                )

            ) {

                const change =
                    (
                        (
                            price -
                            previousClose
                        )
                        /
                        previousClose
                    )
                    *
                    100;


                console.log(
                    `🔥 EXACT NSE DAILY RESULT ${symbol}:`,
                    {
                        price,
                        previousClose,
                        change,
                        dailyVolume
                    }
                );


                return {

                    price,

                    previousClose,

                    dailyChange:
                        change,

                    dailyVolume

                };

            }

        }


        console.warn(
            `⚠️ NSE daily data could not be parsed for ${symbol}`
        );

    }

    catch (error) {

        console.error(
            `❌ NSE DAILY HISTORY ERROR ${symbol}:`,
            error.message
        );

    }


    // ========================================================
    // FALLBACK
    // ========================================================
    //
    // Only used if NSE daily endpoint genuinely failed.
    //
    // ========================================================

    console.warn(
        `⚠️ FALLBACK TO INTRADAY FOR ${symbol}`
    );


    const ordered =
        [...candles].sort(
            (a, b) =>
                new Date(
                    a.time
                ).getTime()
                -
                new Date(
                    b.time
                ).getTime()
        );


    const latest =
        ordered[
            ordered.length - 1
        ];


    const price =
        Number(
            latest?.close
        );


    if (
        !Number.isFinite(price)
        ||
        price <= 0
    ) {

        return null;

    }


    const latestDay =
        getIstDateKey(
            latest.time
        );


    if (!latestDay) {
        return null;
    }


    const todayCandles =
        ordered.filter(
            candle =>
                getIstDateKey(
                    candle.time
                )
                ===
                latestDay
        );


    const previousDays =
        [
            ...new Set(
                ordered
                    .map(
                        candle =>
                            getIstDateKey(
                                candle.time
                            )
                    )
                    .filter(Boolean)
                    .filter(
                        day =>
                            day < latestDay
                    )
            )
        ]
        .sort();


    const previousDay =
        previousDays[
            previousDays.length - 1
        ];


    if (
        !previousDay
        ||
        todayCandles.length === 0
    ) {

        return null;

    }


    const previousDayCandles =
        ordered.filter(
            candle =>
                getIstDateKey(
                    candle.time
                )
                ===
                previousDay
        );


    const previousClose =
        Number(
            previousDayCandles[
                previousDayCandles.length - 1
            ]?.close
        );


    const dailyVolume =
        todayCandles.reduce(
            (sum, candle) =>
                sum +
                Number(
                    candle.volume || 0
                ),
            0
        );


    if (
        !Number.isFinite(
            previousClose
        )
        ||
        previousClose <= 0
    ) {

        return null;

    }


    const change =
        (
            (
                price -
                previousClose
            )
            /
            previousClose
        )
        *
        100;


    return {

        price,

        previousClose,

        dailyChange:
            change,

        dailyVolume

    };

}


async function getNseLiveResultStats(
    symbol,
    timeframe = "5m"
) {

    const candles =
        await getNseCandles(
            symbol,
            timeframe
        );

    const stats =
        await getNseResultStatsFromCandles(
            symbol,
            candles
        );

    if (!stats) {
        throw new Error(
            `Could not calculate NSE result values for ${symbol}`
        );
    }

    return stats;
}


// ------------------------------------------------------------
// NSE SCANNER DIAGNOSTIC ROUTE
// ------------------------------------------------------------
// This route DOES NOT change scanner behavior.
// It only shows the exact NSE candle/volume calculation
// so we can compare EMA360 with Chartink.

app.get("/api/scanner/nse/diagnostic", async (req, res) => {

    try {

        const symbol = String(
            req.query.symbol || "ADSL"
        )
            .trim()
            .toUpperCase();

        const timeframe = String(
            req.query.timeframe || "5m"
        )
            .trim()
            .toLowerCase();


        // For now we are diagnosing the exact
        // 5-minute condition from Chartink.
        if (timeframe !== "5m") {

            return res.status(400).json({

                success: false,

                message:
                    "Diagnostic currently supports 5m only."

            });

        }


        // Get RAW NSE candles.
        // This includes the latest candle even if it
        // has not completely finished yet.
        const rawCandles =
            await getNseCandles(
                symbol,
                timeframe,
                true
            );


        if (!rawCandles.length) {

            return res.json({

                success: false,

                source: "NSE",

                symbol,

                timeframe,

                message:
                    "No NSE candle data available"

            });

        }


        // Get only completed candles.
        const completedCandles =
            keepOnlyCompletedCandles(
                rawCandles,
                timeframe
            );


        const latestRaw =
            rawCandles[
            rawCandles.length - 1
            ] || null;


        const latestCompleted =
            completedCandles[
            completedCandles.length - 1
            ] || null;


        // ----------------------------------------------------
        // VOLUME DATA
        // ----------------------------------------------------

        const completedVolumes =
            completedCandles
                .map(
                    candle =>
                        Number(candle.volume)
                )
                .filter(
                    Number.isFinite
                );


        const latestVolume =
            latestCompleted
                ? Number(
                    latestCompleted.volume
                )
                : null;


        // ----------------------------------------------------
        // SMA(10)
        // ----------------------------------------------------
        //
        // Version 1:
        // latest candle + previous 9 candles
        //
        // Version 2:
        // 10 candles BEFORE latest candle
        //
        // We calculate BOTH so we can determine
        // which interpretation matches Chartink.
        // ----------------------------------------------------


        const last10IncludingLatest =
            completedVolumes.slice(-10);


        const previous10 =
            completedVolumes.slice(-11, -1);


        function calculateSMA(values) {

            if (values.length !== 10) {

                return null;

            }

            return (
                values.reduce(
                    (sum, value) =>
                        sum + value,
                    0
                ) / 10
            );

        }


        const sma10IncludingLatest =
            calculateSMA(
                last10IncludingLatest
            );


        const sma10Previous10 =
            calculateSMA(
                previous10
            );


        // ----------------------------------------------------
        // 2 × SMA
        // ----------------------------------------------------

        const thresholdIncludingLatest =
            sma10IncludingLatest === null
                ? null
                : sma10IncludingLatest * 2;


        const thresholdPrevious10 =
            sma10Previous10 === null
                ? null
                : sma10Previous10 * 2;


        // ----------------------------------------------------
        // PASS / FAIL
        // ----------------------------------------------------

        const passesIncludingLatest =
            Number.isFinite(latestVolume) &&
            Number.isFinite(
                thresholdIncludingLatest
            ) &&
            latestVolume >
            thresholdIncludingLatest;


        const passesPrevious10 =
            Number.isFinite(latestVolume) &&
            Number.isFinite(
                thresholdPrevious10
            ) &&
            latestVolume >
            thresholdPrevious10;


        // ----------------------------------------------------
        // LAST 12 COMPLETED CANDLES
        // ----------------------------------------------------

        const last12 =
            completedCandles
                .slice(-12)
                .map(
                    (
                        candle,
                        index,
                        arr
                    ) => ({

                        index:
                            completedCandles.length -
                            arr.length +
                            index,

                        time:
                            candle.time,

                        iso:
                            new Date(
                                candle.time
                            ).toISOString(),

                        volume:
                            Number(
                                candle.volume
                            ),

                        close:
                            Number(
                                candle.close
                            ),

                        isLatestCompleted:
                            index ===
                            arr.length - 1

                    })
                );


        // ----------------------------------------------------
        // RETURN DIAGNOSTIC DATA
        // ----------------------------------------------------

        return res.json({

            success: true,

            source: "NSE",

            symbol,

            timeframe,

            generatedAt:
                new Date().toISOString(),


            // Candle counts
            rawCandleCount:
                rawCandles.length,

            completedCandleCount:
                completedCandles.length,


            // Latest candles
            latestRaw,

            latestCompleted,


            latestRawIsDifferentFromCompleted:
                Boolean(
                    latestRaw &&
                    latestCompleted
                ) &&
                latestRaw.time !==
                latestCompleted.time,


            // Latest volume
            latestVolume,


            // SMA including latest candle
            last10IncludingLatest,

            sma10IncludingLatest,

            thresholdIncludingLatest,

            passesIncludingLatest,


            // SMA using previous 10 candles
            previous10,

            sma10Previous10,

            thresholdPrevious10,

            passesPrevious10,


            // Detailed candle list
            last12CompletedCandles:
                last12

        });


    } catch (error) {

        console.error(
            `NSE diagnostic error for ${req.query.symbol ||
            "unknown"
            }:`,
            error.message
        );


        return res.status(500).json({

            success: false,

            source: "NSE",

            message:
                error.message

        });

    }

});

app.get("/api/scanner/nse/check-adsl", async (req, res) => {
    try {
        const symbol = "ADSL";
        const timeframe = "5m";

        const candles = await getNseCandles(
    symbol,
    timeframe
);

if (!candles || candles.length === 0) {
    return res.json({
        success: false,
        message: "No candles"
    });
}

const stats =
    await getNseResultStatsFromCandles(
        symbol,
        candles
    );

        return res.json({
            success: true,
            symbol,
            timeframe,

            price: stats.price,
            change: stats.dailyChange,

            volume: stats.dailyVolume,
            dailyVolume: stats.dailyVolume,

            candleCount: candles.length,

            latestCandle:
                candles[candles.length - 1]
        });

    } catch (error) {

        console.error(
            "ADSL CHECK ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ------------------------------------------------------------
// NSE MARKET DATA ROUTE
// Used by EMA360 Guest mode.
// Equity symbols use the same NSE candle engine as the scanner.
// NIFTY 50 is handled through NSE index APIs because it is an index,
// not an equity symbol.
// ------------------------------------------------------------
function normalizeNseIndexHistorical(raw) {
    const rows = [];

    const collect = value => {
        if (Array.isArray(value)) {
            for (const item of value) {
                if (Array.isArray(item)) {
                    rows.push(item);
                } else if (item && typeof item === "object") {
                    if (Array.isArray(item.data)) {
                        collect(item.data);
                    } else {
                        rows.push(item);
                    }
                }
            }
            return;
        }

        if (value && typeof value === "object") {
            if (Array.isArray(value.data)) {
                collect(value.data);
            } else {
                rows.push(value);
            }
        }
    };

    collect(raw);

    return rows
        .map(row => {
            if (Array.isArray(row)) {
                const timeValue = Number(row[0]);
                const closeValue = Number(row[row.length - 1]);

                if (!Number.isFinite(timeValue) || !Number.isFinite(closeValue)) {
                    return null;
                }

                const time =
                    timeValue < 1e12
                        ? new Date(timeValue * 1000).toISOString()
                        : new Date(timeValue).toISOString();

                return {
                    time,
                    o: closeValue,
                    h: closeValue,
                    l: closeValue,
                    c: closeValue,
                    v: 0
                };
            }

            const time =
                row?.time ??
                row?.timestamp ??
                row?.date ??
                row?.indexDate ??
                row?.tradeDate ??
                row?.mTimestamp ??
                row?.mtimestamp;

            const open = Number(
                row?.open ??
                row?.openPrice ??
                row?.CH_OPENING_PRICE ??
                row?.chOpeningPrice
            );

            const high = Number(
                row?.high ??
                row?.highPrice ??
                row?.dayHigh ??
                row?.CH_TRADE_HIGH_PRICE ??
                row?.chTradeHighPrice
            );

            const low = Number(
                row?.low ??
                row?.lowPrice ??
                row?.dayLow ??
                row?.CH_TRADE_LOW_PRICE ??
                row?.chTradeLowPrice
            );

            const close = Number(
                row?.close ??
                row?.closePrice ??
                row?.last ??
                row?.lastPrice ??
                row?.CH_CLOSING_PRICE ??
                row?.chClosingPrice
            );

            const volume = Number(
                row?.volume ??
                row?.totalTradedVolume ??
                row?.CH_TOT_TRADED_QTY ??
                row?.chTotTradedQty ??
                0
            );

            if (!time || !Number.isFinite(close)) {
                return null;
            }

            const parsedTime = new Date(time);

            if (!Number.isFinite(parsedTime.getTime())) {
                return null;
            }

            const safeOpen = Number.isFinite(open) ? open : close;
            const safeHigh = Number.isFinite(high) ? high : close;
            const safeLow = Number.isFinite(low) ? low : close;

            return {
                time: parsedTime.toISOString(),
                o: safeOpen,
                h: safeHigh,
                l: safeLow,
                c: close,
                v: Number.isFinite(volume) ? volume : 0
            };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(a.time) - new Date(b.time));
}

function normalizeNseIndexIntradayCandles(graph, timeframe = "5m") {
    const intervalMinutes =
        timeframe === "1m" ? 1 :
        timeframe === "3m" ? 3 :
        timeframe === "5m" ? 5 :
        timeframe === "15m" ? 15 :
        timeframe === "30m" ? 30 :
        timeframe === "1h" ? 60 :
        null;

    if (!intervalMinutes || !Array.isArray(graph)) {
        return [];
    }

    const buckets = new Map();

    for (const point of graph) {
        if (!Array.isArray(point) || point.length < 2) {
            continue;
        }

        const rawTime = Number(point[0]);
        const price = Number(point[1]);

        if (!Number.isFinite(rawTime) || !Number.isFinite(price)) {
            continue;
        }

        const date = new Date(
            rawTime < 1e12
                ? rawTime * 1000
                : rawTime
        );

        if (!Number.isFinite(date.getTime())) {
            continue;
        }

        /*
         * NSE index intraday data is a price/time series, not an OHLCV
         * candle series. Build genuine OHLC candles from the points instead
         * of pretending O=H=L=C for every point.
         *
         * The bucket is calculated in IST because NSE's trading session is
         * defined in India time.
         */
        const istParts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).formatToParts(date);

        const part = type =>
            istParts.find(item => item.type === type)?.value;

        const year = Number(part("year"));
        const month = Number(part("month"));
        const day = Number(part("day"));
        const hour = Number(part("hour"));
        const minute = Number(part("minute"));

        if (
            !Number.isFinite(year) ||
            !Number.isFinite(month) ||
            !Number.isFinite(day) ||
            !Number.isFinite(hour) ||
            !Number.isFinite(minute)
        ) {
            continue;
        }

        const totalMinutes = hour * 60 + minute;

        /* NSE cash/index session: 09:15 through 15:30 IST. */
        if (totalMinutes < 9 * 60 + 15 || totalMinutes > 15 * 60 + 30) {
            continue;
        }

        const sessionMinutes = totalMinutes - (9 * 60 + 15);
        const bucketOffset =
            Math.floor(sessionMinutes / intervalMinutes) * intervalMinutes;

        const bucketMinutes =
            9 * 60 + 15 + bucketOffset;

        const bucketHour = Math.floor(bucketMinutes / 60);
        const bucketMinute = bucketMinutes % 60;

        /*
         * Use an explicit +05:30 timestamp so the bucket is unambiguous when
         * the frontend parses it back into a Date.
         */
        const bucketKey =
            `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T` +
            `${String(bucketHour).padStart(2, "0")}:${String(bucketMinute).padStart(2, "0")}:00+05:30`;

        let bucket = buckets.get(bucketKey);

        if (!bucket) {
            bucket = {
                time: bucketKey,
                o: price,
                h: price,
                l: price,
                c: price,
                v: 0,
                firstTimestamp: date.getTime()
            };
            buckets.set(bucketKey, bucket);
        } else {
            bucket.h = Math.max(bucket.h, price);
            bucket.l = Math.min(bucket.l, price);
            bucket.c = price;
        }
    }

    return Array.from(buckets.values())
        .sort((a, b) => a.firstTimestamp - b.firstTimestamp)
        .map(candle => {
            const { firstTimestamp, ...normalized } = candle;
            return normalized;
        });
}

function normalizeMarketCandleShape(candles) {
    if (!Array.isArray(candles)) {
        return [];
    }

    return candles
        .map(candle => {
            const rawTime =
                candle?.time ??
                candle?.timestamp ??
                candle?.date;

            const timeNumber = Number(rawTime);
            let time;

            if (Number.isFinite(timeNumber)) {
                time =
                    new Date(
                        timeNumber < 1e12
                            ? timeNumber * 1000
                            : timeNumber
                    ).toISOString();
            } else {
                const parsed = new Date(rawTime);
                time = Number.isFinite(parsed.getTime())
                    ? parsed.toISOString()
                    : null;
            }

            const open = Number(
                candle?.o ?? candle?.open
            );
            const high = Number(
                candle?.h ?? candle?.high
            );
            const low = Number(
                candle?.l ?? candle?.low
            );
            const close = Number(
                candle?.c ?? candle?.close
            );
            const volume = Number(
                candle?.v ?? candle?.volume ?? 0
            );

            if (
                !time ||
                !Number.isFinite(open) ||
                !Number.isFinite(high) ||
                !Number.isFinite(low) ||
                !Number.isFinite(close)
            ) {
                return null;
            }

            return {
                time,
                o: open,
                h: high,
                l: low,
                c: close,
                v: Number.isFinite(volume) ? volume : 0
            };
        })
        .filter(Boolean)
        .sort(
            (a, b) =>
                new Date(a.time) - new Date(b.time)
        );
}

async function getNseMarketCandles(symbol, timeframe = "5m") {
    const normalizedSymbol = String(symbol || "")
        .trim()
        .toUpperCase();

    const tf = String(timeframe || "5m")
        .trim()
        .toLowerCase();

    const intradayTimeframes = new Set([
        "1m", "3m", "5m", "15m", "30m", "1h"
    ]);

    if (!intradayTimeframes.has(tf)) {
        // Keep the existing NSE daily path for 1D only. Intraday guest
        // market data is handled exclusively by the official NSE MCP below.
        return normalizeMarketCandleShape(
            await getNseCandles(normalizedSymbol, tf, true)
        );
    }

    // NSE changed Tata Motors' current traded symbol to TMPV.
    // EMA360 keeps TATAMOTORS as its UI symbol and translates only at the
    // data boundary.
    const mcpSymbol = normalizedSymbol === "TATAMOTORS"
        ? "TMPV"
        : normalizedSymbol;

    try {
        if (normalizedSymbol === "NIFTY 50") {
            const candles = await nseMcpClient.getIndexIntradayCandles(
                "NIFTY 50",
                tf
            );

            console.log(
                "🇮🇳 NSE MCP INDEX CANDLES:",
                normalizedSymbol,
                tf,
                "candles =",
                Array.isArray(candles) ? candles.length : 0
            );

            return normalizeMarketCandleShape(candles || []);
        }

        const candles = await nseMcpClient.getIntradayCandles(
            mcpSymbol,
            tf
        );

        console.log(
            "🇮🇳 NSE MCP CANDLES:",
            normalizedSymbol,
            "->",
            mcpSymbol,
            tf,
            "candles =",
            Array.isArray(candles) ? candles.length : 0
        );

        return normalizeMarketCandleShape(candles || []);
    } catch (error) {
        console.error(
            `❌ NSE MCP candle fetch failed for ${normalizedSymbol} (${mcpSymbol}) ${tf}:`,
            error?.stack || error?.message || error
        );
        return [];
    }
}

/* ============================================================
   NSE GUEST LIVE QUOTE

   Historical/chart endpoints give candle snapshots. They are NOT a
   tick-by-tick stream. Guest mode therefore uses the NSE quote endpoints
   for the currently selected stock and the React client polls this route.

   Angel One is completely untouched.
============================================================ */

const NSE_MARKET_QUOTE_CACHE = new Map();
const NSE_MARKET_QUOTE_INFLIGHT = new Map();
const NSE_MARKET_QUOTE_CACHE_MS = 1000;

function nseWebHeaders(symbol) {
    return {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Referer":
            `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`,
        "Accept-Language": "en-US,en;q=0.9"
    };
}

async function fetchNseMarketQuote(symbol) {
    const requestedSymbol = String(symbol || "")
        .trim()
        .toUpperCase();

    if (!requestedSymbol) {
        throw new Error("Symbol is required");
    }

    const cached = NSE_MARKET_QUOTE_CACHE.get(requestedSymbol);
    if (
        cached &&
        Date.now() - cached.timestamp < NSE_MARKET_QUOTE_CACHE_MS
    ) {
        return cached.data;
    }

    const existing = NSE_MARKET_QUOTE_INFLIGHT.get(requestedSymbol);
    if (existing) return existing;

    const request = (async () => {
        try {
            let result;

            if (requestedSymbol === "NIFTY 50") {
                const details = await nseMcpClient.getIndexIntradayData("NIFTY 50");
                const price = Number(details?.price);
                const previousClose = Number(details?.previousClose);
                const change = Number(details?.change);

                if (!Number.isFinite(price) || price <= 0) {
                    throw new Error("NSE MCP did not return NIFTY 50 price");
                }

                result = {
                    source: "NSE",
                    symbol: requestedSymbol,
                    price,
                    previousClose: Number.isFinite(previousClose) ? previousClose : null,
                    change: Number.isFinite(change) ? change : null,
                    volume: null,
                    open: Number.isFinite(Number(details?.open)) ? Number(details.open) : null,
                    high: Number.isFinite(Number(details?.high)) ? Number(details.high) : null,
                    low: Number.isFinite(Number(details?.low)) ? Number(details.low) : null,
                    timestamp: details?.timestamp || new Date().toISOString()
                };
            } else {
                const nseSymbol = requestedSymbol === "TATAMOTORS"
                    ? "TMPV"
                    : requestedSymbol;

                const details = await nseMcpClient.getEquityDetails(nseSymbol);
                const priceInfo = details?.priceInfo || {};
                const price = Number(priceInfo.lastPrice);
                const previousClose = Number(priceInfo.previousClose);

                if (!Number.isFinite(price) || price <= 0) {
                    throw new Error(
                        `NSE MCP did not return current price for ${requestedSymbol} (${nseSymbol})`
                    );
                }

                const change =
                    Number.isFinite(previousClose) && previousClose > 0
                        ? ((price - previousClose) / previousClose) * 100
                        : Number(priceInfo.pChange);

                const raw = details?.raw || {};
                const volume = [
                    raw?.totalTradedVolume,
                    raw?.totalTradedQty,
                    raw?.tradedVolume,
                    raw?.volume
                ].map(Number).find(Number.isFinite);

                result = {
                    source: "NSE",
                    symbol: requestedSymbol,
                    nseSymbol,
                    price,
                    previousClose: Number.isFinite(previousClose) ? previousClose : null,
                    change: Number.isFinite(change) ? change : null,
                    volume: Number.isFinite(volume) ? volume : null,
                    open: Number(priceInfo.open) || null,
                    high: Number(priceInfo.intraDayHighLow?.max) || null,
                    low: Number(priceInfo.intraDayHighLow?.min) || null,
                    vwap: Number(priceInfo.vwap) || null,
                    timestamp: new Date().toISOString()
                };
            }

            NSE_MARKET_QUOTE_CACHE.set(requestedSymbol, {
                timestamp: Date.now(),
                data: result
            });

            return result;
        } finally {
            NSE_MARKET_QUOTE_INFLIGHT.delete(requestedSymbol);
        }
    })();

    NSE_MARKET_QUOTE_INFLIGHT.set(requestedSymbol, request);
    return request;
}

/* ============================================================
   NSE NIFTY 50 CONSTITUENT SNAPSHOT

   One NSE index request gives the current values for the NIFTY 50
   constituents. Guest mode uses this endpoint to keep the entire
   50-stock table synchronized without waiting for a click.
============================================================ */

const NSE_NIFTY50_QUOTES_CACHE_KEY = "NIFTY 50";
let NSE_NIFTY50_QUOTES_CACHE = {
    timestamp: 0,
    quotes: {}
};

function pickNumber(...values) {
    for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function normalizeNseIndexConstituentRows(payload) {
    const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
            ? payload
            : [];

    const quotes = {};

    for (const row of rows) {
        const rawSymbol = String(
            row?.symbol ||
            row?.identifier ||
            row?.securityId ||
            row?.securitySymbol ||
            ""
        ).trim().toUpperCase();

        // NSE responses can expose an equity as RELIANCE-EQ (or a
        // similar security suffix).  The React app uses the plain
        // NSE trading symbol, so normalize those variants here.
        const symbol = rawSymbol
            .replace(/[-_](EQ|BE|BZ|SM)$/i, "")
            .trim();

        if (!symbol) continue;

        const price = pickNumber(
            row?.lastPrice,
            row?.ltp,
            row?.last,
            row?.close
        );

        if (!Number.isFinite(price) || price <= 0) continue;

        const previousClose = pickNumber(
            row?.previousClose,
            row?.prevClose,
            row?.prev_close
        );

        const change =
            Number.isFinite(previousClose) && previousClose > 0
                ? ((price - previousClose) / previousClose) * 100
                : pickNumber(row?.pChange, row?.percentChange);

        quotes[symbol] = {
            source: "NSE",
            symbol,
            price,
            previousClose,
            change: Number.isFinite(change) ? change : null,
            volume: pickNumber(
                row?.totalTradedVolume,
                row?.totalTradedQty,
                row?.tradedVolume
            ),
            open: pickNumber(row?.open),
            high: pickNumber(row?.dayHigh, row?.high),
            low: pickNumber(row?.dayLow, row?.low),
            vwap: pickNumber(row?.vwap),
            timestamp: new Date().toISOString()
        };
    }

    return quotes;
}

async function fetchNseNifty50Quotes() {
    const now = Date.now();

    if (
        NSE_NIFTY50_QUOTES_CACHE.timestamp &&
        now - NSE_NIFTY50_QUOTES_CACHE.timestamp < 10000 &&
        Object.keys(NSE_NIFTY50_QUOTES_CACHE.quotes).length
    ) {
        return NSE_NIFTY50_QUOTES_CACHE.quotes;
    }

    // The old implementation used stock-nse-india's bulk endpoint. That
    // endpoint is the one returning 403 on Render. Use the official NSE MCP
    // individual quote tool instead. Keep this deliberately small and
    // cached; the selected-stock quote route remains the primary live path.
    const symbols = [
        "RELIANCE",
        "HDFCBANK",
        "ICICIBANK",
        "INFY",
        "TCS",
        "SBIN",
        "BHARTIARTL",
        "ITC",
        "LT",
        "TATAMOTORS"
    ];

    const quotes = {};

    for (const symbol of symbols) {
        try {
            const quote = await fetchNseMarketQuote(symbol);
            if (quote && Number.isFinite(Number(quote.price))) {
                quotes[symbol] = quote;
            }
        } catch (error) {
            console.warn(
                `⚠️ NSE MCP constituent quote unavailable for ${symbol}:`,
                error?.message || error
            );
        }
    }

    try {
        const niftyQuote = await fetchNseMarketQuote("NIFTY 50");
        if (niftyQuote) quotes["NIFTY 50"] = niftyQuote;
    } catch (error) {
        console.warn(
            "⚠️ NSE MCP NIFTY 50 quote unavailable:",
            error?.message || error
        );
    }

    if (!Object.keys(quotes).length) {
        throw new Error("NSE MCP returned no constituent quotes");
    }

    NSE_NIFTY50_QUOTES_CACHE = {
        timestamp: Date.now(),
        quotes
    };

    return quotes;
}

app.get("/api/market/nse/quotes", async (req, res) => {
    try {
        const quotes = await fetchNseNifty50Quotes();

        return res.json({
            success: true,
            source: "NSE",
            count: Object.keys(quotes).length,
            quotes
        });
    } catch (error) {
        console.error(
            "❌ NSE NIFTY 50 quotes failed:",
            error?.message || error
        );

        return res.status(502).json({
            success: false,
            source: "NSE",
            message:
                error?.message ||
                "NSE NIFTY 50 quotes failed"
        });
    }
});

/* ============================================================
   NSE INDEX MARKET CARDS

   Guest mode must not reuse Angel One values for the header.
   SENSEX belongs to BSE, so when the NSE-only source does not
   provide it, the frontend will correctly show -- rather than
   silently using another exchange.
============================================================ */

const NSE_HEADER_INDEX_ALIASES = {
    "BANKNIFTY": ["NIFTY BANK", "BANKNIFTY"],
    "FINNIFTY": ["NIFTY FIN SERVICE", "FINNIFTY"],
    "NIFTY 50": ["NIFTY 50", "NIFTY"],
    "NIFTYIT": ["NIFTY IT", "NIFTYIT"],
    "NIFTYMIDCAP100": ["NIFTY MIDCAP 100", "NIFTYMIDCAP100"],
    "NIFTYNXT50": ["NIFTY NEXT 50", "NIFTYNXT50"],
    "NIFTYPHARMA": ["NIFTY PHARMA", "NIFTYPHARMA"],
    "NIFTYSMALL100": ["NIFTY SMALL 100", "NIFTYSMALL100"]
};

function normalizeNseIndexRows(payload) {
    const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
            ? payload
            : [];

    const result = {};

    for (const row of rows) {
        const name = String(
            row?.index ||
            row?.indexSymbol ||
            row?.name ||
            ""
        ).trim().toUpperCase();

        if (!name) continue;

        const price = pickNumber(
            row?.last,
            row?.lastPrice,
            row?.ltp,
            row?.close
        );

        if (!Number.isFinite(price)) continue;

        const previousClose = pickNumber(
            row?.previousClose,
            row?.prevClose
        );

        const change =
            Number.isFinite(previousClose) && previousClose > 0
                ? ((price - previousClose) / previousClose) * 100
                : pickNumber(row?.percentChange, row?.pChange);

        result[name] = {
            source: "NSE",
            name,
            price,
            previousClose,
            change: Number.isFinite(change) ? change : null,
            timestamp: new Date().toISOString()
        };
    }

    return result;
}

let NSE_HEADER_INDICES_CACHE = {
    timestamp: 0,
    indices: {}
};

let NSE_ALL_INDICES_CACHE = {
    timestamp: 0,
    data: null
};

const NSE_ALL_INDICES_CACHE_MS = 5000;

async function fetchNseAllIndices() {
    const now = Date.now();

    if (
        NSE_ALL_INDICES_CACHE.data &&
        now - NSE_ALL_INDICES_CACHE.timestamp < NSE_ALL_INDICES_CACHE_MS
    ) {
        return NSE_ALL_INDICES_CACHE.data;
    }

    const data = await nseIndia.getAllIndices();

    NSE_ALL_INDICES_CACHE = {
        timestamp: Date.now(),
        data
    };

    return data;
}

function findNseIndexMeta(payload, aliases) {
    const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
            ? payload
            : [];

    const wanted = aliases.map(value => String(value).trim().toUpperCase());

    const row = rows.find(item => {
        const name = String(
            item?.index ||
            item?.indexSymbol ||
            item?.name ||
            ""
        ).trim().toUpperCase();

        return wanted.includes(name);
    });

    return row || null;
}

function findMcpQuoteObject(value, depth = 0) {
    if (depth > 8 || value == null) return null;

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findMcpQuoteObject(item, depth + 1);
            if (found) return found;
        }
        return null;
    }

    if (typeof value !== "object") return null;

    const priceKeys = [
        "lastPrice", "ltp", "last", "indexValue", "currentValue", "value", "close"
    ];

    if (priceKeys.some(key => value[key] !== undefined && value[key] !== null)) {
        return value;
    }

    for (const item of Object.values(value)) {
        const found = findMcpQuoteObject(item, depth + 1);
        if (found) return found;
    }

    return null;
}

async function fetchNseHeaderIndices() {
    const now = Date.now();

    if (
        NSE_HEADER_INDICES_CACHE.timestamp &&
        now - NSE_HEADER_INDICES_CACHE.timestamp < 5000 &&
        Object.keys(NSE_HEADER_INDICES_CACHE.indices).length
    ) {
        return NSE_HEADER_INDICES_CACHE.indices;
    }

    const indexNames = [
        ["BANKNIFTY", "NIFTY BANK"],
        ["FINNIFTY", "NIFTY FIN SERVICE"],
        ["NIFTY 50", "NIFTY 50"],
        ["NIFTYIT", "NIFTY IT"],
        ["NIFTYMIDCAP100", "NIFTY MIDCAP 100"],
        ["NIFTYNXT50", "NIFTY NEXT 50"],
        ["NIFTYPHARMA", "NIFTY PHARMA"],
        ["NIFTYSMALL100", "NIFTY SMLCAP 100"]
    ];

    const output = {};

    for (const [label, nseName] of indexNames) {
        try {
            const payload = await nseMcpClient.callLiveMarket(nseName);
            const row = findMcpQuoteObject(payload);
            if (!row) continue;

            const price = pickNumber(
                row?.lastPrice,
                row?.ltp,
                row?.last,
                row?.indexValue,
                row?.currentValue,
                row?.value,
                row?.close
            );

            if (!Number.isFinite(price)) continue;

            const previousClose = pickNumber(
                row?.previousClose,
                row?.prevClose,
                row?.previous_close
            );

            const change =
                Number.isFinite(previousClose) && previousClose > 0
                    ? ((price - previousClose) / previousClose) * 100
                    : pickNumber(row?.pChange, row?.percentChange, row?.percChange);

            output[label] = {
                source: "NSE",
                name: label,
                price,
                previousClose: Number.isFinite(previousClose) ? previousClose : null,
                change: Number.isFinite(change) ? change : null,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(
                `⚠️ NSE MCP header index failed for ${label}:`,
                error?.message || error
            );
        }
    }

    // EMA360's former SENSEX slot is now RELIANCE in NSE-only mode.
    try {
        const reliance = await fetchNseMarketQuote("RELIANCE");
        if (reliance) {
            output.RELIANCE = {
                source: "NSE",
                name: "RELIANCE",
                price: reliance.price,
                previousClose: reliance.previousClose,
                change: reliance.change,
                timestamp: reliance.timestamp
            };
        }
    } catch (error) {
        console.warn(
            "⚠️ NSE MCP header RELIANCE quote failed:",
            error?.message || error
        );
    }

    if (!Object.keys(output).length) {
        throw new Error("NSE MCP returned no header index data");
    }

    NSE_HEADER_INDICES_CACHE = {
        timestamp: Date.now(),
        indices: output
    };

    return output;
}

app.get("/api/market/nse/indices", async (req, res) => {
    try {
        const indices = await fetchNseHeaderIndices();

        return res.json({
            success: true,
            source: "NSE",
            indices
        });
    } catch (error) {
        console.error(
            "❌ NSE header indices failed:",
            error?.message || error
        );

        return res.status(502).json({
            success: false,
            source: "NSE",
            message:
                error?.message ||
                "NSE header indices failed"
        });
    }
});

app.get("/api/market/nse/quote", async (req, res) => {
    try {
        const symbol = String(req.query.symbol || "")
            .trim()
            .toUpperCase();

        if (!symbol) {
            return res.status(400).json({
                success: false,
                source: "NSE",
                message: "Symbol is required"
            });
        }

        const quote = await fetchNseMarketQuote(symbol);

        return res.json({
            success: true,
            ...quote
        });
    } catch (error) {
        console.error(
            `❌ NSE guest quote failed for ${req.query.symbol || "unknown"}:`,
            error?.message || error
        );

        return res.status(502).json({
            success: false,
            source: "NSE",
            symbol: req.query.symbol || "",
            message: error?.message || "NSE quote failed"
        });
    }
});

app.get("/api/market/nse/candles", async (req, res) => {
    try {
        const symbol = String(
            req.query.symbol || ""
        )
            .trim()
            .toUpperCase();

        const timeframe = String(
            req.query.timeframe || "5m"
        )
            .trim()
            .toLowerCase();

        const allowedTimeframes = [
            "1m",
            "3m",
            "5m",
            "15m",
            "30m",
            "1h",
            "1d"
        ];

        if (!symbol) {
            return res.status(400).json({
                success: false,
                source: "NSE",
                message: "Symbol is required"
            });
        }

        if (!allowedTimeframes.includes(timeframe)) {
            return res.status(400).json({
                success: false,
                source: "NSE",
                message: `Unsupported timeframe: ${timeframe}`,
                allowedTimeframes
            });
        }

        const candles = await getNseMarketCandles(
            symbol,
            timeframe
        );

        if (!Array.isArray(candles) || !candles.length) {
            return res.status(404).json({
                success: false,
                source: "NSE",
                symbol,
                timeframe,
                message: "No NSE market candles available"
            });
        }

        return res.json({
            success: true,
            source: "NSE",
            symbol,
            timeframe,
            candles
        });

    } catch (error) {
        console.error(
            `NSE market data error for ${req.query.symbol || "unknown"}:`,
            error.message
        );

        return res.status(500).json({
            success: false,
            source: "NSE",
            message: error.message
        });
    }
});


// ------------------------------------------------------------
// NSE CANDLES ROUTE
// ------------------------------------------------------------
app.get("/api/scanner/nse/candles", async (req, res) => {
    try {
        const symbol = String(
            req.query.symbol || ""
        )
            .trim()
            .toUpperCase();

        const timeframe = String(
            req.query.timeframe || "5m"
        )
            .trim()
            .toLowerCase();

        const allowedTimeframes = [
            "1m",
            "3m",
            "5m",
            "15m",
            "30m",
            "1h",
            "1d"
        ];

        if (!symbol) {
            return res.status(400).json({
                success: false,
                message: "Symbol is required",
            });
        }

        if (!allowedTimeframes.includes(timeframe)) {
            return res.status(400).json({
                success: false,
                message: `Unsupported timeframe: ${timeframe}`,
                allowedTimeframes
            });
        }

        const candles = await getNseCandles(
            symbol,
            timeframe
        );

        if (!candles.length) {
            return res.json({
                success: false,
                source: "NSE",
                symbol,
                timeframe,
                candles: [],
                message: "No NSE candle data available"
            });
        }

        /*
         * All displayed result values come from this SAME candle
         * snapshot. No second NSE quote request is made here.
         */
        const stats =
    await getNseResultStatsFromCandles(
        symbol,
        candles
    );

        if (!stats) {
            return res.json({
                success: false,
                source: "NSE",
                symbol,
                timeframe,
                candles: [],
                message: "Not enough NSE candle history to calculate result values"
            });
        }

        /*
         * Company-name lookup is deliberately non-blocking.
         * If NSE blocks the metadata request, the stock still appears.
         */
        let companyName = symbol;

        try {
            companyName =
                await getNseCompanyName(symbol);
        } catch {
            companyName = symbol;
        }

        console.log(
            "FINAL NSE RESULT:",
            symbol,
            {
                price: stats.price,
                change: stats.dailyChange,
                volume: stats.dailyVolume
            }
        );
        return res.json({
            success: true,
            source: "NSE",
            symbol,
            companyName,
            timeframe,
            candles,

            price: stats.price,
            previousClose: stats.previousClose,
            change: stats.dailyChange,
            volume: stats.dailyVolume,

            dailyChange: stats.dailyChange,
            dailyVolume: stats.dailyVolume,
            latestCandle: candles[candles.length - 1]
        });

    } catch (error) {

        console.error(
            `NSE candle route error for ${req.query.symbol || "unknown"}:`,
            error.message
        );

        return res.status(500).json({
            success: false,
            source: "NSE",
            message: error.message,
        });
    }
});


// ------------------------------------------------------------
// NSE LIVE QUOTE - PRICE / % CHANGE / VOLUME
// ------------------------------------------------------------
app.get("/api/scanner/nse/quote", async (req, res) => {
    try {
        const symbol = String(
            req.query.symbol || ""
        )
            .trim()
            .toUpperCase();

        const timeframe = String(
            req.query.timeframe || "5m"
        )
            .trim()
            .toLowerCase();

        if (!symbol) {
            return res.status(400).json({
                success: false,
                message: "Symbol is required"
            });
        }

        const stats =
            await getNseLiveResultStats(
                symbol,
                timeframe
            );

        return res.json({
            success: true,
            source: "NSE",
            symbol,
            price: stats.price,
            previousClose: stats.previousClose,
            change: stats.dailyChange,
            volume: stats.dailyVolume
        });

    } catch (error) {

        console.error(
            `NSE quote route error for ${req.query.symbol || "unknown"}:`,
            error.message
        );

        return res.status(500).json({
            success: false,
            source: "NSE",
            message: error.message
        });
    }
});


// ============================================================
// MAGIC FILTER PARSE ROUTE
// ============================================================
app.post("/api/scanner/magic-filter", (req, res) => {
    try {
        const prompt = String(req.body?.prompt || "").trim();

        if (!prompt) {
            return res.status(400).json({
                success: false,
                message: "Prompt is required."
            });
        }

        const parsed = parseMagicFilterPrompt(prompt);

        if (!parsed.success) {
            return res.status(422).json(parsed);
        }

        return res.json(parsed);
    } catch (error) {
        console.error("Magic Filter parse error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================================
// NSE SCANNER BACKTEST
// ============================================================
// This is intentionally bounded. A historical intraday backtest
// across the entire NSE universe would create thousands of NSE
// requests. We therefore use the current NSE priority ordering and
// backtest the top N stocks. The user can change maxStocks in the UI.
// ============================================================

app.post("/api/scanner/nse/backtest", async (req, res) => {
    const startedAt = Date.now();

    try {
        const conditions = Array.isArray(req.body?.conditions)
            ? req.body.conditions
            : [];
        const timeframe = String(req.body?.timeframe || "5m").toLowerCase();
        const maxStocks = Math.min(
            Math.max(Number(req.body?.maxStocks || 30), 1),
            100
        );
        const lookbackDays = Math.min(
            Math.max(Number(req.body?.days || 30), 1),
            90
        );

        const allowedTimeframes = ["1m", "3m", "5m", "15m", "30m", "1h", "1d"];

        if (!allowedTimeframes.includes(timeframe)) {
            return res.status(400).json({
                success: false,
                message: `Unsupported timeframe: ${timeframe}`
            });
        }

        if (!conditions.length) {
            return res.status(400).json({
                success: false,
                message: "At least one condition is required."
            });
        }

        const priorityStocks = await getNsePriorityStocks();
        const symbols = priorityStocks
            .slice(0, maxStocks)
            .map(item => String(item.symbol).toUpperCase());

        const signals = [];
        const errors = [];
        let completedStocks = 0;
        let cursor = 0;

        const WORKERS = 3;

        async function worker() {
            while (true) {
                const index = cursor++;
                if (index >= symbols.length) return;

                const symbol = symbols[index];

                try {
                    const candles = await getNseCandles(symbol, timeframe);
                    if (!candles.length) {
                        completedStocks++;
                        continue;
                    }

                    const dailyChangeMap = buildDailyChangeMap(candles);
                    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
                    const matchedDays = new Set();

                    // Start far enough into the series for EMA/SMA lookback.
                    const startIndex = Math.min(100, Math.max(20, candles.length - 1));

                    for (let i = startIndex; i < candles.length; i++) {
                        const candleTime = new Date(candles[i].time).getTime();
                        if (!Number.isFinite(candleTime) || candleTime < cutoff) continue;

                        const passed = conditions.every(condition =>
                            checkServerCondition(
                                condition,
                                candles,
                                dailyChangeMap,
                                i
                            )
                        );

                        if (!passed) continue;

                        const day = serverDateKey(candles[i].time);
                        if (!day || matchedDays.has(day)) continue;
                        matchedDays.add(day);

                        const dailyChange = Number(dailyChangeMap.get(day));

                        signals.push({
                            symbol,
                            date: day,
                            time: candles[i].time,
                            price: Number(candles[i].close),
                            change: Number.isFinite(dailyChange) ? dailyChange : null,
                            volume: Number(candles[i].volume),
                            timeframe
                        });
                    }

                    completedStocks++;
                } catch (error) {
                    errors.push({
                        symbol,
                        message: error.message
                    });
                    completedStocks++;
                }
            }
        }

        await Promise.all(
            Array.from(
                { length: Math.min(WORKERS, symbols.length) },
                () => worker()
            )
        );

        signals.sort((a, b) => {
            const changeA = Number.isFinite(a.change) ? a.change : -Infinity;
            const changeB = Number.isFinite(b.change) ? b.change : -Infinity;
            if (changeB !== changeA) return changeB - changeA;
            return new Date(b.time).getTime() - new Date(a.time).getTime();
        });

        return res.json({
            success: true,
            source: "NSE",
            timeframe,
            days: lookbackDays,
            stocksRequested: symbols.length,
            stocksCompleted: completedStocks,
            signalCount: signals.length,
            signals: signals.slice(0, 500),
            errors: errors.slice(0, 50),
            elapsedMs: Date.now() - startedAt
        });
    } catch (error) {
        console.error("NSE backtest error:", error);
        return res.status(500).json({
            success: false,
            source: "NSE",
            message: error.message,
            elapsedMs: Date.now() - startedAt
        });
    }
});

// ============================================================
// SCANNER ALERTS
// ============================================================
// The alert configuration is kept server-side while the backend
// is running. The endpoint is intentionally configuration-only for
// now; it does not silently place trades or execute orders.
// ============================================================

const NSE_SCANNER_ALERTS = new Map();

app.get("/api/scanner/alerts", (req, res) => {
    return res.json({
        success: true,
        alerts: [...NSE_SCANNER_ALERTS.values()]
    });
});

app.post("/api/scanner/alerts", (req, res) => {
    try {
        const name = String(req.body?.name || "My NSE Scan Alert").trim();
        const conditions = Array.isArray(req.body?.conditions)
            ? req.body.conditions
            : [];
        const timeframe = String(req.body?.timeframe || "5m").toLowerCase();

        if (!conditions.length) {
            return res.status(400).json({
                success: false,
                message: "At least one condition is required."
            });
        }

        const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const alertConfig = {
            id,
            name,
            source: "NSE",
            timeframe,
            conditions,
            enabled: true,
            createdAt: new Date().toISOString()
        };

        NSE_SCANNER_ALERTS.set(id, alertConfig);

        return res.json({
            success: true,
            alert: alertConfig
        });
    } catch (error) {
        console.error("Create scanner alert error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.delete("/api/scanner/alerts/:id", (req, res) => {
    const deleted = NSE_SCANNER_ALERTS.delete(String(req.params.id));
    return res.json({
        success: deleted,
        message: deleted ? "Alert deleted." : "Alert not found."
    });
});

// ------------------------------------------------------------
// NSE SCANNER PRIORITY ROUTE
// ------------------------------------------------------------
//
// Returns NSE stocks ordered by their latest % change.
//
// Frontend uses this ONLY to decide which stocks should be
// scanned first.
//
// It does NOT apply scanner conditions.
// ------------------------------------------------------------

app.get(
    "/api/scanner/nse/priority",
    async (req, res) => {

        try {

            const priorityStocks =
                await getNsePriorityStocks();


            return res.json({

                success: true,

                source: "NSE",

                count:
                    priorityStocks.length,

                stocks:
                    priorityStocks

            });

        }

        catch (error) {

            console.error(
                "NSE priority route error:",
                error.message
            );


            return res.status(500).json({

                success: false,

                source: "NSE",

                message:
                    error.message,

                stocks: []

            });

        }

    }
);
// ------------------------------------------------------------
// NSE STOCK UNIVERSE ROUTE
// ------------------------------------------------------------
app.get("/api/scanner/nse/stocks", async (req, res) => {
    try {
        const stocks = await getNseStocks();

        return res.json({
            success: true,
            source: "NSE",
            count: stocks.length,
            stocks,
        });

    } catch (error) {
        console.error(
            "NSE stock universe error:",
            error
        );

        return res.status(500).json({
            success: false,
            source: "NSE",
            message: error.message,
        });
    }
});

/* =========================================================
   NSE LARGE DEALS
   ---------------------------------------------------------
   Sources:
   - Bulk Deals
   - Block Deals
   - Short Selling

   This is completely separate from:
   - Angel One live stream
   - NSE market quotes
   - NSE candles
   - Scanner
========================================================= */

const NSE_LARGE_DEALS_CACHE = {
    timestamp: 0,
    data: null
};

const NSE_LARGE_DEALS_CACHE_MS = 60 * 1000;

let NSE_LARGE_DEALS_INFLIGHT = null;


/*
 * ---------------------------------------------------------
 * NSE LARGE DEALS HEADERS
 * ---------------------------------------------------------
 */

function nseLargeDealsHeaders() {
    return {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36",

        "Accept":
            "application/json,text/plain,*/*",

        "Accept-Language":
            "en-US,en;q=0.9",

        "Referer":
            "https://www.nseindia.com/report-detail/display-bulk-and-block-deals",

        "Connection":
            "keep-alive"
    };
}


/*
 * ---------------------------------------------------------
 * NORMALIZE LARGE DEAL ROW
 * ---------------------------------------------------------
 */

function normalizeNseLargeDealRow(row = {}) {

    return {
        date:
            row?.date ??
            row?.DATE ??
            null,

        symbol:
            row?.symbol ??
            row?.SYMBOL ??
            null,

        securityName:
            row?.name ??
            row?.securityName ??
            row?.SECURITY_NAME ??
            null,

        clientName:
            row?.clientName ??
            row?.CLIENT_NAME ??
            null,

        buySell:
            row?.buySell ??
            row?.BUY_SELL ??
            row?.buy_sell ??
            null,

        quantity:
            row?.qty ??
            row?.quantity ??
            row?.QUANTITY ??
            null,

        price:
            row?.watp ??
            row?.price ??
            row?.PRICE ??
            null,

        remarks:
            row?.remarks ??
            row?.REMARKS ??
            null
    };
}


/*
 * ---------------------------------------------------------
 * NORMALIZE SHORT SELLING ROW
 * ---------------------------------------------------------
 */

function normalizeNseShortSellingRow(row = {}) {

    return {
        date:
            row?.date ??
            row?.DATE ??
            null,

        symbol:
            row?.symbol ??
            row?.SYMBOL ??
            null,

        securityName:
            row?.name ??
            row?.securityName ??
            row?.SECURITY_NAME ??
            null,

        quantity:
            row?.qty ??
            row?.quantity ??
            row?.QUANTITY ??
            null,

        clientName:
            row?.clientName ??
            row?.CLIENT_NAME ??
            null,

        remarks:
            row?.remarks ??
            row?.REMARKS ??
            null
    };
}


/*
 * ---------------------------------------------------------
 * FETCH NSE LARGE DEALS
 * ---------------------------------------------------------
 */

async function fetchNseLargeDeals() {

    const now = Date.now();


    /*
     * Return cached data for 60 seconds.
     * This prevents unnecessary requests to NSE.
     */

    if (
        NSE_LARGE_DEALS_CACHE.data &&
        now - NSE_LARGE_DEALS_CACHE.timestamp <
            NSE_LARGE_DEALS_CACHE_MS
    ) {

        return NSE_LARGE_DEALS_CACHE.data;

    }


    /*
     * If another request is already fetching the same
     * NSE data, wait for that request instead of creating
     * another NSE request.
     */

    if (NSE_LARGE_DEALS_INFLIGHT) {

        return NSE_LARGE_DEALS_INFLIGHT;

    }


    NSE_LARGE_DEALS_INFLIGHT = (async () => {

        try {

            const url =
                "https://www.nseindia.com/api/snapshot-capital-market-largedeal";


            const response = await axios.get(
                url,
                {
                    headers:
                        nseLargeDealsHeaders(),

                    timeout:
                        15000
                }
            );


            const payload =
                response?.data || {};


            /*
             * NSE provides these three arrays.
             */

            const bulkDeals =
                Array.isArray(
                    payload?.BULK_DEALS_DATA
                )
                    ? payload.BULK_DEALS_DATA
                    : [];


            const blockDeals =
                Array.isArray(
                    payload?.BLOCK_DEALS_DATA
                )
                    ? payload.BLOCK_DEALS_DATA
                    : [];


            const shortSelling =
                Array.isArray(
                    payload?.SHORT_DEALS_DATA
                )
                    ? payload.SHORT_DEALS_DATA
                    : [];


            const result = {

                source: "NSE",

                asOnDate:
                    payload?.as_on_date ??
                    payload?.AS_ON_DATE ??
                    null,

                bulkDeals:
                    bulkDeals.map(
                        normalizeNseLargeDealRow
                    ),

                blockDeals:
                    blockDeals.map(
                        normalizeNseLargeDealRow
                    ),

                shortSelling:
                    shortSelling.map(
                        normalizeNseShortSellingRow
                    ),

                counts: {

                    bulkDeals:
                        bulkDeals.length,

                    blockDeals:
                        blockDeals.length,

                    shortSelling:
                        shortSelling.length

                },

                timestamp:
                    new Date().toISOString()

            };


            /*
             * Save in cache.
             */

            NSE_LARGE_DEALS_CACHE.timestamp =
                Date.now();

            NSE_LARGE_DEALS_CACHE.data =
                result;


            return result;

        }

        catch (error) {

            console.error(
                "❌ NSE Large Deals fetch failed:",
                error?.response?.status ||
                error?.message ||
                error
            );


            throw error;

        }

        finally {

            NSE_LARGE_DEALS_INFLIGHT =
                null;

        }

    })();


    return NSE_LARGE_DEALS_INFLIGHT;

}


/*
 * ---------------------------------------------------------
 * NSE LARGE DEALS API
 * ---------------------------------------------------------
 */

app.get(
    "/api/market/nse/large-deals",
    async (req, res) => {

        try {

            const deals =
                await fetchNseLargeDeals();


            return res.json({

                success: true,

                source: "NSE",

                ...deals

            });

        }

        catch (error) {

            console.error(
                "❌ NSE Large Deals route failed:",
                error?.message ||
                error
            );


            return res.status(502).json({

                success: false,

                source: "NSE",

                message:
                    error?.message ||
                    "NSE Large Deals data unavailable",

                bulkDeals: [],

                blockDeals: [],

                shortSelling: [],

                counts: {

                    bulkDeals: 0,

                    blockDeals: 0,

                    shortSelling: 0

                }

            });

        }

    }
);
/* =========================================================
   START SERVER
========================================================= */

const PORT =
    process.env.PORT ||
    3000;


async function startServer() {

    try {

        /* Instrument master is public metadata and does not require a fixed user login. */
        await loadInstrumentMaster();

        app.listen(

            PORT,

            "0.0.0.0",

            () => {

                console.log(
                    `🚀 EMA360 backend running on port ${PORT}`
                );

                console.log(
                    `🌐 Local API: http://localhost:${PORT}`
                );

                console.log(
                    `📡 Stream: http://localhost:${PORT}/api/stream`
                );

            }

        );

    }


    catch (error) {

        console.error(
            "❌ Failed to start EMA360 backend:",
            error
        );

    }
}


startServer();