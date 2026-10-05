const NSE_MCP_LIVE_URL = "https://mcp.nseindia.in/cmmkt/mcp";



const NSE_MCP_BHAVCOPY_URL = "https://mcp.nseindia.in/bhavcopy/cm/mcp";



const REDIS_URL = String(process.env.REDIS_URL || "").trim();

let Redis = null;

let nseSnapshotRedis = null;

if (REDIS_URL) {

    try {

        Redis = require("ioredis");

        nseSnapshotRedis = new Redis(REDIS_URL, {

            maxRetriesPerRequest: 2,

            enableReadyCheck: true

        });

        nseSnapshotRedis.on("error", error => {

            console.warn("⚠️ NSE snapshot Redis error:", error?.message || error);

        });

    } catch (error) {

        console.warn("⚠️ ioredis unavailable; NSE candle snapshots will be memory-only:", error?.message || error);

    }

}



const NSE_SNAPSHOT_TTL_SECONDS = 7 * 24 * 60 * 60;

const NSE_SAMPLE_MIN_GAP_MS = 10 * 1000;



function firstQuoteObject(value, depth = 0) {

    if (depth > 8 || value == null) return null;



    if (Array.isArray(value)) {

        for (const item of value) {

            const found = firstQuoteObject(item, depth + 1);

            if (found) return found;

        }

        return null;

    }



    if (typeof value !== "object") return null;



    const priceKeys = [

        "lastPrice", "ltp", "last", "close", "lastTradedPrice",

        "last_traded_price", "lastPriceValue", "currentPrice"

    ];



    if (priceKeys.some(key => value[key] !== undefined && value[key] !== null)) {

        return value;

    }



    for (const item of Object.values(value)) {

        const found = firstQuoteObject(item, depth + 1);

        if (found) return found;

    }



    return null;

}



function quoteNumber(row, ...keys) {

    for (const key of keys) {

        const value = Number(row?.[key]);

        if (Number.isFinite(value)) return value;

    }

    return null;

}







function sleep(ms) {



    return new Promise(resolve => setTimeout(resolve, ms));



}







function parseSse(text) {



    const messages = [];



    let event = "message";



    let data = [];



    for (const line of String(text || "").split(/\r?\n/)) {



        if (line.startsWith("event:")) event = line.slice(6).trim();



        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());



        else if (line === "" && data.length) {



            messages.push({ event, data: data.join("\n") });



            event = "message";



            data = [];



        }



    }



    if (data.length) messages.push({ event, data: data.join("\n") });



    for (const item of messages.reverse()) {



        try { return JSON.parse(item.data); } catch (_) { }



    }



    return null;



}







async function readResponse(response) {



    const text = await response.text();



    if (!text) return null;



    const type = String(response.headers.get("content-type") || "").toLowerCase();



    if (type.includes("text/event-stream")) return parseSse(text);



    try { return JSON.parse(text); } catch (_) { return parseSse(text); }



}







class NseMcpConnection {



    constructor(url) {



        this.url = url;



        this.sessionId = null;



        this.nextId = 1;



        this.initialized = false;



        this.tools = null;



        this.queue = Promise.resolve();



    }







    runSerialized(fn) {



        const run = this.queue.then(fn);



        this.queue = run.catch(() => undefined);



        return run;



    }







    async initialize() {



        if (this.initialized) return;



        await this.runSerialized(async () => {



            if (this.initialized) return;



            const result = await this.rawRequest("initialize", {



                protocolVersion: "2025-03-26",



                capabilities: {},



                clientInfo: { name: "EMA360", version: "1.0.0" }



            });



            if (result?.error) throw new Error(result.error.message || "NSE MCP initialize failed");



            this.initialized = true;



            await this.rawNotification("notifications/initialized", {});



        });



    }







    async rawRequest(method, params) {



        const id = this.nextId++;



        const headers = {



            "Content-Type": "application/json",



            "Accept": "application/json, text/event-stream"



        };



        if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;



        const response = await fetch(this.url, {



            method: "POST",



            headers,



            body: JSON.stringify({ jsonrpc: "2.0", id, method, params })



        });



        const sid = response.headers.get("mcp-session-id");



        if (sid) this.sessionId = sid;



        const payload = await readResponse(response);



        if (!response.ok) {



            const message = payload?.error?.message || payload?.message || `NSE MCP HTTP ${response.status}`;



            throw new Error(message);



        }



        return payload;



    }







