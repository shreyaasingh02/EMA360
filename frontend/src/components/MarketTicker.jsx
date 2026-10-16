
import React, { useMemo } from "react";

function entries(value) {
  if (Array.isArray(value)) return value;

  if (!value || typeof value !== "object") return [];

  return Object.entries(value).map(([symbol, item]) =>
    item && typeof item === "object"
      ? { ...item, symbol: item.symbol || symbol }
      : { symbol, price: item }
  );
}

function number(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;

    const parsed = Number(String(value).replace(/,/g, "").replace(/%/g, ""));

    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function getSymbol(item) {
  return String(
    item?.symbol || item?.name || item?.tradingSymbol || item?.stock || ""
  )
    .trim()
    .toUpperCase()
    .replace(/[-_](EQ|BE|BZ|SM)$/i, "");
}

function getPrice(item) {
  if (!item) return null;

  const direct = number(
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

  // Angel One stockData stores candles by timeframe.
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
    item.history,
  ];

  let newest = null;

  for (const history of histories) {
    if (!Array.isArray(history) || !history.length) continue;

    const last = history[history.length - 1];
    if (!last) continue;

    const time = new Date(last.time).getTime();
    const newestTime = newest
      ? new Date(newest.time).getTime()
      : -Infinity;

    if (!newest || (Number.isFinite(time) && time > newestTime)) {
      newest = last;
    }
  }

  return number(newest?.c, newest?.close, newest?.ltp, newest?.price, newest?.[4]);
}

function getChange(item, price, previousCandle = null) {
  const supplied = number(
    item?.change,
    item?.changePercent,
    item?.pChange,
    item?.percentChange,
    item?.percentageChange,
    item?.changePct
  );

  if (supplied !== null) return supplied;

  const previousClose = number(
    item?.previousClose,
    item?.prevClose,
    item?.previous_close
  );

  if (price !== null && previousClose > 0) {
    return ((price - previousClose) / previousClose) * 100;
  }

  // For Angel One, use the preceding daily candle when available.
  if (price !== null && previousCandle > 0) {
    return ((price - previousCandle) / previousCandle) * 100;
  }

  return null;
}

function getAngelRows(stockData) {
  return entries(stockData).map((item) => {
    const symbol = getSymbol(item);
    const histories = Object.values(item || {}).filter(
      (value) => Array.isArray(value) && value.length
    );

    let newest = null;

    for (const history of histories) {
      const last = history[history.length - 1];

      if (
        last &&
        (!newest ||
          new Date(last.time).getTime() >
            new Date(newest.time).getTime())
      ) {
        newest = last;
      }
    }

    const price = getPrice(item);

    // Use the previous daily candle for the day-change calculation.
    const daily = Array.isArray(item["1D"]) ? item["1D"] : [];
    const previousDailyClose =
      daily.length >= 2
        ? number(daily[daily.length - 2]?.c, daily[daily.length - 2]?.close)
        : null;

    const change = getChange(item, price, previousDailyClose);

    return { symbol, price, change, source: "ANGEL" };
  });
}

function formatPrice(price) {
  return price === null
    ? "—"
    : price.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

function formatChange(change) {
  if (change === null) return "—";

  const sign = change > 0 ? "+" : change < 0 ? "−" : "";

  return `${sign}${Math.abs(change).toFixed(2)}%`;
}

export default function MarketTicker({
  stockData = {},
  dataVersion,
  marketQuotes = {},
  selectedStock,
  onStockChange,
  session,
}) {
  const isAngel =
    String(
      session?.dataSource ||
        (session?.brokerConnected ? "angel" : "nse")
    ).toLowerCase() === "angel";

  const items = useMemo(() => {
    let rows = [];

    if (isAngel) {
      // Never mix NSE quotes into Angel One mode.
      rows = getAngelRows(stockData);
    } else {
      // The NSE endpoint currently supplies NIFTY 50 constituents.
      rows = entries(marketQuotes).map((item) => {
        const price = number(
          item.price,
          item.ltp,
          item.lastPrice,
          item.last,
          item.close
        );

        return {
          symbol: getSymbol(item),
          price: price !== null && price > 0 ? price : null,
          change: getChange(item, price),
          volume: number(item.volume, item.totalTradedVolume),
          source: "NSE",
        };
      });
    }

    // Exclude invalid quotes and stocks without a usable change value.
    // Rank the strongest movers first; use volume to break ties.
    return rows
      .filter(
        (item) =>
          item.symbol &&
          item.price !== null &&
          item.price > 0 &&
          item.change !== null
      )
      .sort(
        (a, b) =>
          Math.abs(b.change) - Math.abs(a.change) ||
          (b.volume || 0) - (a.volume || 0)
      )
      .slice(0, 20);
  }, [isAngel, stockData, dataVersion, marketQuotes]);

  const renderItems = (copy) =>
    items.map((item) => {
      const tone =
        item.change > 0 ? "up" : item.change < 0 ? "down" : "flat";

      return (
        <button
          className="ema360-ticker-item"
          key={`${copy}-${item.symbol}`}
          type="button"
          onClick={() => onStockChange?.(item.symbol)}
          title={`Select ${item.symbol}`}
          tabIndex={copy ? -1 : 0}
        >
          <span className="ema360-ticker-symbol">{item.symbol}</span>

          <span className={`ema360-ticker-value ${tone}`}>
            {formatPrice(item.price)}
            <small>{formatChange(item.change)}</small>
          </span>
        </button>
      );
    });

  if (!items.length) {
    return (
      <div
        className="ema360-market-ticker"
        aria-label="Market ticker"
      >
        <div className="ema360-ticker-empty">
          Waiting for {isAngel ? "Angel One" : "NSE"} market data…
        </div>
      </div>
    );
  }

  return (
    <div
      className="ema360-market-ticker"
      aria-label={`${isAngel ? "Angel One" : "NSE"} trending stocks`}
    >
      <div className="ema360-ticker-track">
        <div className="ema360-ticker-group">{renderItems(0)}</div>
        <div className="ema360-ticker-group" aria-hidden="true">
          {renderItems(1)}
        </div>
      </div>
    </div>
  );
}
