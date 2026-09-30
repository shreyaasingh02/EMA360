const API_BASE_URL = "http://localhost:3000";


/* =========================================================
   GET SYMBOLS
========================================================= */

export async function getSymbols() {

    const response =
        await fetch(
            `${API_BASE_URL}/api/symbols`
        );

    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}`
        );

    }

    return await response.json();
}


/* =========================================================
   GET HISTORICAL CANDLES
========================================================= */

export async function getHistoricalCandles(
    symbol,
    timeframe
) {

    const url =
        `${API_BASE_URL}/api/historical-candles` +
        `?symbol=${encodeURIComponent(symbol)}` +
        `&timeframe=${encodeURIComponent(timeframe)}`;

    const response =
        await fetch(url);

    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}`
        );

    }

    const data =
        await response.json();

    if (
        !Array.isArray(data) ||
        !data.length
    ) {

        throw new Error(
            `No candle data returned for ${symbol} ${timeframe}`
        );

    }

    return data;
}




/* =========================================================
   GET NSE MARKET CANDLES
   Used by Guest mode.
========================================================= */
export async function getNseMarketCandles(symbol, timeframe) {

    const url =
        `${API_BASE_URL}/api/market/nse/candles` +
        `?symbol=${encodeURIComponent(symbol)}` +
        `&timeframe=${encodeURIComponent(timeframe)}`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`NSE HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (!Array.isArray(payload?.candles) || !payload.candles.length) {
        throw new Error(
            `No NSE candle data returned for ${symbol} ${timeframe}`
        );
    }

    return payload.candles;
}

/* =========================================================
   GET NSE CURRENT QUOTE
   Used by Guest mode for near-live LTP updates.
========================================================= */
export async function getNseMarketQuote(symbol) {

    const url =
        `${API_BASE_URL}/api/market/nse/quote` +
        `?symbol=${encodeURIComponent(symbol)}`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`NSE quote HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (!payload?.success || !Number.isFinite(Number(payload?.price))) {
        throw new Error(
            payload?.message ||
            `No NSE live quote returned for ${symbol}`
        );
    }

    return payload;
}

/* =========================================================
   GET ALL NIFTY 50 NSE QUOTES
   Used by Guest mode so the 50-stock table updates without
   requiring the user to click each stock.
========================================================= */
export async function getNseMarketQuotes() {

    const response = await fetch(
        `${API_BASE_URL}/api/market/nse/quotes`
    );

    if (!response.ok) {
        throw new Error(`NSE quotes HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (!payload?.success || !payload?.quotes) {
        throw new Error(
            payload?.message ||
            "No NSE market quotes returned"
        );
    }

    return payload.quotes;
}

/* =========================================================
   GET NSE INDEX MARKET CARDS
========================================================= */
export async function getNseMarketIndices() {

    const response = await fetch(
        `${API_BASE_URL}/api/market/nse/indices`
    );

    if (!response.ok) {
        throw new Error(`NSE indices HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (!payload?.success || !payload?.indices) {
        throw new Error(
            payload?.message ||
            "No NSE index data returned"
        );
    }

    return payload.indices;
}

/* =========================================================
   CREATE LIVE STREAM
========================================================= */

export function createLiveStream() {

    return new EventSource(
        `${API_BASE_URL}/api/stream`
    );

}