    async rawNotification(method, params) {



        const headers = {



            "Content-Type": "application/json",



            "Accept": "application/json, text/event-stream"



        };



        if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;



        const response = await fetch(this.url, {



            method: "POST",



            headers,



            body: JSON.stringify({ jsonrpc: "2.0", method, params })



        });



        if (!response.ok && response.status !== 202) {



            const text = await response.text();



            throw new Error(`NSE MCP notification failed: ${response.status} ${text.slice(0, 200)}`);



        }



    }







    async listTools() {



        await this.initialize();



        if (this.tools) return this.tools;



        return this.runSerialized(async () => {



            if (this.tools) return this.tools;



            const result = await this.rawRequest("tools/list", {});



            if (result?.error) throw new Error(result.error.message || "NSE MCP tools/list failed");



            this.tools = result?.result?.tools || [];



            return this.tools;



        });



    }







    async callTool(name, args = {}, urlOverride = null) {



        const connection = urlOverride ? new NseMcpConnection(urlOverride) : this;



        if (urlOverride) await connection.initialize();



        else await this.initialize();



        return connection.runSerialized(async () => {



            const result = await connection.rawRequest("tools/call", { name, arguments: args });



            if (result?.error) throw new Error(result.error.message || `NSE MCP tool ${name} failed`);



            const content = result?.result?.content || [];



            const texts = content.filter(x => x?.type === "text").map(x => x.text);



            for (const text of texts) {



                try { return JSON.parse(text); } catch (_) { }



            }



            return result?.result;



        });



    }



}







function firstObject(value) {



    if (Array.isArray(value)) {



        for (const item of value) {



            const found = firstObject(item);



            if (found) return found;



        }



        return null;



    }



    if (value && typeof value === "object") {



        if (Array.isArray(value.data) || Array.isArray(value.rows) || Array.isArray(value.stocks)) return value;



        for (const item of Object.values(value)) {



            const found = firstObject(item);



            if (found) return found;



        }



    }



    return null;



}







function extractRows(value) {



    if (Array.isArray(value)) return value;



    if (!value || typeof value !== "object") return [];



    for (const key of ["data", "rows", "stocks", "equities", "results", "items", "quotes", "constituents"]) {



        if (Array.isArray(value[key])) return value[key];



    }



    const found = firstObject(value);



    if (found) return extractRows(found);



    return [];



}







function extractToolText(value) {



    if (typeof value === "string") return value;



    if (value && typeof value === "object") {



        if (typeof value.text === "string") return value.text;



        if (Array.isArray(value.content)) {



            for (const c of value.content) {



                if (typeof c?.text === "string") return c.text;



            }



        }



    }



    return null;



}







class NseMcpClient {



    constructor() {



        this.live = new NseMcpConnection(NSE_MCP_LIVE_URL);



        this.history = new NseMcpConnection(NSE_MCP_BHAVCOPY_URL);



        this.stockCache = { at: 0, symbols: [] };



        this.snapshotStore = new Map();

        this.snapshotLoaded = new Set();

        this.lastSampleAt = new Map();



    }







    async getAllStockSymbols() {



        if (this.stockCache.symbols.length && Date.now() - this.stockCache.at < 5 * 60 * 1000) return this.stockCache.symbols;



        const data = await this.live.callTool("cm_get_equity_stocks", {});



        const rows = extractRows(data);



        const symbols = [...new Set(rows.map(row => String(row?.symbol || row?.identifier || row?.securitySymbol || "").trim().toUpperCase()).filter(Boolean))];



        this.stockCache = { at: Date.now(), symbols };



        return symbols;



    }







    async getEquityDetails(symbol) {



        const key = String(symbol).trim().toUpperCase();

        const data = await this.live.callTool("cm_get_stock_quote", { symbol: key });

        const row = firstQuoteObject(data) || {};



        await this.loadSnapshots(key);

        await this.recordSnapshot(key, row);



        return {

            info: {

                companyName: row?.companyName || row?.company || row?.securityName || key

            },

            priceInfo: {

                lastPrice: quoteNumber(row, "lastPrice", "ltp", "last", "lastTradedPrice", "last_traded_price", "close"),

                previousClose: quoteNumber(row, "previousClose", "prevClose", "previous_close"),

                pChange: quoteNumber(row, "pChange", "percentChange", "pchange", "percent_change"),

                open: quoteNumber(row, "open"),

                vwap: quoteNumber(row, "vwap"),

                intraDayHighLow: {

                    max: quoteNumber(row, "dayHigh", "high"),

                    min: quoteNumber(row, "dayLow", "low")

                }

            },

            raw: row

        };

    }







