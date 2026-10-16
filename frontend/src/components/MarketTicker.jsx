import React, { useMemo } from "react";
// import "./MarketTicker.css";

const INDEXES = [
  ["NIFTY 50", "NIFTY 50"],
  ["BANKNIFTY", "BANKNIFTY"],
  ["FINNIFTY", "FINNIFTY"],
  ["NIFTYIT", "NIFTY IT"],
  ["NIFTYMIDCAP100", "NIFTY MIDCAP 100"],
  ["NIFTYNXT50", "NIFTY NEXT 50"],
  ["NIFTYPHARMA", "NIFTY PHARMA"],
  ["NIFTYSMALL100", "NIFTY SMALL 100"],
];
const EXTRA_STOCKS = [
  "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "BHARTIARTL",
  "ITC", "LT", "AXISBANK", "KOTAKBANK", "BAJFINANCE", "MARUTI", "TATAMOTORS",
  "SUNPHARMA", "WIPRO", "HCLTECH", "TITAN", "ULTRACEMCO", "NTPC", "POWERGRID",
  "ONGC", "BEL", "TRENT",
];

function entries(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).map(([symbol, item]) =>
    item && typeof item === "object" ? { symbol, ...item } : { symbol, price: item }
  );
}
function symbolOf(item, fallback = "") {
  return String(item?.symbol || item?.name || item?.tradingSymbol || item?.stock || fallback)
    .trim().toUpperCase();
}
function num(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(String(value).replace(/,/g, "").replace(/%$/, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function priceOf(item) {
  if (!item || typeof item !== "object") return num(item);

  // Direct quote/index values
  const direct = num(
    item.price,
    item.ltp,
    item.lastPrice,
    item.indexValue,
    item.currentValue,
    item.close,
    item.c,
    item.last
  );

  if (direct !== null && direct > 0) return direct;

  // Handle stockData[symbol][timeframe] candle structure
  const histories = [
    item["1M"],
    item["3M"],
    item["5M"],
    item["15M"],
    item["30M"],
    item["1H"],
    item["1D"],
    item.candles,
    item.data,
    item.history
  ];

  let newestCandle = null;

  for (const history of histories) {
    if (!Array.isArray(history) || !history.length) continue;

    const last = history[history.length - 1];
    if (!last) continue;

    const lastTime = new Date(last.time).getTime();
    const newestTime = newestCandle
      ? new Date(newestCandle.time).getTime()
      : -Infinity;

    if (!newestCandle || lastTime > newestTime) {
      newestCandle = last;
    }
  }

  if (newestCandle) {
    return num(
      newestCandle.c,
      newestCandle.close,
      newestCandle.ltp,
      newestCandle.price,
      newestCandle[4]
    );
  }

  return null;
}

function changeOf(item, price) {
  if (!item || typeof item !== "object") return null;
  const percent = num(item.changePercent, item.pChange, item.percentChange,
    item.percentageChange, item.changePct);
  if (percent !== null) return percent;
  const previous = num(item.previousClose, item.prevClose, item.previous_close);
  if (price !== null && previous !== null && previous > 0) return ((price - previous) / previous) * 100;
  return null;
}
function fmtPrice(price) {
  return price === null ? "—" : price.toLocaleString("en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function fmtChange(change) {
  if (change === null) return "—";
  return `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
}

export default function MarketTicker({
  stocks = [],
  stockData = {},
  dataVersion,
  marketQuotes = {},
  marketIndices = {},
  selectedStock,
  onStockChange,
  session,
}) {
  const isAngel = String(session?.dataSource || (session?.brokerConnected ? "angel" : "nse")).toLowerCase() === "angel";

  const items = useMemo(() => {
    const indices = entries(marketIndices);
    const quotes = entries(marketQuotes);
    const stockRows = entries(stockData);
    const indexMap = new Map(indices.map((row) => [symbolOf(row), row]));
    const quoteMap = new Map(quotes.map((row) => [symbolOf(row), row]));
    const stockMap = new Map(stockRows.map((row) => [symbolOf(row), row]));
    const names = [
      ...INDEXES.map(([key]) => key),
      ...stocks.map((row) => typeof row === "string" ? row : symbolOf(row)),
      ...stockRows.map((row) => symbolOf(row)),
      ...quotes.map((row) => symbolOf(row)),
      ...EXTRA_STOCKS,
    ].filter(Boolean);

    const unique = [...new Set(names.map((name) => String(name).toUpperCase()))];
    return unique.map((symbol) => {
      const row = indexMap.get(symbol) || quoteMap.get(symbol) || stockMap.get(symbol);
      const price = priceOf(row);
      return { symbol, price, change: changeOf(row, price) };
    });
  }, [stocks, stockData, dataVersion, marketQuotes, marketIndices]);

  const select = (symbol) => onStockChange?.(symbol);
  const renderGroup = (copy) => items.map((item) => {
    const tone = item.change === null ? "neutral" : item.change > 0 ? "up" : item.change < 0 ? "down" : "flat";
    return (
      <button
        className="ema360-ticker-item"
        key={`${copy}-${item.symbol}`}
        type="button"
        onClick={() => select(item.symbol)}
        title={`Select ${item.symbol}`}
        tabIndex={copy ? -1 : 0}
      >
        <span className="ema360-ticker-symbol">{item.symbol}</span>
        <span className={`ema360-ticker-value ${tone}`}>
          {fmtPrice(item.price)} <small>{fmtChange(item.change)}</small>
        </span>
      </button>
    );
  });

  return (
    <div className="ema360-market-ticker" aria-label={`${isAngel ? "Angel One" : "NSE"} scrolling market ticker`}>
      <div className="ema360-ticker-track">
        <div className="ema360-ticker-group">{renderGroup(0)}</div>
        <div className="ema360-ticker-group" aria-hidden="true">{renderGroup(1)}</div>
      </div>
    </div>
  );
}
