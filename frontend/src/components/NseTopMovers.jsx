
import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
    (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "") ||
    (window.location.hostname === "localhost"
        ? "http://localhost:3000"
        : "https://ema360-backend.onrender.com");

const formatPrice = value => {
    const n = Number(value);
    return Number.isFinite(n)
        ? n.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
          })
        : "—";
};

const formatPercent = value => {
    const n = Number(value);
    return Number.isFinite(n)
        ? `${n > 0 ? "+" : ""}${n.toFixed(2)}%`
        : "—";
};

export default function NseTopMovers() {
    const [data, setData] = useState({
        gainers: [],
        losers: []
    });

    const [status, setStatus] = useState("loading");

    useEffect(() => {
        let alive = true;

        const loadMovers = async () => {
            try {
                const response = await fetch(
                    `${API_BASE}/api/market/nse/top-movers`
                );

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const json = await response.json();

                if (!json.success) {
                    throw new Error(json.message || "NSE data unavailable");
                }

                if (!alive) return;

                const next = {
                    gainers: Array.isArray(json.gainers)
                        ? json.gainers
                        : [],
                    losers: Array.isArray(json.losers)
                        ? json.losers
                        : []
                };

                setData(next);
                setStatus(
                    next.gainers.length || next.losers.length
                        ? "ready"
                        : "empty"
                );
            } catch (error) {
                console.error("NSE top movers:", error);

                if (alive) setStatus("error");
            }
        };

        loadMovers();

        const timer = window.setInterval(loadMovers, 60000);

        return () => {
            alive = false;
            window.clearInterval(timer);
        };
    }, []);

    const items = useMemo(
        () => [
            ...data.gainers.map(item => ({
                ...item,
                side: "Gainer"
            })),
            ...data.losers.map(item => ({
                ...item,
                side: "Loser"
            }))
        ],
        [data]
    );

    const shell = {
        width: "100%",
        minWidth: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 0",
        background: "var(--ema360-movers-bg, #0b1220)",
        borderTop: "1px solid rgba(148,163,184,.16)",
        borderBottom: "1px solid rgba(148,163,184,.16)",
        color: "#e5e7eb",
        fontSize: 12
    };

    if (status !== "ready" || !items.length) {
        return (
            <div style={shell}>
                <strong style={{ padding: "0 12px", whiteSpace: "nowrap" }}>
                    NSE · NIFTY 50
                </strong>
                <span>
                    {status === "loading"
                        ? "Loading NSE movers…"
                        : status === "error"
                        ? "NSE movers temporarily unavailable"
                        : "No NSE mover data returned"}
                </span>
            </div>
        );
    }

    return (
        <div style={shell} aria-label="NSE NIFTY 50 gainers and losers">
            <style>{`
                @keyframes ema360TopMoversScroll {
                    from { transform: translateX(0); }
                    to { transform: translateX(-50%); }
                }

                .ema360-top-movers-viewport:hover
                .ema360-top-movers-track {
                    animation-play-state: paused;
                }

                @media (prefers-reduced-motion: reduce) {
                    .ema360-top-movers-track {
                        animation: none !important;
                    }
                }
            `}</style>

            <strong
                style={{
                    padding: "0 12px",
                    color: "#94a3b8",
                    whiteSpace: "nowrap"
                }}
            >
                NSE · NIFTY 50
            </strong>

            <div
                className="ema360-top-movers-viewport"
                style={{
                    minWidth: 0,
                    overflow: "hidden",
                    flex: "1 1 auto"
                }}
            >
                <div
                    className="ema360-top-movers-track"
                    style={{
                        display: "flex",
                        width: "max-content",
                        alignItems: "center",
                        animation:
                            "ema360TopMoversScroll 95s linear infinite"
                    }}
                >
                    {[...items, ...items].map((item, index) => {
                        const positive = Number(item.pChange) >= 0;

                        return (
                            <div
                                key={`${item.side}-${item.symbol}-${index}`}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 7,
                                    padding: "0 18px",
                                    whiteSpace: "nowrap",
                                    borderRight:
                                        "1px solid rgba(148,163,184,.16)"
                                }}
                            >
                                <span
                                    style={{
                                        color:
                                            item.side === "Gainer"
                                                ? "#22c55e"
                                                : "#f87171"
                                    }}
                                >
                                    {item.side === "Gainer" ? "▲" : "▼"}
                                </span>

                                <strong style={{ color: "#f8fafc" }}>
                                    {item.symbol}
                                </strong>

                                <span style={{ color: "#94a3b8" }}>
                                    ₹{formatPrice(item.ltp)}
                                </span>

                                <strong
                                    style={{
                                        color: positive
                                            ? "#22c55e"
                                            : "#f87171"
                                    }}
                                >
                                    {formatPercent(item.pChange)}
                                </strong>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