    async loadSnapshots(symbol) {

        const key = String(symbol).trim().toUpperCase();

        if (this.snapshotLoaded.has(key)) return;



        this.snapshotLoaded.add(key);



        if (!nseSnapshotRedis) return;



        try {

            const raw = await nseSnapshotRedis.get(`ema360:nse:snapshots:${key}`);

            if (!raw) return;



            const parsed = JSON.parse(raw);

            if (Array.isArray(parsed)) {

                this.snapshotStore.set(key, parsed.filter(point =>

                    point && Number.isFinite(Number(point.time)) && Number.isFinite(Number(point.c))

                ).slice(-5000));

            }

        } catch (error) {

            console.warn(`⚠️ NSE snapshot restore failed for ${key}:`, error?.message || error);

        }

    }



    async saveSnapshots(symbol) {

        const key = String(symbol).trim().toUpperCase();

        if (!nseSnapshotRedis) return;



        const list = this.snapshotStore.get(key) || [];

        try {

            await nseSnapshotRedis.set(

                `ema360:nse:snapshots:${key}`,

                JSON.stringify(list.slice(-5000)),

                "EX",

                NSE_SNAPSHOT_TTL_SECONDS

            );

        } catch (error) {

            console.warn(`⚠️ NSE snapshot save failed for ${key}:`, error?.message || error);

        }

    }



    async recordSnapshot(symbol, row) {

        const key = String(symbol).trim().toUpperCase();

        const price = quoteNumber(row, "lastPrice", "ltp", "last", "lastTradedPrice", "last_traded_price", "close");

        if (!Number.isFinite(price) || price <= 0) return;



        const now = Date.now();

        const previousSample = this.lastSampleAt.get(key) || 0;

        if (now - previousSample < NSE_SAMPLE_MIN_GAP_MS) return;



        this.lastSampleAt.set(key, now);



        const volume = quoteNumber(row, "totalTradedVolume", "totalTradedQty", "tradedVolume", "volume", "total_traded_volume");

        const list = this.snapshotStore.get(key) || [];



        list.push({

            time: now,

            c: price,

            v: Number.isFinite(volume) ? volume : 0

        });



        const cutoff = now - 7 * 24 * 60 * 60 * 1000;

        const trimmed = list.filter(x => Number(x.time) >= cutoff).slice(-5000);

        this.snapshotStore.set(key, trimmed);



        // Persist without making the chart request wait for Redis.

        this.saveSnapshots(key).catch(() => undefined);

    }







