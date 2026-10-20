
import React, { useEffect, useState } from "react";

const API_BASE =
  (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "") ||
  (window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://ema360-backend.onrender.com");

const columns = [
  ["symbol", "SYMBOL"],
  ["open", "OPEN"],
  ["high", "HIGH"],
  ["low", "LOW"],
  ["previousClose", "PREV. CLOSE"],
  ["ltp", "LTP"],
  ["pChange", "%CHNG"],
  ["volume", "VOLUME (Shares)"],
  ["value", "VALUE (₹ Lakhs)"],
  ["ca", "CA"]
];

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || value === "") return "—";

  const number = Number(value);
  if (!Number.isFinite(number)) return value;

  return number.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export default function NseTopMovers() {
  const [activeTab, setActiveTab] = useState("gainers");
  const [data, setData] = useState({ gainers: [], losers: [] });
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;

    async function loadMovers() {
      try {
        const response = await fetch(
          `${API_BASE}/api/market/nse/top-movers`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error(`API error ${response.status}`);
        }

        const json = await response.json();
        if (!json.success) {
          throw new Error(json.message || "NSE data unavailable");
        }

        if (!active) return;

        const next = {
          gainers: Array.isArray(json.gainers) ? json.gainers : [],
          losers: Array.isArray(json.losers) ? json.losers : []
        };

        setData(next);
        setStatus("ready");
      } catch (error) {
        console.error("NSE Top Movers error:", error);
        if (active) setStatus("error");
      }
    }

    loadMovers();
    const timer = window.setInterval(loadMovers, 60000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const rows = data[activeTab];

  return (
    <section className="ema360-top-movers">
      <div className="ema360-movers-tabs">
        <button
          type="button"
          className={activeTab === "gainers" ? "active gainers" : ""}
          onClick={() => setActiveTab("gainers")}
        >
          GAINERS
        </button>

        <button
          type="button"
          className={activeTab === "losers" ? "active losers" : ""}
          onClick={() => setActiveTab("losers")}
        >
          LOSERS
        </button>

        <span className="ema360-movers-source">NSE · NIFTY 50</span>
      </div>

      {status === "loading" && (
        <div className="ema360-movers-message">
          Loading NSE market data…
        </div>
      )}

      {status === "error" && (
        <div className="ema360-movers-message error">
          Unable to load NSE data. Check the backend API response.
        </div>
      )}

      {status === "ready" && (
        <div className="ema360-movers-table-wrap">
          <table className="ema360-movers-table">
            <thead>
              <tr>
                {columns.map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => {
                const change = Number(row.pChange);
                const positive = change >= 0;

                return (
                  <tr key={`${row.symbol}-${index}`}>
                    {columns.map(([key]) => {
                      const value = row[key];

                      if (key === "symbol") {
                        return (
                          <td key={key} className="mover-symbol">
                            {value || "—"}
                          </td>
                        );
                      }

                      if (key === "pChange") {
                        return (
                          <td
                            key={key}
                            className={positive ? "mover-positive" : "mover-negative"}
                          >
                            {Number.isFinite(change)
                              ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%`
                              : "—"}
                          </td>
                        );
                      }

                      if (key === "volume") {
                        return (
                          <td key={key}>
                            {formatNumber(value, 0)}
                          </td>
                        );
                      }

                      if (key === "ca") {
                        return <td key={key}>{value || "—"}</td>;
                      }

                      return (
                        <td key={key}>
                          {formatNumber(value, 2)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="mover-empty">
                    No rows returned by the NSE API.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
