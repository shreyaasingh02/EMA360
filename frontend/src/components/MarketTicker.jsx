import React, { memo, useMemo } from "react";
// import "./MarketTicker.css";

const DEFAULT_SYMBOLS = [
    "NIFTY 50", "RELIANCE", "HDFCBANK", "ICICIBANK", "INFY",
    "BHARTIARTL", "SBIN", "TCS", "ITC", "LT",
    "AXISBANK", "KOTAKBANK", "TATAMOTORS", "BAJFINANCE", "TRENT",
    "SUNPHARMA", "NTPC", "BEL", "M&M", "MARUTI"
];

const toNumber = (...values) => {
    for (const value of values) {
        if (value === null || value === undefined || value === "") continue;
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return null;
};

const normalizeSymbol = value =>
    String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");

const formatPrice = value =>
    value == null ? "--" : Number(value).toLocaleString("en-IN", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });

const formatPercent = value =>
    value == null ? "--" :
        `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;

function candleRows(stockData = {}) {
    return Object.entries(stockData || {}).map(([symbol, timeframes]) => {
        if (!timeframes || typeof timeframes !== "object") return null;
        let newest = null;
        let previousDailyClose = null;

        for (const [timeframe, candles] of Object.entries(timeframes)) {
            if (!Array.isArray(candles) || !candles.length) continue;
            const last = candles[candles.length - 1];
            if (!last) continue;
            const lastTime = new Date(last.time ?? last.t ?? 0).getTime();
            const newestTime = newest
                ? new Date(newest.time ?? newest.t ?? 0).getTime()
                : -Infinity;
            if (!newest || (Number.isFinite(lastTime) && lastTime >= newestTime)) newest = last;

            if (["1D", "D", "ONE_DAY", "DAY"].includes(String(timeframe).toUpperCase()) && candles.length > 1) {
                const previous = candles[candles.length - 2];
                previousDailyClose = toNumber(previous?.c, previous?.close);
            }
        }

        if (!newest) return null;
        const price = toNumber(newest.c, newest.close, newest.ltp, newest.price);
        const change = previousDailyClose != null && price != null ? price - previousDailyClose : null;
        const percent = previousDailyClose > 0 && change != null ? change / previousDailyClose * 100 : null;
        return { symbol, price, change, percent, volume: toNumber(newest.v, newest.volume) ?? 0 };
    }).filter(Boolean);
}



function quoteRows(source = {}) {
    return Object.entries(source || {})
        .map(([key, quote]) => {
            if (!quote || typeof quote !== "object") return null;

            const symbol = quote.symbol || quote.name || key;

            const price = toNumber(
                quote.price,
                quote.ltp,
                quote.lastPrice,
                quote.last_traded_price
            );

            const previousClose = toNumber(
                quote.previousClose,
                quote.prevClose,
                quote.previous_close
            );

            const rawChange = toNumber(quote.change);

            const explicitPercent = toNumber(
                quote.percent,
                quote.percentChange,
                quote.changePercent,
                quote.percentageChange,
                quote.change_pct,
                quote.pChange,
                quote.pchange
            );

            let change = null;
            let percent = explicitPercent;

            if (price != null && previousClose != null && previousClose > 0) {
                change = price - previousClose;
                percent = (change / previousClose) * 100;
            } else if (rawChange != null) {
                if (quote.changeIsPercent === true) {
                    percent = rawChange;
                } else if (quote.changeIsPercent === false) {
                    change = rawChange;
                } else if (percent == null) {
                    // Use the API's `change` only if its documented meaning is percent.
                    percent = rawChange;
                }
            }

            return {
                symbol: String(symbol),
                price,
                change,
                percent,
                volume: toNumber(
                    quote.volume,
                    quote.totalTradedVolume
                ) ?? 0
            };
        })
        .filter(Boolean);
}



function MarketTicker({
    stocks = [], stockData = {}, marketQuotes = {}, marketIndices = {},
    selectedStock, onStockChange, session = null, dataVersion = 0
}) {
    const isAngel = session?.dataSource === "angel";
    console.log("TICKER INPUTS", {
        source: session?.dataSource,
        stockDataKeys: Object.keys(stockData || {}),
        marketQuoteKeys: Object.keys(marketQuotes || {}),
        marketIndexKeys: Object.keys(marketIndices || {}),
        dataVersion
    });

    const rows = useMemo(() => {
        // Strict source separation: no NSE fallback in Angel One mode.
        const rawRows = isAngel
            ? [...quoteRows(marketQuotes), ...candleRows(stockData)]
            : [...quoteRows(marketIndices), ...quoteRows(marketQuotes)];

        console.log("Ticker source:", isAngel ? "Angel One" : "NSE");
        console.log("Ticker raw rows:", rawRows.slice(0, 5));
        const bySymbol = new Map();
        for (const row of rawRows) {
            const key = normalizeSymbol(row.symbol);
            if (!key) continue;
            const existing = bySymbol.get(key);
            if (!existing || (existing.price == null && row.price != null)) {
                bySymbol.set(key, row);
            } else if (existing.percent == null && row.percent != null) {
                bySymbol.set(key, { ...existing, ...row });
            }
        }

        const available = [...bySymbol.values()].filter(row => row.price != null);
        available.sort((a, b) =>
            Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0) ||
            (b.volume ?? 0) - (a.volume ?? 0)
        );

        const placeholders = (stocks.length ? stocks : DEFAULT_SYMBOLS)
            .filter(symbol => !bySymbol.has(normalizeSymbol(symbol)))
            .map(symbol => ({
                symbol: String(symbol), price: null, change: null, percent: null,
                volume: 0, isPlaceholder: true
            }));

        return [...available, ...placeholders].slice(0, 20);
    }, [isAngel, stocks, stockData, marketQuotes, marketIndices, dataVersion]);

    return (
        <div className="ema360-ticker" aria-label="Market ticker">
            <div className="ema360-ticker-track">
                {rows.map((row, index) => {
                    const tone = row.percent > 0 ? "up" : row.percent < 0 ? "down" : "flat";
                    return (
                        <button
                            type="button"
                            className="ema360-ticker-item"
                            key={`${normalizeSymbol(row.symbol)}-${index}`}
                            onClick={() => onStockChange?.(row.symbol)}
                            title={`Select ${row.symbol}`}
                        >
                            <span className="ema360-ticker-symbol">
                                {row.symbol}
                                {selectedStock && normalizeSymbol(selectedStock) === normalizeSymbol(row.symbol)
                                    ? <span className="ema360-ticker-selected"> •</span> : null}
                            </span>
                            <span className={`ema360-ticker-price ${tone}`}>
                                {formatPrice(row.price)}
                            </span>
                            <span className={`ema360-ticker-change ${tone}`}>
                                {formatPercent(row.percent)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default memo(MarketTicker);
