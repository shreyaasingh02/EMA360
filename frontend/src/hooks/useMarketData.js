import { useCallback, useEffect, useRef, useState } from "react";

import {
    getHistoricalCandles,
    getNseMarketCandles,
    getNseMarketQuote,
    getNseMarketQuotes,
    getNseMarketIndices,
    getSymbols,
    createLiveStream
} from "../services/api";

function useMarketData(dataSource = "angel") {

    const activeSource = dataSource === "nse" ? "nse" : "angel";

    /* =========================================================
       DATA SOURCE
    ========================================================= */

    const getMarketCandles = useCallback(
        async (stock, timeframe) => {

            if (activeSource === "nse") {
                console.log(
                    `🇮🇳 NSE MODE: fetching ${stock} ${timeframe}`
                );

                return getNseMarketCandles(
                    stock,
                    timeframe
                );
            }

            return getHistoricalCandles(
                stock,
                timeframe
            );
        },
        [activeSource]
    );

    /* =========================================================
       SELECTED STOCK
    ========================================================= */

    const [selectedStock, setSelectedStock] =
        useState("NIFTY 50");

    /* =========================================================
       CURRENT TIMEFRAME
    ========================================================= */

    const [currentTF, setCurrentTF] =
        useState("5M");

    /* =========================================================
       CURRENT CANDLES
    ========================================================= */

    const [candles, setCandles] =
        useState([]);

    /* =========================================================
       PREVIOUS PRICE
    ========================================================= */

    const [previousPrice, setPreviousPrice] =
        useState(0);

    /* =========================================================
       STOCK DATA CACHE

       Old project:

       const stockData = {};

       React version keeps the same structure but uses
       useRef because this is a mutable cache.
    ========================================================= */

    const stockDataRef =
        useRef({});

    const [stockData, setStockData] =
        useState({});

    const [dataVersion, setDataVersion] =
        useState(0);

    /** NSE-only live snapshots used by the Guest dashboard. */
    const [marketQuotes, setMarketQuotes] =
        useState({});

    const [marketIndices, setMarketIndices] =
        useState({});

    /* =========================================================
       SELECTION REQUEST ID

       This preserves the old protection against an older
       async stock request overwriting a newer selection.
    ========================================================= */

    const selectionRequestId =
        useRef(0);

    const liveStreamRef =
        useRef(null);

    const liveStreamRetryRef =
        useRef(null);

    const liveTokenMapRef =
        useRef({});

    const liveStreamMountedRef =
        useRef(true);

    /* =========================================================
       APPLY LIVE ANGEL ONE TICK
    ========================================================= */

    const applyLiveTick = useCallback((tick) => {

        if (!tick) return;

        const price = Number(tick.last_traded_price) / 100;

        if (!Number.isFinite(price) || price <= 0) return;

        const token = String(tick.token ?? "").replace(/"/g, "");

        const exchangeTimestamp = Number(tick.exchange_timestamp);
        const tickTime = Number.isFinite(exchangeTimestamp)
            ? new Date(exchangeTimestamp)
            : new Date();

        /** Match the Angel One token to our frontend stock list. */
        const tickStock =
            liveTokenMapRef.current[token] || null;

        if (!tickStock) return;

        const stockCache = stockDataRef.current[tickStock];

        if (!stockCache) return;

        const existing = stockCache[currentTF];

        if (!Array.isArray(existing) || !existing.length) return;

        const updated = existing.map(candle => ({ ...candle }));

        const last = updated[updated.length - 1];

        if (!last) return;

        const timeframeMinutes =
            currentTF === "1M" ? 1 :
            currentTF === "3M" ? 3 :
            currentTF === "5M" ? 5 :
            currentTF === "15M" ? 15 :
            currentTF === "30M" ? 30 :
            currentTF === "1H" ? 60 :
            currentTF === "1D" ? 1440 : 5;

        /** Daily candles should update their current day's OHLC. */
        let candleTime = new Date(tickTime);

        if (timeframeMinutes < 1440) {

            candleTime.setSeconds(0, 0);

            const minutes = candleTime.getMinutes();

            candleTime.setMinutes(
                Math.floor(minutes / timeframeMinutes) * timeframeMinutes
            );

        } else {

            candleTime.setHours(0, 0, 0, 0);

        }

        const lastTime = new Date(last.time).getTime();
        const newTime = candleTime.getTime();

        if (newTime === lastTime) {

            last.c = price;
            last.h = Math.max(Number(last.h), price);
            last.l = Math.min(Number(last.l), price);

        } else if (newTime > lastTime) {

            updated.push({
                time: candleTime.toISOString(),
                o: price,
                h: price,
                l: price,
                c: price,
                v: Number(tick.volume ?? 0) || 0
            });

            if (updated.length > 500) updated.shift();

        } else {

            return;

        }

        stockCache[currentTF] = updated;

        /** Selected stock drives the chart/header immediately. */
        if (tickStock === selectedStock) {

            setCandles(updated);

            setPreviousPrice(
                updated.length > 1
                    ? updated[updated.length - 2].c
                    : updated[0].c
            );

        }

        setStockData({
            ...stockDataRef.current
        });

        setDataVersion(previous => previous + 1);

    }, [currentTF, selectedStock]);

    /* =========================================================
       ANGEL ONE LIVE STREAM
    ========================================================= */

    useEffect(() => {

        if (activeSource !== "angel") {
            console.log("🇮🇳 NSE mode: Angel One live stream disabled");
            return undefined;
        }

        liveStreamMountedRef.current = true;

        const connect = () => {

            if (!liveStreamMountedRef.current) return;

            try {
                liveStreamRef.current?.close();
            } catch (_) {}

            const stream = createLiveStream();

            liveStreamRef.current = stream;

            stream.onopen = () => {
                console.log("🟢 EMA360 React live stream connected");
            };

            stream.onmessage = event => {

                try {

                    const tick = JSON.parse(event.data);

                    applyLiveTick(tick);

                } catch (error) {

                    console.error("❌ Live tick parse error:", error);

                }

            };

            stream.onerror = error => {

                console.error("❌ EMA360 live stream error:", error);

                try {
                    stream.close();
                } catch (_) {}

                if (!liveStreamMountedRef.current) return;

                clearTimeout(liveStreamRetryRef.current);

                liveStreamRetryRef.current =
                    setTimeout(connect, 3000);

            };

        };

        let cancelled = false;

        (async () => {

            try {

                const symbols = await getSymbols();

                if (cancelled || !symbols) return;

                const map = {};

                for (const [stock, info] of Object.entries(symbols)) {

                    if (info?.token != null) {

                        map[String(info.token).replace(/"/g, "")] =
                            stock;

                    }

                }

                liveTokenMapRef.current = map;

                console.log(
                    "🗺️ EMA360 live token map ready:",
                    map
                );

                connect();

            } catch (error) {

                console.error(
                    "❌ Failed to load live token map:",
                    error
                );

            }

        })();

        return () => {

            cancelled = true;

            liveStreamMountedRef.current = false;

            clearTimeout(liveStreamRetryRef.current);

            try {
                liveStreamRef.current?.close();
            } catch (_) {}

            liveStreamRef.current = null;

        };

    }, [applyLiveTick, activeSource]);

    /* =========================================================
       NSE GUEST MARKET-WIDE LIVE UPDATES

       Guest mode must update the whole NIFTY 50 automatically.

       A stock click is only for selecting/displaying that stock;
       it must NOT be the thing that causes its data to refresh.

       The backend gets the NIFTY 50 constituent snapshot from NSE
       in one request. We poll that snapshot every ~2 seconds and
       fold each latest price into its current timeframe candle.

       Angel One mode is untouched.
    ========================================================= */

    useEffect(() => {

        if (activeSource !== "nse") {
            return undefined;
        }

        let cancelled = false;
        let timer = null;
        let indexTimer = null;

        const timeframeMinutes = value =>
            value === "1M" ? 1 :
            value === "3M" ? 3 :
            value === "5M" ? 5 :
            value === "15M" ? 15 :
            value === "30M" ? 30 :
            value === "1H" ? 60 :
            1440;

        function getMarketBucket(date, minutes) {

            const input = new Date(date);

            if (minutes >= 1440) {

                const day = new Date(input);

                day.setHours(0, 0, 0, 0);

                return day;
            }

            const parts = new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            }).formatToParts(input);

            const values = {};

            for (const part of parts) {
                values[part.type] = part.value;
            }

            const year = Number(values.year);
            const month = Number(values.month) - 1;
            const day = Number(values.day);
            const hour = Number(values.hour);
            const minute = Number(values.minute);

            const sessionStart = 9 * 60 + 15;
            const current = hour * 60 + minute;
            const elapsed = Math.max(0, current - sessionStart);

            const bucketMinutes =
                sessionStart +
                Math.floor(elapsed / minutes) * minutes;

            const bucketHour = Math.floor(bucketMinutes / 60);
            const bucketMinute = bucketMinutes % 60;

            const utcWallClock = Date.UTC(
                year,
                month,
                day,
                bucketHour,
                bucketMinute,
                0,
                0
            );

            return new Date(
                utcWallClock - (5 * 60 + 30) * 60 * 1000
            );
        }

        function isNseTradingHours(date) {

            const parts = new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            }).formatToParts(date);

            const hour = Number(
                parts.find(part => part.type === "hour")?.value
            );

            const minute = Number(
                parts.find(part => part.type === "minute")?.value
            );

            const total = hour * 60 + minute;

            return total >= 9 * 60 + 15 &&
                total <= 15 * 60 + 30;
        }

        function mergeQuoteIntoTimeframe(
            stock,
            timeframe,
            quote
        ) {

            const price = Number(quote?.price);

            if (!Number.isFinite(price) || price <= 0) {
                return false;
            }

            const stockCache = stockDataRef.current[stock];

            const existing = stockCache?.[timeframe];

            if (!Array.isArray(existing) || !existing.length) {
                return false;
            }

            const updated =
                existing.map(candle => ({ ...candle }));

            const last =
                updated[updated.length - 1];

            if (!last) return false;

            const quoteTime = new Date(
                quote.timestamp || Date.now()
            );

            const minutes =
                timeframeMinutes(timeframe);

            const bucket =
                getMarketBucket(
                    quoteTime,
                    minutes
                );

            const bucketTime = bucket.getTime();
            const lastTime = new Date(last.time).getTime();

            if (!Number.isFinite(lastTime)) {
                return false;
            }

            if (
                !isNseTradingHours(quoteTime) &&
                minutes < 1440
            ) {

                // Outside market hours do not create a fake new candle.
                last.c = price;
                last.h = Math.max(Number(last.h), price);
                last.l = Math.min(Number(last.l), price);

            } else if (bucketTime === lastTime) {

                last.c = price;
                last.h = Math.max(Number(last.h), price);
                last.l = Math.min(Number(last.l), price);

            } else if (bucketTime > lastTime) {

                updated.push({
                    time: bucket.toISOString(),
                    o: price,
                    h: price,
                    l: price,
                    c: price,
                    v: 0
                });

                if (updated.length > 500) {
                    updated.shift();
                }

            } else {

                return false;

            }

            if (Number.isFinite(Number(quote.volume))) {

                const dailyVolume = Number(quote.volume);

                const dayKey = value =>
                    new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Kolkata",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }).format(new Date(value));

                const quoteDay = dayKey(quoteTime);

                let completedVolume = 0;

                for (let i = 0; i < updated.length - 1; i++) {

                    if (dayKey(updated[i].time) === quoteDay) {
                        completedVolume += Number(updated[i].v) || 0;
                    }

                }

                updated[updated.length - 1].v = Math.max(
                    0,
                    dailyVolume - completedVolume
                );

            }

            stockCache[timeframe] = updated;

            return true;
        }

        function publishSelectedStock(stock) {

            const selected =
                stockDataRef.current[stock]?.[currentTF];

            if (!Array.isArray(selected) || !selected.length) {
                return;
            }

            setCandles(selected);

            setPreviousPrice(
                selected.length > 1
                    ? selected[selected.length - 2].c
                    : selected[0].c
            );
        }

        async function pollAllStocks() {

            if (cancelled) return;

            try {

                const quotes =
                    await getNseMarketQuotes();

                if (cancelled) return;

                setMarketQuotes(quotes || {});

                let changed = false;

                for (const stock of stocks) {

                    const quote = quotes?.[stock];

                    if (!quote) continue;

                    // Keep the table's current timeframe live.
                    if (
                        mergeQuoteIntoTimeframe(
                            stock,
                            currentTF,
                            quote
                        )
                    ) {

                        changed = true;

                    }

                    // Keep MTF RSI data live for the selected stock too.
                    if (stock === selectedStock) {

                        for (
                            const timeframe of
                            ["5M", "15M", "1H"]
                        ) {

                            if (
                                timeframe !== currentTF &&
                                mergeQuoteIntoTimeframe(
                                    stock,
                                    timeframe,
                                    quote
                                )
                            ) {

                                changed = true;

                            }

                        }

                    }

                }

                if (changed) {

                    publishSelectedStock(selectedStock);

                    setStockData({
                        ...stockDataRef.current
                    });

                    setDataVersion(
                        previous => previous + 1
                    );

                }

            } catch (error) {

                console.warn(
                    "⚠️ NSE NIFTY 50 market-wide poll failed:",
                    error?.message || error
                );

            } finally {

                if (!cancelled) {

                    timer = window.setTimeout(
                        pollAllStocks,
                        2000
                    );

                }

            }

        }

        async function pollIndices() {

            if (cancelled) return;

            try {

                const indices =
                    await getNseMarketIndices();

                if (!cancelled) {
                    setMarketIndices(indices || {});
                }

            } catch (error) {

                console.warn(
                    "⚠️ NSE header index poll failed:",
                    error?.message || error
                );

            } finally {

                if (!cancelled) {

                    indexTimer = window.setTimeout(
                        pollIndices,
                        5000
                    );

                }

            }

        }

        pollAllStocks();
        pollIndices();

        return () => {

            cancelled = true;

            if (timer) window.clearTimeout(timer);
            if (indexTimer) window.clearTimeout(indexTimer);

        };

    }, [
        activeSource,
        currentTF,
        selectedStock
    ]);

    /* =========================================================
       STOCK LIST
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
       LOAD SELECTED STOCK MTF
    ========================================================= */

    const loadSelectedStockMTF = useCallback(
        async (stock) => {

            if (!stock) {

                console.error("❌ MTF load: stock is missing");

                return;
            }

            const timeframes = [
                "5M",
                "15M",
                "1H"
            ];

            console.log(
                `📊 Loading MTF data for SELECTED STOCK: ${stock}`
            );

            if (!stockDataRef.current[stock]) {
                stockDataRef.current[stock] = {};
            }

            for (const timeframe of timeframes) {

                try {

                    /*
                     * ALWAYS fetch the requested stock/timeframe
                     * while we are debugging indicator accuracy.
                     *
                     * This prevents NIFTY data from being reused
                     * accidentally for another selected stock.
                     */

                    console.log(
                        `📡 Fetching ${stock} ${timeframe}`
                    );

                    const data =
                        await getMarketCandles(
                            stock,
                            timeframe
                        );

                    if (
                        !Array.isArray(data) ||
                        !data.length
                    ) {

                        throw new Error(
                            `No candles returned for ${stock} ${timeframe}`
                        );

                    }

                    /*
                     * Store strictly under:
                     *
                     * stockDataRef.current[stock][timeframe]
                     */

                    stockDataRef.current[stock][timeframe] =
                        data;

                    console.log(
                        `✅ STORED ${stock} ${timeframe}: ${data.length} candles`
                    );

                    /*
                     * DEBUG — verify the actual stock prices.
                     */

                    const last =
                        data[data.length - 1];

                    console.log(
                        `🔎 ${stock} ${timeframe} LAST CANDLE:`,
                        {
                            time: last?.time,
                            open: last?.o,
                            high: last?.h,
                            low: last?.l,
                            close: last?.c,
                            volume: last?.v
                        }
                    );

                } catch (error) {

                    console.error(
                        `❌ Failed ${stock} ${timeframe}:`,
                        error
                    );

                }

            }

            /*
             * IMPORTANT:
             * Publish a NEW object to React.
             */

            setStockData({
                ...stockDataRef.current
            });

            setDataVersion(
                previous => previous + 1
            );

            console.log(
                `🏁 MTF COMPLETE FOR: ${stock}`
            );

        },
        [getMarketCandles]
    );

    /* =========================================================
       FORCE INITIAL SELECTED STOCK LOAD
       NSE GUEST + ANGEL ONE
    ========================================================= */

    useEffect(() => {

        let cancelled = false;

        async function loadInitialSelectedStock() {

            try {

                console.log(
                    `🚀 INITIAL ${activeSource.toUpperCase()} LOAD:`,
                    selectedStock,
                    currentTF
                );

                const data =
                    await getMarketCandles(
                        selectedStock,
                        currentTF
                    );

                if (cancelled) return;

                if (
                    !Array.isArray(data) ||
                    data.length === 0
                ) {

                    console.error(
                        `❌ INITIAL LOAD RETURNED NO DATA: ${selectedStock} ${currentTF}`
                    );

                    return;
                }

                if (!stockDataRef.current[selectedStock]) {
                    stockDataRef.current[selectedStock] = {};
                }

                stockDataRef.current[selectedStock][currentTF] =
                    data;

                setStockData({
                    ...stockDataRef.current
                });

                setCandles(data);

                if (data.length > 1) {

                    setPreviousPrice(
                        data[data.length - 2].c
                    );

                }

                setDataVersion(
                    previous => previous + 1
                );

                console.log(
                    `✅ INITIAL DATA READY: ${selectedStock} ${currentTF}`,
                    data.length,
                    "candles"
                );

            } catch (error) {

                console.error(
                    `❌ INITIAL ${activeSource.toUpperCase()} LOAD FAILED:`,
                    error
                );

            }

        }

        loadInitialSelectedStock();

        return () => {
            cancelled = true;
        };

    }, [
        activeSource,
        selectedStock,
        currentTF,
        getMarketCandles
    ]);

    /* =========================================================
       LOAD ALL STOCK DATA
    ========================================================= */

    const loadAllStockData =
        useCallback(
            async function () {

                console.log(
                    `🚀 Starting EMA360 startup...`
                );

                /* =====================================================
                   STEP 1 — NIFTY FIRST
                ===================================================== */

                const priorityStock =
                    "NIFTY 50";

                try {

                    console.log(
                        `⭐ PRIORITY: Loading ${priorityStock} ${currentTF} first...`
                    );

                    const data =
                        await getMarketCandles(
                            priorityStock,
                            currentTF
                        );

                    if (
                        !Array.isArray(data) ||
                        !data.length
                    ) {

                        throw new Error(
                            `No candle data for ${priorityStock} ${currentTF}`
                        );

                    }

                    if (!stockDataRef.current[priorityStock]) {

                        stockDataRef.current[priorityStock] =
                            {};

                    }

                    stockDataRef.current[
                        priorityStock
                    ][currentTF] =
                        data;

                    setStockData({
                        ...stockDataRef.current
                    });

                    setCandles(data);

                    if (data.length > 1) {

                        setPreviousPrice(
                            data[data.length - 2].c
                        );

                    }

                    console.log(
                        `✅ PRIORITY READY: ${priorityStock} ${currentTF} — ${data.length} REAL candles`
                    );

                    /*
                     * Load the 5M / 15M / 1H data required
                     * for NIFTY's MTF indicators.
                     */

                    console.log(
                        `⭐ Loading NIFTY MTF...`
                    );

                    await loadSelectedStockMTF(
                        priorityStock
                    );

                    /*
                     * Restore NIFTY candles after MTF loading.
                     */

                    const restoredCandles =
                        stockDataRef.current[
                            priorityStock
                        ]?.[currentTF] || [];

                    setCandles(
                        restoredCandles
                    );

                    if (
                        restoredCandles.length > 1
                    ) {

                        setPreviousPrice(
                            restoredCandles[
                                restoredCandles.length - 2
                            ].c
                        );

                    }

                    console.log(
                        `🎯 NIFTY 50 DASHBOARD READY`
                    );

                } catch (error) {

                    console.error(
                        `❌ PRIORITY NIFTY 50 LOAD FAILED:`,
                        error
                    );

                }

                /* =====================================================
                   STEP 2 — BACKGROUND TABLE LOADING
                ===================================================== */

                console.log(
                    `📊 NIFTY ready. Starting background stock loading...`
                );

                const backgroundStocks =
                    stocks.filter(
                        stock =>
                            stock !== priorityStock
                    );

                /*
                 * NSE Guest mode: load the complete 50-stock table in
                 * controlled parallel batches. Waiting for one stock to
                 * finish before starting the next makes the table look as
                 * if a click is required.
                 *
                 * Keep concurrency low so NSE is not hammered.
                 */

                if (activeSource === "nse") {

                    let nextIndex = 0;

                    const workerCount = 3;

                    const loadNseWorker = async () => {

                        while (true) {

                            const index =
                                nextIndex++;

                            if (
                                index >=
                                backgroundStocks.length
                            ) {

                                return;
                            }

                            const stock =
                                backgroundStocks[index];

                            if (
                                Array.isArray(
                                    stockDataRef.current[stock]?.[currentTF]
                                ) &&
                                stockDataRef.current[stock][currentTF].length
                            ) {

                                continue;
                            }

                            try {

                                console.log(
                                    `📡 NSE background loading ${stock} ${currentTF}...`
                                );

                                const data =
                                    await getMarketCandles(
                                        stock,
                                        currentTF
                                    );

                                if (
                                    !Array.isArray(data) ||
                                    !data.length
                                ) {

                                    throw new Error(
                                        `No candle data for ${stock} ${currentTF}`
                                    );

                                }

                                if (!stockDataRef.current[stock]) {
                                    stockDataRef.current[stock] = {};
                                }

                                stockDataRef.current[stock][currentTF] =
                                    data;

                                setStockData({
                                    ...stockDataRef.current
                                });

                                setDataVersion(
                                    previous => previous + 1
                                );

                                console.log(
                                    `✅ NSE ${stock} ${currentTF}: ${data.length} REAL candles`
                                );

                            } catch (error) {

                                console.error(
                                    `❌ NSE ${stock} ${currentTF} failed:`,
                                    error
                                );

                            }

                        }

                    };

                    await Promise.all(
                        Array.from(
                            {
                                length: Math.min(
                                    workerCount,
                                    backgroundStocks.length
                                )
                            },
                            () => loadNseWorker()
                        )
                    );

                } else {

                    /*
                     * Existing Angel One startup behavior is preserved.
                     */

                    for (const stock of backgroundStocks) {

                        if (
                            Array.isArray(
                                stockDataRef.current[stock]?.[currentTF]
                            ) &&
                            stockDataRef.current[stock][currentTF].length
                        ) {

                            continue;
                        }

                        try {

                            console.log(
                                `📡 Background loading ${stock} ${currentTF}...`
                            );

                            const data =
                                await getMarketCandles(
                                    stock,
                                    currentTF
                                );

                            if (
                                !Array.isArray(data) ||
                                !data.length
                            ) {

                                throw new Error(
                                    `No candle data for ${stock} ${currentTF}`
                                );

                            }

                            if (!stockDataRef.current[stock]) {
                                stockDataRef.current[stock] = {};
                            }

                            stockDataRef.current[stock][currentTF] =
                                data;

                            setStockData({
                                ...stockDataRef.current
                            });

                            setDataVersion(
                                previous => previous + 1
                            );

                            console.log(
                                `✅ ${stock} ${currentTF}: ${data.length} REAL candles`
                            );

                        } catch (error) {

                            console.error(
                                `❌ ${stock} ${currentTF} failed:`,
                                error
                            );

                        }

                    }

                }

                console.log(
                    `🏁 BACKGROUND ${currentTF} DATA LOADING COMPLETE`
                );

            },
            [
                currentTF,
                loadSelectedStockMTF,
                getMarketCandles,
                activeSource
            ]
        );

    /* =========================================================
       SELECT STOCK
    ========================================================= */

    const selectStock =
        useCallback(
            async function (stock) {

                const requestId =
                    ++selectionRequestId.current;

                setSelectedStock(
                    stock
                );

                console.log(
                    `🎯 Selected stock: ${stock}`
                );

                try {

                    /* =================================================
                       1. LOAD SELECTED CHART TIMEFRAME
                          FROM CACHE IF AVAILABLE
                    ================================================= */

                    let selectedCandles =
                        stockDataRef.current[
                            stock
                        ]?.[currentTF];

                    if (
                        Array.isArray(
                            selectedCandles
                        ) &&
                        selectedCandles.length
                    ) {

                        setCandles(
                            selectedCandles
                        );

                        console.log(
                            `♻️ Using cached ${stock} ${currentTF} data`
                        );

                    } else {

                        console.log(
                            `📡 Loading ${stock} ${currentTF} candles...`
                        );

                        selectedCandles =
                            await getMarketCandles(
                                stock,
                                currentTF
                            );

                        /*
                         * Do not allow an older request
                         * to overwrite a newer selection.
                         */

                        if (
                            requestId !==
                            selectionRequestId.current
                        ) {

                            return;

                        }

                        if (
                            !Array.isArray(
                                selectedCandles
                            ) ||
                            !selectedCandles.length
                        ) {

                            throw new Error(
                                `No candle data returned for ${stock} ${currentTF}`
                            );

                        }

                        if (!stockDataRef.current[stock]) {

                            stockDataRef.current[stock] =
                                {};

                        }

                        stockDataRef.current[
                            stock
                        ][currentTF] =
                            selectedCandles;

                        setStockData({
                            ...stockDataRef.current
                        });

                        setCandles(
                            selectedCandles
                        );

                        console.log(
                            `✅ ${stock} ${currentTF}: ${selectedCandles.length} REAL candles`
                        );

                    }

                    /* =================================================
                       2. SET PREVIOUS PRICE SAFELY
                    ================================================= */

                    if (
                        selectedCandles.length > 1
                    ) {

                        setPreviousPrice(
                            selectedCandles[
                                selectedCandles.length - 2
                            ].c
                        );

                    }

                    /* =================================================
                       3. LOAD 5M / 15M / 1H
                          FOR MTF RSI
                    ================================================= */

                    await loadSelectedStockMTF(
                        stock
                    );

                    if (
                        requestId !==
                        selectionRequestId.current
                    ) {

                        return;

                    }

                    console.log(
                        `✅ ${stock} is ready`
                    );

                } catch (error) {

                    console.error(
                        `❌ Failed to load ${stock}:`,
                        error
                    );

                }

                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });

            },
            [
                currentTF,
                loadSelectedStockMTF,
                getMarketCandles
            ]
        );

    /* =========================================================
       LOAD SELECTED TIMEFRAME
    ========================================================= */

    const loadSelectedTimeframe = useCallback(
        async (timeframe, stock = selectedStock) => {

            if (!stock) {

                console.error(
                    "❌ Cannot load timeframe: stock missing"
                );

                return;
            }

            console.log(
                `📊 Loading ${stock} ${timeframe}`
            );

            try {

                /*
                 * Fetch EXACT stock + EXACT timeframe.
                 */

                const data =
                    await getMarketCandles(
                        stock,
                        timeframe
                    );

                if (
                    !Array.isArray(data) ||
                    !data.length
                ) {

                    throw new Error(
                        `No candles for ${stock} ${timeframe}`
                    );

                }

                /*
                 * Store strictly by stock/timeframe.
                 */

                if (!stockDataRef.current[stock]) {
                    stockDataRef.current[stock] = {};
                }

                stockDataRef.current[stock][timeframe] =
                    data;

                /*
                 * Update displayed candles.
                 */

                setCandles(data);

                /*
                 * Previous CLOSED candle.
                 */

                if (data.length > 1) {

                    setPreviousPrice(
                        data[data.length - 2].c
                    );

                }

                /*
                 * Publish stock data.
                 */

                setStockData({
                    ...stockDataRef.current
                });

                setDataVersion(
                    previous => previous + 1
                );

                console.log(
                    `✅ ${stock} ${timeframe} loaded: ${data.length} candles`
                );

            } catch (error) {

                console.error(
                    `❌ Failed ${stock} ${timeframe}:`,
                    error
                );

            }

        },
        [selectedStock, getMarketCandles]
    );

    // ============================================================
    // AUTO LOAD MARKET DATA WHEN DATA SOURCE CHANGES
    // ============================================================

    useEffect(() => {

        let cancelled = false;

        const startMarketData = async () => {

            if (cancelled) return;

            console.log(
                `🚀 Loading market data for source: ${activeSource.toUpperCase()}`
            );

            try {

                await loadAllStockData();

            } catch (error) {

                console.error(
                    `❌ Failed to load ${activeSource.toUpperCase()} market data:`,
                    error
                );

            }

        };

        startMarketData();

        return () => {
            cancelled = true;
        };

    }, [activeSource, currentTF]);

    console.log(
        `📡 EMA360 market data source: ${activeSource.toUpperCase()}`
    );

    /* =========================================================
       RETURN
    ========================================================= */

    return {

        stocks,

        selectedStock,
        setSelectedStock,

        currentTF,
        setCurrentTF,

        candles,
        setCandles,

        previousPrice,
        setPreviousPrice,

        stockData,

        dataVersion,

        marketQuotes,
        marketIndices,

        loadAllStockData,
        loadSelectedStockMTF,
        loadSelectedTimeframe,
        selectStock

    };

}

export default useMarketData;