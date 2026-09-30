import React, { useEffect, useMemo, useState } from "react";
// import "./LongDeals.css";

function LongDeals() {
    const [activeTab, setActiveTab] = useState("bulk");
    const [data, setData] = useState({
        bulkDeals: [],
        blockDeals: [],
        shortSelling: [],
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const getApiBase = () => {
        if (typeof window === "undefined") {
            return "http://localhost:3000";
        }

        return window.location.hostname === "localhost"
            ? "http://localhost:3000"
            : "";
    };

    const loadLargeDeals = async () => {
        try {
            setError("");

            const base = getApiBase();

            const response = await fetch(
                `${base}/api/market/nse/large-deals`,
                {
                    cache: "no-store",
                }
            );

            const json = await response.json();

            if (!response.ok || !json?.success) {
                throw new Error(
                    json?.message ||
                    "Unable to fetch NSE Large Deals."
                );
            }

            setData({
                bulkDeals: Array.isArray(json.bulkDeals)
                    ? json.bulkDeals
                    : [],

                blockDeals: Array.isArray(json.blockDeals)
                    ? json.blockDeals
                    : [],

                shortSelling: Array.isArray(json.shortSelling)
                    ? json.shortSelling
                    : [],
            });

        } catch (err) {
            console.error(
                "NSE Large Deals error:",
                err
            );

            setError(
                err?.message ||
                "Unable to load NSE Large Deals."
            );

        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLargeDeals();

        /*
         * Large Deals are not tick-by-tick market data.
         * Refresh periodically so the page stays current
         * without continuously hitting NSE.
         */
        const interval = setInterval(
            loadLargeDeals,
            60 * 1000
        );

        return () => {
            clearInterval(interval);
        };
    }, []);

    const activeDeals = useMemo(() => {

        if (activeTab === "bulk") {
            return data.bulkDeals;
        }

        if (activeTab === "block") {
            return data.blockDeals;
        }

        return data.shortSelling;

    }, [activeTab, data]);

    const activeTitle = {
        bulk: "BULK DEALS",
        block: "BLOCK DEALS",
        short: "SHORT SELLING",
    }[activeTab];

    function formatNumber(value) {

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "-";
        }

        const number = Number(
            String(value).replace(/,/g, "")
        );

        if (!Number.isFinite(number)) {
            return value;
        }

        return number.toLocaleString("en-IN");
    }

    function formatPrice(value) {

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "-";
        }

        const number = Number(
            String(value).replace(/,/g, "")
        );

        if (!Number.isFinite(number)) {
            return value;
        }

        return number.toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }
        );
    }

    function renderDate(value) {

        if (!value) {
            return "-";
        }

        return value;
    }

    return (
        <main className="long-deals-page">

            {/* =================================================
                PAGE HEADER
            ================================================= */}

            <div className="long-deals-header">

                <div>
                    <h1>Large Deals</h1>

                    <p>
                        NSE Large Deals
                    </p>
                </div>

            </div>


            {/* =================================================
                TABS
            ================================================= */}

            <div className="long-deals-tabs">

                <button
                    className={
                        activeTab === "bulk"
                            ? "long-deals-tab active"
                            : "long-deals-tab"
                    }
                    onClick={() =>
                        setActiveTab("bulk")
                    }
                >
                    BULK DEALS
                </button>


                <button
                    className={
                        activeTab === "block"
                            ? "long-deals-tab active"
                            : "long-deals-tab"
                    }
                    onClick={() =>
                        setActiveTab("block")
                    }
                >
                    BLOCK DEALS
                </button>


                <button
                    className={
                        activeTab === "short"
                            ? "long-deals-tab active"
                            : "long-deals-tab"
                    }
                    onClick={() =>
                        setActiveTab("short")
                    }
                >
                    Short Selling
                </button>

            </div>


            {/* =================================================
                CONTENT
            ================================================= */}

            <div className="long-deals-card">

                <div className="long-deals-card-header">

                    <h2>
                        {activeTitle}:{" "}
                        {activeDeals.length}
                    </h2>

                    <span className="long-deals-source">
                        NSE
                    </span>

                </div>


                {/* ERROR */}

                {error && (
                    <div className="long-deals-error">
                        {error}
                    </div>
                )}


                {/* LOADING */}

                {loading ? (

                    <div className="long-deals-status">
                        Loading NSE Large Deals...
                    </div>

                ) : (

                    <div className="long-deals-table-wrapper">

                        <table className="long-deals-table">

                            <thead>

                                {activeTab === "short" ? (

                                    <tr>
                                        <th>DATE</th>
                                        <th>SYMBOL</th>
                                        <th>SECURITY NAME</th>
                                        <th>CLIENT NAME</th>
                                        <th>QUANTITY</th>
                                        <th>REMARKS</th>
                                    </tr>

                                ) : (

                                    <tr>
                                        <th>DATE</th>
                                        <th>SYMBOL</th>
                                        <th>SECURITY NAME</th>
                                        <th>CLIENT NAME</th>
                                        <th>BUY/SELL</th>
                                        <th>VOLUME</th>
                                        <th>
                                            TRADE PRICE /
                                            <br />
                                            WEIGHTED AVG. PRICE
                                        </th>
                                        <th>REMARKS</th>
                                    </tr>

                                )}

                            </thead>


                            <tbody>

                                {activeDeals.length === 0 ? (

                                    <tr>

                                        <td
                                            colSpan={
                                                activeTab === "short"
                                                    ? 6
                                                    : 8
                                            }
                                            className="long-deals-empty"
                                        >
                                            No{" "}
                                            {activeTitle.toLowerCase()}{" "}
                                            available.
                                        </td>

                                    </tr>

                                ) : (

                                    activeDeals.map(
                                        (deal, index) => {

                                            if (
                                                activeTab === "short"
                                            ) {

                                                return (
                                                    <tr
                                                        key={`${deal.symbol}-${index}`}
                                                    >

                                                        <td>
                                                            {renderDate(
                                                                deal.date
                                                            )}
                                                        </td>

                                                        <td className="deal-symbol">
                                                            {deal.symbol || "-"}
                                                        </td>

                                                        <td>
                                                            {
                                                                deal.securityName ||
                                                                "-"
                                                            }
                                                        </td>

                                                        <td>
                                                            {
                                                                deal.clientName ||
                                                                "-"
                                                            }
                                                        </td>

                                                        <td>
                                                            {formatNumber(
                                                                deal.quantity
                                                            )}
                                                        </td>

                                                        <td>
                                                            {
                                                                deal.remarks ||
                                                                "-"
                                                            }
                                                        </td>

                                                    </tr>
                                                );

                                            }


                                            return (
                                                <tr
                                                    key={`${deal.symbol}-${index}`}
                                                >

                                                    <td>
                                                        {renderDate(
                                                            deal.date
                                                        )}
                                                    </td>

                                                    <td className="deal-symbol">
                                                        {deal.symbol || "-"}
                                                    </td>

                                                    <td>
                                                        {
                                                            deal.securityName ||
                                                            "-"
                                                        }
                                                    </td>

                                                    <td>
                                                        {
                                                            deal.clientName ||
                                                            "-"
                                                        }
                                                    </td>

                                                    <td
                                                        className={
                                                            String(
                                                                deal.buySell ||
                                                                ""
                                                            ).toUpperCase() ===
                                                            "BUY"
                                                                ? "deal-buy"
                                                                : "deal-sell"
                                                        }
                                                    >
                                                        {
                                                            deal.buySell ||
                                                            "-"
                                                        }
                                                    </td>

                                                    <td>
                                                        {formatNumber(
                                                            deal.quantity
                                                        )}
                                                    </td>

                                                    <td>
                                                        {formatPrice(
                                                            deal.price
                                                        )}
                                                    </td>

                                                    <td>
                                                        {
                                                            deal.remarks ||
                                                            "-"
                                                        }
                                                    </td>

                                                </tr>
                                            );
                                        }
                                    )

                                )}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

        </main>
    );
}

export default LongDeals;