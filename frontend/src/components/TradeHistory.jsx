import { useState } from "react";

function TradeHistory({
    tradeHistory = [],
    onDeleteTrade
}) {

    const [historyExpanded, setHistoryExpanded] =
        useState(false);


    /* =========================================================
       NEVER SHOW MORE THAN 20 TRADES
    ========================================================= */

    const visibleTrades =
        tradeHistory
            .slice(
                0,
                historyExpanded
                    ? 20
                    : 3
            );


    /* =========================================================
       NUMBER FORMAT
       SAME AS OLD index.html
    ========================================================= */

    const number =
        value =>
            Number.isFinite(
                Number(value)
            )
                ? Number(value).toLocaleString(
                    "en-IN",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                )
                : "—";


    /* =========================================================
       P&L
       SAME AS OLD index.html
    ========================================================= */

    const renderPnL =
        pnl => {

            if (
                !Number.isFinite(
                    Number(pnl)
                )
            ) {

                return (
                    <span className="historyPnl neutral">
                        —
                    </span>
                );

            }


            const value =
                Number(pnl);


            /* PROFIT */

            if (
                value > 0
            ) {

                return (
                    <span className="historyPnl profit">
                        <span className="pnlArrow">
                            ↑
                        </span>

                        +₹
                        {value.toLocaleString(
                            "en-IN",
                            {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            }
                        )}
                    </span>
                );

            }


            /* LOSS */

            if (
                value < 0
            ) {

                return (
                    <span className="historyPnl loss">
                        <span className="pnlArrow">
                            ↓
                        </span>

                        -₹
                        {Math.abs(
                            value
                        ).toLocaleString(
                            "en-IN",
                            {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            }
                        )}
                    </span>
                );

            }


            /* ZERO */

            return (
                <span className="historyPnl neutral">
                    ₹0.00
                </span>
            );

        };


    /* =========================================================
       TIME
       SAME DATE / TIME SPLIT AS OLD
    ========================================================= */

    const renderTime =
        time => {

            const rawTime =
                String(
                    time || "—"
                );


            if (
                rawTime.includes(
                    ", "
                )
            ) {

                const parts =
                    rawTime.split(
                        ", "
                    );


                return (
                    <span className="historyTime">

                        <span className="historyTimeDate">
                            {parts[0]}
                        </span>

                        <span className="historyTimeClock">
                            {parts
                                .slice(1)
                                .join(", ")}
                        </span>

                    </span>
                );

            }


            return (
                <span className="historyTime">

                    <span className="historyTimeClock">
                        {rawTime}
                    </span>

                </span>
            );

        };


    return (

        <section
            className="card tradeHistoryCard"
        >

            {/* =====================================================
                HEADER
            ===================================================== */}

            <div className="tradeHistoryHeader">

                <div>

                    <h2>
                        TRADE HISTORY
                    </h2>

                    <div className="tradeHistorySubtitle">
                        Recently completed trades
                    </div>

                </div>

                <div className="historyHeaderActions">
                    <div
                        className="historyCount"
                        id="historyCount"
                    >
                        {tradeHistory.length}{" "}
                        {tradeHistory.length === 1
                            ? "Trade"
                            : "Trades"}
                    </div>

                    {tradeHistory.length > 3 && (
                        <button
                            type="button"
                            className="historyViewBtn"
                            onClick={() => setHistoryExpanded(previous => !previous)}
                        >
                            {historyExpanded ? "VIEW LESS" : "VIEW MORE"}
                        </button>
                    )}

                </div>

            </div>


            {/* =====================================================
                TABLE
            ===================================================== */}

            <div className="historyTableWrap">

                <table
                    id="historyTable"
                    className="historyTable"
                >

                    <thead>

                        <tr>

                            <th>
                                S.No.
                            </th>

                            <th>
                                Stock Name
                            </th>

                            <th>
                                Quantity
                            </th>

                            <th>
                                Entry
                            </th>

                            <th>
                                Stop Loss
                            </th>

                            <th>
                                Target 1
                            </th>

                            <th>
                                Target 2
                            </th>

                            <th>
                                Target 3
                            </th>

                            <th>
                                Exit
                            </th>

                            <th>
                                Amount
                            </th>

                            <th>
                                Profit &amp; Loss
                            </th>

                            <th>
                                Time
                            </th>

                            <th>
                                Action
                            </th>

                        </tr>

                    </thead>


                    <tbody id="historyTradeBody">

                        {/* =================================================
                            EMPTY
                        ================================================= */}

                        {tradeHistory.length === 0 ? (

                            <tr>

                                <td
                                    colSpan="13"
                                    className="historyEmpty"
                                >
                                    No trade history yet.
                                </td>

                            </tr>

                        ) : (

                            /* =================================================
                               TRADES
                            ================================================= */

                            visibleTrades.map(
                                (
                                    trade,
                                    index
                                ) => (

                                    <tr
                                        key={
                                            `${trade.stock}-${trade.time}-${index}`
                                        }
                                    >

                                        {/* S.NO. */}

                                        <td>
                                            {index + 1}
                                        </td>


                                        {/* STOCK */}

                                        <td className="historyStockCell">

                                            <div className="historyStockName">
                                                {trade.stock || "—"}
                                            </div>

                                            <span className="historyStatusBadge">
                                                CLOSED
                                            </span>

                                        </td>


                                        {/* QUANTITY */}

                                        <td>
                                            {trade.quantity || "—"}
                                        </td>


                                        {/* ENTRY */}

                                        <td>
                                            {number(
                                                trade.entry
                                            )}
                                        </td>


                                        {/* STOP LOSS */}

                                        <td>
                                            {number(
                                                trade.stopLoss
                                            )}
                                        </td>


                                        {/* TARGET 1 */}

                                        <td>
                                            {number(
                                                trade.target1
                                            )}
                                        </td>


                                        {/* TARGET 2 */}

                                        <td>
                                            {number(
                                                trade.target2
                                            )}
                                        </td>


                                        {/* TARGET 3 */}

                                        <td>
                                            {number(
                                                trade.target3
                                            )}
                                        </td>


                                        {/* EXIT */}

                                        <td>
                                            {number(
                                                trade.exit
                                            )}
                                        </td>


                                        {/* AMOUNT */}

                                        <td>
                                            ₹
                                            {number(
                                                trade.amount
                                            )}
                                        </td>


                                        {/* P&L */}

                                        <td>
                                            {renderPnL(
                                                trade.pnl
                                            )}
                                        </td>


                                        {/* TIME */}

                                        <td>
                                            {renderTime(
                                                trade.time
                                            )}
                                        </td>


                                        {/* DELETE */}

                                        <td className="historyDeleteCell">

                                            <button
                                                type="button"
                                                className="historyDeleteBtn"
                                                aria-label={`Delete ${trade.stock || "this trade"}`}
                                                title="Delete trade"
                                                onClick={() =>
                                                    onDeleteTrade?.(
                                                        index
                                                    )
                                                }
                                            >

                                                <svg
                                                    viewBox="0 0 24 24"
                                                    aria-hidden="true"
                                                >

                                                    <path
                                                        d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v6m4-6v6"
                                                    />

                                                </svg>

                                            </button>

                                        </td>

                                    </tr>

                                )
                            )

                        )}

                    </tbody>

                </table>

            </div>


        </section>

    );

}

export default TradeHistory;