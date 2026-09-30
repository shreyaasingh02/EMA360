import { useMemo } from "react";
import { calcFor } from "../utils/trading";

function NiftyTable({
    stocks = [],
    stockData = {},
    currentTF,
    selectedStock,
    onStockSelect
}) {

    const rankedStocks = useMemo(() => {

        const rows = stocks.map(stock => {

            const data =
                stockData[stock]?.[currentTF];

            if (
                !Array.isArray(data) ||
                !data.length
            ) {
                return {
                    stock,
                    d: null
                };
            }

            const d = calcFor(data);

            return {
                stock,
                d
            };

        });

        /*
         * Loaded stocks first.
         * Then sort loaded stocks by confidence.
         * Loading stocks remain below.
         */
        rows.sort((a, b) => {

            const aLoaded =
                a.d !== null;

            const bLoaded =
                b.d !== null;

            if (
                aLoaded &&
                !bLoaded
            ) {
                return -1;
            }

            if (
                !aLoaded &&
                bLoaded
            ) {
                return 1;
            }

            if (
                !aLoaded &&
                !bLoaded
            ) {
                return 0;
            }

            return (
                (Number(b.d?.conf) || 0) -
                (Number(a.d?.conf) || 0)
            );

        });

        return rows;

    }, [
        stocks,
        stockData,
        currentTF
    ]);


    return (

        <section
            className="card"
            style={{ marginTop: "13px" }}
        >

            <h2>
                NIFTY 50 — ALL STOCKS
            </h2>

            <div
                className="muted"
                style={{
                    marginBottom: "10px"
                }}
            >
                Click any stock to load its complete analysis and chart above.
            </div>

            <div
                style={{
                    overflow: "auto"
                }}
            >

                <table
                    id="niftyTable"
                    style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: "1500px"
                    }}
                >

                    <thead>

                        <tr>

                            <th>Stock</th>
                            <th>Price</th>
                            <th>EMA Trend</th>
                            <th>VWAP</th>
                            <th>RSI MTF</th>
                            <th>ADX</th>
                            <th>+DI/-DI</th>
                            <th>Structure</th>
                            <th>S/R</th>
                            <th>Volume</th>
                            <th>Sentiment</th>
                            <th>Trend</th>
                            <th>Buy/Sell</th>
                            <th>Confidence</th>
                            <th>Status</th>

                        </tr>

                    </thead>


                    <tbody>

                        {rankedStocks.map(
                            ({ stock, d }) => {

                                /*
                                 * =========================
                                 * LOADING ROW
                                 * =========================
                                 */

                                if (!d) {

                                    return (

                                        <tr
                                            key={stock}
                                            data-stock={stock}
                                            className={
                                                stock === selectedStock
                                                    ? "selected"
                                                    : ""
                                            }
                                            onClick={() =>
                                                onStockSelect?.(stock)
                                            }
                                        >

                                            <td>
                                                <span className="stockBtn">
                                                    {stock}
                                                </span>
                                            </td>

                                            <td>—</td>
                                            <td>Loading...</td>
                                            <td>—</td>
                                            <td>—</td>
                                            <td>—</td>
                                            <td>—</td>
                                            <td>—</td>
                                            <td>—</td>
                                            <td>—</td>
                                            <td>—</td>
                                            <td>—</td>
                                            <td>—</td>
                                            <td>Loading...</td>
                                            <td>—</td>

                                        </tr>

                                    );

                                }


                                /*
                                 * =========================
                                 * EMA
                                 * =========================
                                 */

                                const emaS =
                                    d.emaTrend;


                                /*
                                 * =========================
                                 * VWAP
                                 * =========================
                                 */

                                const vw =
                                    Number.isFinite(
                                        Number(d.w)
                                    )
                                        ? (
                                            d.p > d.w
                                                ? "🟢 Above"
                                                : "🔴 Below"
                                        )
                                        : "—";


                                /*
                                 * =========================
                                 * RSI
                                 * =========================
                                 */

                                const r =
                                    Number.isFinite(
                                        Number(d.R)
                                    )
                                        ? (
                                            d.R > 55
                                                ? "🟢 Bull"
                                                : d.R < 45
                                                    ? "🔴 Bear"
                                                    : "🟡 Neutral"
                                        )
                                        : "—";


                                /*
                                 * =========================
                                 * STRUCTURE
                                 * =========================
                                 */

                                const structure =
                                    String(d.S || "")
                                        .includes("BULLISH")
                                        ? "🟢 Bull"
                                        : String(d.S || "")
                                            .includes("BEARISH")
                                            ? "🔴 Bear"
                                            : "🟡 Mixed";


                                /*
                                 * =========================
                                 * S/R
                                 * =========================
                                 */

                                const srx =
                                    d.Z?.signal || "—";


                                /*
                                 * =========================
                                 * VOLUME
                                 * =========================
                                 */

                                const vol =
                                    Number.isFinite(
                                        Number(d.rel)
                                    )
                                        ? (
                                            d.rel > 1.5
                                                ? "🟢 Spike"
                                                : "Natural"
                                        )
                                        : "—";


                                /*
                                 * =========================
                                 * SENTIMENT
                                 * =========================
                                 */

                                const sen =
                                    Number.isFinite(
                                        Number(d.sentiment)
                                    )
                                        ? (
                                            d.sentiment > 55
                                                ? "🟢 " +
                                                  d.sentiment.toFixed(0) +
                                                  "%"
                                                : d.sentiment < 45
                                                    ? "🔴 " +
                                                      d.sentiment.toFixed(0) +
                                                      "%"
                                                    : "🟡 " +
                                                      d.sentiment.toFixed(0) +
                                                      "%"
                                        )
                                        : "—";


                                /*
                                 * =========================
                                 * STRENGTH / TREND
                                 * =========================
                                 */

                                const tr =
                                    Number.isFinite(
                                        Number(d.strength)
                                    )
                                        ? (
                                            d.strength > 65
                                                ? "🟢 Strong"
                                                : "🟡 Moderate"
                                        )
                                        : "—";


                                /*
                                 * =========================
                                 * BUY / SELL
                                 * =========================
                                 */

                                const buySell =
                                    Number.isFinite(
                                        Number(d.buy)
                                    )
                                        ? (
                                            "Buy " +
                                            d.buy +
                                            "% / Sell " +
                                            d.sell +
                                            "%"
                                        )
                                        : "—";


                                /*
                                 * =========================
                                 * CONFIDENCE
                                 * =========================
                                 */

                                const confidence =
                                    Number.isFinite(
                                        Number(d.conf)
                                    )
                                        ? d.conf + "/100"
                                        : "—";


                                /*
                                 * =========================
                                 * FINAL ROW
                                 * =========================
                                 */

                                return (

                                    <tr
                                        key={stock}
                                        data-stock={stock}
                                        className={
                                            stock === selectedStock
                                                ? "selected"
                                                : ""
                                        }
                                        onClick={() =>
                                            onStockSelect?.(stock)
                                        }
                                    >

                                        <td>
                                            <span className="stockBtn">
                                                {stock}
                                            </span>
                                        </td>

                                        <td>
                                            {Number.isFinite(
                                                Number(d.p)
                                            )
                                                ? Number(d.p).toFixed(2)
                                                : "—"}
                                        </td>

                                        <td>
                                            {emaS}
                                        </td>

                                        <td>
                                            {vw}
                                        </td>

                                        <td>
                                            {r}
                                        </td>

                                        <td>
                                            {Number.isFinite(
                                                Number(d.D?.A)
                                            )
                                                ? Number(d.D.A).toFixed(1)
                                                : "—"}
                                        </td>

                                        <td>
                                            {
                                                Number.isFinite(
                                                    Number(d.D?.P)
                                                ) &&
                                                Number.isFinite(
                                                    Number(d.D?.N)
                                                )
                                                    ? Number(d.D.P).toFixed(1) +
                                                      " / " +
                                                      Number(d.D.N).toFixed(1)
                                                    : "—"
                                            }
                                        </td>

                                        <td>
                                            {structure}
                                        </td>

                                        <td>
                                            {srx}
                                        </td>

                                        <td>
                                            {vol}
                                        </td>

                                        <td>
                                            {sen}
                                        </td>

                                        <td>
                                            {tr}
                                        </td>

                                        <td>
                                            {buySell}
                                        </td>

                                        <td>
                                            {confidence}
                                        </td>

                                        <td>
                                            {d.final || "—"}
                                        </td>

                                    </tr>

                                );

                            }
                        )}

                    </tbody>

                </table>

            </div>

        </section>

    );

}

export default NiftyTable;