    async getIntradayCandles(symbol, timeframe = "5m") {

        const key = String(symbol).trim().toUpperCase();

        const minutes = { "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60 }[timeframe];



        if (!minutes) {

            throw new Error(`Unsupported NSE intraday timeframe: ${timeframe}`);

        }



        await this.loadSnapshots(key);



        // Sample the official NSE live quote at most once every 10 seconds.

        // This builds genuine intraday candles from real NSE snapshots.

        const lastSample = this.lastSampleAt.get(key) || 0;

        if (Date.now() - lastSample >= NSE_SAMPLE_MIN_GAP_MS) {

            await this.getEquityDetails(key);

        }



        const snapshots = this.snapshotStore.get(key) || [];

        const buckets = new Map();



        for (const point of snapshots) {

            const timestamp = Number(point.time);

            const price = Number(point.c);

            if (!Number.isFinite(timestamp) || !Number.isFinite(price)) continue;



            const bucket = Math.floor(timestamp / (minutes * 60000)) * (minutes * 60000);

            let candle = buckets.get(bucket);



            if (!candle) {

                candle = {

                    time: new Date(bucket).toISOString(),

                    o: price,

                    h: price,

                    l: price,

                    c: price,

                    v: 0,

                    _firstVolume: Number(point.v) || 0,

                    _lastVolume: Number(point.v) || 0

                };

                buckets.set(bucket, candle);

            } else {

                candle.h = Math.max(candle.h, price);

                candle.l = Math.min(candle.l, price);

                candle.c = price;

                candle._lastVolume = Number(point.v) || candle._lastVolume;

            }

        }



        const candles = Array.from(buckets.values())

            .sort((a, b) => new Date(a.time) - new Date(b.time))

            .map(candle => ({

                time: candle.time,

                o: candle.o,

                h: candle.h,

                l: candle.l,

                c: candle.c,

                v: Math.max(0, candle._lastVolume - candle._firstVolume)

            }));



        return candles;

    }







    async getEquityTradeInfo(symbol) {



        const details = await this.getEquityDetails(symbol);



        const row = details.raw || {};



        return { marketDeptOrderBook: { tradeInfo: { totalTradedVolume: row?.totalTradedVolume ?? row?.volume ?? row?.tradedVolume } } };



    }







    async getEquityStockIndices(indexName) {



        const data = await this.callLiveMarket(indexName);



        const rows = extractRows(data);



        return { data: rows };



    }







    async getAllIndices() {



        const names = [



            "NIFTY 50",



            "NIFTY BANK",



            "NIFTY FIN SERVICE",



            "NIFTY IT",



            "NIFTY MIDCAP 100",



            "NIFTY NEXT 50",



            "NIFTY PHARMA",



            "NIFTY SMLCAP 100"



        ];



        const rows = [];



        for (const name of names) {



            try {



                const data = await this.callLiveMarket(name);



                const found = extractRows(data);



                if (found.length) {



                    const indexRow = found.find(row => {



                        const n = String(row?.index || row?.indexSymbol || row?.name || "").toUpperCase();



                        return n.includes(name.toUpperCase()) || name.toUpperCase().includes(n);



                    });



                    if (indexRow) rows.push(indexRow);



                }



            } catch (_) { }



        }



        return { data: rows };



    }







    async callLiveMarket(indexName) {



        const tools = await this.live.listTools();



        const tool = tools.find(t => t.name === "cm_get_live_market_data");



        const schema = tool?.inputSchema || tool?.parameters || {};



        const props = schema.properties || {};



        const args = {};



        const names = Object.keys(props);



        if (names.length) {



            const preferred = names.find(k => /index|symbol|variation|segment|name/i.test(k)) || names[0];



            args[preferred] = indexName;



        }



        return this.live.callTool("cm_get_live_market_data", args);



    }







    async getEquityHistoricalData(symbol, { start, end }) {



        const data = await this.history.callTool("get_stock_history", {



            symbol: String(symbol).toUpperCase(),



            startDate: start instanceof Date ? start.toISOString().slice(0, 10) : String(start),



            endDate: end instanceof Date ? end.toISOString().slice(0, 10) : String(end)



        });



        const rows = extractRows(data);



        return [{ data: rows }];



    }







    async getEquitySymbolInfo(symbol) {



        const symbols = await this.getAllStockSymbols();



        const normalized = String(symbol).trim().toUpperCase();



        if (!symbols.includes(normalized)) return null;



        return { scripcode: normalized, symbol: normalized };



    }







    async getIndexHistoricalData(symbol, { start, end }) {



        const data = await this.history.callTool("get_stock_history", {



            symbol: String(symbol).toUpperCase(),



            startDate: start instanceof Date ? start.toISOString().slice(0, 10) : String(start),



            endDate: end instanceof Date ? end.toISOString().slice(0, 10) : String(end)



        });



        return [{ data: extractRows(data) }];



    }







    async getEquityChartHistoricalData() {



        throw new Error("NSE MCP does not provide intraday OHLC candles. EMA360 builds new intraday candles from the live NSE snapshot instead.");



    }







    async getIndexIntradayData(indexName) {

        const name = String(indexName || "")
            .trim()
            .toUpperCase();

        if (!name) {
            throw new Error("Index name is required");
        }

        const data = await this.callLiveMarket(name);

        const rows = extractRows(data);

        if (!rows.length) {
            throw new Error(
                `No live NSE index data returned for ${name}`
            );
        }

        // Try to find the actual requested index row.
        const indexRow =
            rows.find(row => {

                const rowName = String(
                    row?.index ??
                    row?.indexSymbol ??
                    row?.name ??
                    row?.symbol ??
                    ""
                )
                    .trim()
                    .toUpperCase();

                return (
                    rowName === name ||
                    rowName.includes(name) ||
                    name.includes(rowName)
                );

            }) || rows[0];

        const price = Number(
            indexRow?.lastPrice ??
            indexRow?.ltp ??
            indexRow?.last ??
            indexRow?.close ??
            indexRow?.indexValue ??
            indexRow?.currentValue
        );

        const previousClose = Number(
            indexRow?.previousClose ??
            indexRow?.prevClose ??
            indexRow?.previous_close
        );

        const change = Number(
            indexRow?.change ??
            indexRow?.changeValue
        );

        const changePercent = Number(
            indexRow?.pChange ??
            indexRow?.changePercent ??
            indexRow?.percentChange
        );

        return {
            index: name,
            price: Number.isFinite(price) ? price : null,
            previousClose: Number.isFinite(previousClose)
                ? previousClose
                : null,
            change: Number.isFinite(change)
                ? change
                : null,
            changePercent: Number.isFinite(changePercent)
                ? changePercent
                : null,
            timestamp: new Date().toISOString()
        };
    }

    async getIndexIntradayCandles(symbol, timeframe = "5m") {
        const indexName = String(symbol || "").trim().toUpperCase();
        const minutes = { "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60 }[
            String(timeframe || "5m").trim().toLowerCase()
        ];
        if (!minutes) throw new Error(`Unsupported NSE index intraday timeframe: ${timeframe}`);

        await this.getIndexIntradayData(indexName);

        const snapshots = this.snapshotStore.get(`INDEX:${indexName}`) || [];
        const buckets = new Map();
        for (const point of snapshots) {
            const timestamp = Number(point.time);
            const price = Number(point.c);
            if (!Number.isFinite(timestamp) || !Number.isFinite(price)) continue;
            const bucket = Math.floor(timestamp / (minutes * 60000)) * (minutes * 60000);
            let candle = buckets.get(bucket);
            if (!candle) {
                candle = { time: new Date(bucket).toISOString(), o: price, h: price, l: price, c: price, v: 0 };
                buckets.set(bucket, candle);
            } else {
                candle.h = Math.max(candle.h, price); candle.l = Math.min(candle.l, price); candle.c = price;
            }
        }
        return Array.from(buckets.values()).sort((a, b) => new Date(a.time) - new Date(b.time));
    }

    async getIndexIntradayCandles(indexName, timeframe = "5m") {

    const key = String(indexName || "")
        .trim()
        .toUpperCase();

    const minutes = {
        "1m": 1,
        "3m": 3,
        "5m": 5,
        "15m": 15,
        "30m": 30,
        "1h": 60
    }[timeframe];

    if (!minutes) {
        throw new Error(
            `Unsupported NSE index timeframe: ${timeframe}`
        );
    }

    /*
     * ---------------------------------------------------------
     * INDEX SNAPSHOT STORE
     * ---------------------------------------------------------
     *
     * We keep index snapshots separately from equity snapshots.
     * NIFTY 50 is an INDEX, so it must never go through the
     * equity getIntradayCandles() path.
     */

    if (!this.indexSnapshotStore) {
        this.indexSnapshotStore = new Map();
    }

    if (!this.indexLastSampleAt) {
        this.indexLastSampleAt = new Map();
    }

    const lastSample =
        this.indexLastSampleAt.get(key) || 0;

    /*
     * Take a fresh official NSE live index snapshot.
     */
    if (
        Date.now() - lastSample >=
        NSE_SAMPLE_MIN_GAP_MS
    ) {

        const details =
            await this.getIndexIntradayData(key);

        const price = Number(details?.price);

        if (Number.isFinite(price) && price > 0) {

            const list =
                this.indexSnapshotStore.get(key) || [];

            list.push({
                time: Date.now(),
                c: price,
                v: 0
            });

            const cutoff =
                Date.now() -
                7 * 24 * 60 * 60 * 1000;

            const trimmed =
                list
                    .filter(
                        point =>
                            Number(point.time) >= cutoff
                    )
                    .slice(-5000);

            this.indexSnapshotStore.set(
                key,
                trimmed
            );

            this.indexLastSampleAt.set(
                key,
                Date.now()
            );
        }
    }

    const snapshots =
        this.indexSnapshotStore.get(key) || [];

    const buckets = new Map();

    for (const point of snapshots) {

        const timestamp =
            Number(point.time);

        const price =
            Number(point.c);

        if (
            !Number.isFinite(timestamp) ||
            !Number.isFinite(price)
        ) {
            continue;
        }

        const bucket =
            Math.floor(
                timestamp /
                (minutes * 60 * 1000)
            ) *
            (minutes * 60 * 1000);

        let candle =
            buckets.get(bucket);

        if (!candle) {

            candle = {
                time:
                    new Date(bucket).toISOString(),

                o: price,
                h: price,
                l: price,
                c: price,
                v: 0
            };

            buckets.set(
                bucket,
                candle
            );

        } else {

            candle.h =
                Math.max(
                    Number(candle.h),
                    price
                );

            candle.l =
                Math.min(
                    Number(candle.l),
                    price
                );

            candle.c = price;
        }
    }

    return Array.from(
        buckets.values()
    ).sort(
        (a, b) =>
            new Date(a.time) -
            new Date(b.time)
    );
}

}







module.exports = { NseMcpClient };
