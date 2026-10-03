const API_BASE_URL =
    import.meta.env.VITE_API_URL || "http://localhost:3000";


/* =========================================================
   GET SYMBOLS
========================================================= */

export async function getSymbols() {

    const response = await fetch(
        `${API_BASE_URL}/api/symbols`,
        {
            credentials: "include"
        }
    );

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
}


/* =========================================================
   ANGEL ONE — HISTORICAL CANDLES
========================================================= */

export async function getHistoricalCandles(
    symbol,
    timeframe
) {

    const url =
        `${API_BASE_URL}/api/historical-candles` +
        `?symbol=${encodeURIComponent(symbol)}` +
        `&timeframe=${encodeURIComponent(timeframe)}`;

    const response = await fetch(
        url,
        {
            credentials: "include"
        }
    );

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

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
   NSE — MARKET CANDLES
========================================================= */

export async function getNseMarketCandles(
    symbol,
    timeframe = "5M"
) {
    const normalizedSymbol = String(
        symbol || ""
    )
        .trim()
        .toUpperCase();

    const normalizedTimeframe = String(
        timeframe || "5M"
    )
        .trim()
        .toLowerCase();

    const response = await fetch(
        `${API_BASE_URL}/api/market/nse/candles?symbol=${encodeURIComponent(
            normalizedSymbol
        )}&timeframe=${encodeURIComponent(
            normalizedTimeframe
        )}`,
        {
            cache: "no-store"
        }
    );

    if (!response.ok) {
        throw new Error(
            `NSE candles failed: HTTP ${response.status}`
        );
    }

    const data = await response.json();

    if (!data?.success) {
        throw new Error(
            data?.message || "NSE candles failed"
        );
    }

    return Array.isArray(data.candles)
        ? data.candles
        : [];
}


/* =========================================================
   NSE — SINGLE MARKET QUOTE
========================================================= */

export async function getNseMarketQuote(symbol) {
    const normalizedSymbol = String(
        symbol || ""
    )
        .trim()
        .toUpperCase();

    if (!normalizedSymbol) {
        throw new Error("NSE symbol is required");
    }

    const response = await fetch(
        `${API_BASE_URL}/api/market/nse/quote?symbol=${encodeURIComponent(
            normalizedSymbol
        )}`,
        {
            cache: "no-store"
        }
    );

    if (!response.ok) {
        throw new Error(
            `NSE quote failed: HTTP ${response.status}`
        );
    }

    const data = await response.json();

    if (!data?.success) {
        throw new Error(
            data?.message || "NSE quote failed"
        );
    }

    return data;
}


/* =========================================================
   NSE — MULTIPLE MARKET QUOTES
========================================================= */

export async function getNseMarketQuotes() {
    const response = await fetch(
        `${API_BASE_URL}/api/market/nse/quotes`,
        {
            cache: "no-store"
        }
    );

    if (!response.ok) {
        throw new Error(
            `NSE market quotes failed: HTTP ${response.status}`
        );
    }

    const data = await response.json();

    if (!data?.success) {
        throw new Error(
            data?.message || "NSE market quotes failed"
        );
    }

    return data.quotes || {};
}


/* =========================================================
   NSE — MARKET INDICES
========================================================= */

export async function getNseMarketIndices() {
    const response = await fetch(
        `${API_BASE_URL}/api/market/nse/indices`,
        {
            cache: "no-store"
        }
    );

    if (!response.ok) {
        throw new Error(
            `NSE market indices failed: HTTP ${response.status}`
        );
    }

    const data = await response.json();

    if (!data?.success) {
        throw new Error(
            data?.message || "NSE market indices failed"
        );
    }

    return data.indices || {};
}


/* =========================================================
   LIVE STREAM
========================================================= */

export function createLiveStream() {

    return new EventSource(
        `${API_BASE_URL}/api/stream`,
        {
            withCredentials: true
        }
    );

}