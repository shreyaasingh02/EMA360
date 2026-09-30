import React, { useEffect, useMemo, useState } from "react";

function Header({
  selectedStock,
  stocks = [],
  stockData = {},
  marketQuotes = {},
  marketIndices = {},
  activePage,
  onNavigate,
  onStockChange,
  session = null,
  onLogout,
}) {


  console.log("🔥 HEADER stockData:", stockData);
  console.log("🔥 HEADER stockData keys:", Object.keys(stockData || {}));
  const [search, setSearch] = useState("");

  // ---------------------------------------------------------
  // HEADER MARKET DATA IS ALWAYS NSE
  // ---------------------------------------------------------
  // The selected chart/data source may be Angel One, but the
  // top market ticker must always use NSE data.
  const [nseHeaderQuotes, setNseHeaderQuotes] = useState({});
  const [nseHeaderIndices, setNseHeaderIndices] = useState({});

  useEffect(() => {
    let cancelled = false;

    const getApiBase = () => {
      if (typeof window === "undefined") return "http://localhost:3000";
      return window.location.hostname === "localhost"
        ? "http://localhost:3000"
        : "";
    };

    const loadNseHeader = async () => {
      const base = getApiBase();

      try {
        const [quotesResponse, indicesResponse] = await Promise.all([
          fetch(`${base}/api/market/nse/quotes`, { cache: "no-store" }),
          fetch(`${base}/api/market/nse/indices`, { cache: "no-store" }),
        ]);

        const quotesJson = await quotesResponse.json();
        const indicesJson = await indicesResponse.json();

        if (cancelled) return;

        if (quotesJson?.success && quotesJson?.quotes) {
          setNseHeaderQuotes(quotesJson.quotes);
        }

        if (indicesJson?.success && indicesJson?.indices) {
          setNseHeaderIndices(indicesJson.indices);
        }
      } catch (error) {
        console.warn("NSE header market data unavailable:", error?.message || error);
      }
    };

    loadNseHeader();
    const interval = setInterval(loadNseHeader, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * TOP NAVIGATION
   * ---------------------------------------------------------
   */

  const navItems = [
    "Markets",
    "Screeners",
    "Insider Trades",
    "Long Deals"
  ];

  /*
   * ---------------------------------------------------------
   * MARKET TICKER
   * ---------------------------------------------------------
   *
   * These are the main indices we want to show.
   *
   * We first try to get their values from your existing
   * stockData. If the API data is not available yet,
   * "--" is shown instead of inventing a value.
   */

  const tickerSymbols = [
    {
      name: "BANKNIFTY",
      key: "BANKNIFTY",
    },
    {
      name: "RELIANCE",
      key: "RELIANCE",
    },
    {
      name: "FINNIFTY",
      key: "FINNIFTY",
    },
    {
      name: "NIFTY 50",
      key: "NIFTY 50",
    },
    {
      name: "NIFTYIT",
      key: "NIFTYIT",
    },
    {
      name: "NIFTYMIDCAP100",
      key: "NIFTYMIDCAP100",
    },
    {
      name: "NIFTYNXT50",
      key: "NIFTYNXT50",
    },
    {
      name: "NIFTYPHARMA",
      key: "NIFTYPHARMA",
    },
    {
      name: "NIFTYSMALL100",
      key: "NIFTYSMALL100",
    },
  ];

  const marketSymbols = [
    { label: "BANKNIFTY", keys: ["BANKNIFTY", "NIFTY BANK", "NIFTYBANK"] },
    { label: "RELIANCE", keys: ["RELIANCE"] },
    { label: "FINNIFTY", keys: ["FINNIFTY", "NIFTY FIN SERVICE"] },
    { label: "NIFTY 50", keys: ["NIFTY 50", "NIFTY", "NIFTY50"] },
    { label: "NIFTYIT", keys: ["NIFTYIT", "NIFTY IT"] },
    { label: "NIFTYMIDCAP100", keys: ["NIFTYMIDCAP100", "NIFTY MIDCAP 100"] },
    { label: "NIFTYNXT50", keys: ["NIFTYNXT50", "NIFTY NEXT 50"] },
    { label: "NIFTYPHARMA", keys: ["NIFTYPHARMA", "NIFTY PHARMA"] },
    { label: "NIFTYSMALL100", keys: ["NIFTYSMALL100", "NIFTY SMALL 100"] },
  ];



  /*
   * ---------------------------------------------------------
   * GET MARKET DATA
   * ---------------------------------------------------------
   */

  function getMarketData(keys) {
    // IMPORTANT:
    // Header market cards are ALWAYS NSE.
    // Even when the user is logged into / using Angel One,
    // never read Angel One stockData for these cards.

    let data = null;

    for (const key of keys || []) {
      const upperKey = String(key).toUpperCase();

      if (nseHeaderQuotes?.[upperKey]) {
        data = nseHeaderQuotes[upperKey];
        break;
      }

      if (nseHeaderIndices?.[upperKey]) {
        data = nseHeaderIndices[upperKey];
        break;
      }

      // Keep existing NSE props as an initial/fallback snapshot.
      if (marketQuotes?.[upperKey]) {
        data = marketQuotes[upperKey];
        break;
      }

      if (marketIndices?.[upperKey]) {
        data = marketIndices[upperKey];
        break;
      }
    }

    if (!data) {
      return {
        price: null,
        change: null,
        percent: null,
      };
    }

    const price = Number(data.price);
    const previousClose = Number(data.previousClose);

    const change =
      Number.isFinite(price) &&
        Number.isFinite(previousClose) &&
        previousClose > 0
        ? price - previousClose
        : null;

    const percent = Number.isFinite(Number(data.change))
      ? Number(data.change)
      : null;

    return {
      price: Number.isFinite(price) ? price : null,
      change,
      percent,
    };
  }

  /*
   * ---------------------------------------------------------
   * SEARCH
   * ---------------------------------------------------------
   */

  const filteredStocks = useMemo(() => {
    if (!search.trim()) {
      return [];
    }

    return stocks.filter(stock =>
      String(stock)
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [search, stocks]);

  function handleSearchSelect(stock) {
    setSearch("");
    onStockChange?.(stock);
  }

  /*
   * ---------------------------------------------------------
   * FORMAT NUMBER
   * ---------------------------------------------------------
   */

  function formatPrice(value) {
    if (value === null || value === undefined) {
      return "--";
    }

    return Number(value).toLocaleString(
      "en-IN",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    );
  }

  function formatChange(value) {
    if (value === null || value === undefined) {
      return "--";
    }

    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
  }

  function formatPercent(value) {
    if (value === null || value === undefined) {
      return "--";
    }

    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  }

  /*
   * ---------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------
   */

  return (
    <header className="ema360-header">

      {/* =====================================================
          TOP NAVIGATION BAR
      ===================================================== */}

      <div className="ema360-topbar">

        {/* LOGO */}

        <div className="ema360-logo">
          <span className="logo-white">
            EMA
          </span>

          <span className="logo-green">
            360
          </span>
        </div>


        {/* NAVIGATION */}

        <nav className="ema360-nav">

          {navItems.map(item => (

            <button
              key={item}
              className={
                item === "Subscribe"
                  ? "nav-item subscribe"
                  : "nav-item"
              }
              onClick={() => {
                if (item === "Screeners") {
                  onNavigate?.("scanner");
                  return;
                }

                if (item === "Markets") {
                  onNavigate?.("dashboard");
                  return;
                }

                if (item === "Long Deals") {
                  onNavigate?.("longDeals");
                  return;
                }

                console.log(`${item} clicked`);
              }}
            >
              {item}

              {item === "More" && (
                <span className="more-arrow">
                  ⌄
                </span>
              )}
            </button>

          ))}

        </nav>


        {/* SEARCH */}

        <div className="header-search-wrapper">

          <span className="search-icon">
            ⌕
          </span>

          <input
            type="text"
            value={search}
            placeholder="Search Stock, IPO, MF"
            onChange={e =>
              setSearch(e.target.value)
            }
          />


          {/* SEARCH RESULTS */}

          {filteredStocks.length > 0 && (

            <div className="header-search-results">

              {filteredStocks
                .slice(0, 8)
                .map(stock => (

                  <button
                    key={stock}
                    onClick={() =>
                      handleSearchSelect(stock)
                    }
                  >
                    {stock}
                  </button>

                ))}

            </div>

          )}

        </div>


        <select
          className="header-stock-selector"
          value={selectedStock}
          onChange={(e) => onStockChange(e.target.value)}
        >
          {stocks.map((stock) => (
            <option key={stock} value={stock}>
              {stock}
            </option>
          ))}
        </select>


        {/* LOGIN / LOGOUT */}

        <button
          className="login-button"
          onClick={() => {
            if (session) {
              onLogout?.();
            }
          }}
        >
          {session ? "Login / Sign up" : "Logout"}
        </button>

      </div>


      {/* =====================================================
          MARKET TICKER
      ===================================================== */}

      <div className="ema360-market-ticker">
        <div className="ticker-track">
          {marketSymbols.map((item) => {
            const data = getMarketData(item.keys);

            const price = data?.price ?? null;
            const change = data?.change ?? null;
            const percent = data?.percent ?? null;

            const isNegative = change !== null && change < 0;

            return (
              <button
                key={item.label}
                className={`ticker-item ${selectedStock === item.label ? "ticker-selected" : ""
                  }`}
                onClick={() => onStockChange(item.label)}
              >
                <span className="ticker-name">
                  {item.label}
                </span>

                <div className="ticker-values">
                  <span
                    className={`ticker-price ${isNegative ? "negative" : "positive"
                      }`}
                  >
                    {price !== null
                      ? Number(price).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                      : "--"}
                  </span>

                  <span
                    className={`ticker-change ${isNegative ? "negative" : "positive"
                      }`}
                  >
                    {change !== null
                      ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}`
                      : "--"}
                  </span>

                  <span
                    className={`ticker-change ${isNegative ? "negative" : "positive"
                      }`}
                  >
                    {percent !== null
                      ? `(${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%)`
                      : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

    </header>
  );
}

export default Header;