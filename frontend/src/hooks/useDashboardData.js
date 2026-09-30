import { useMemo } from "react";

import {
    engine,
    RSI,
    normalizeCandles
} from "../utils/indicators";


function useDashboardData(
    candles,
    selectedStock,
    currentTF,
    stockData,
    dataVersion
) {



    /* =========================================================
       MAIN ENGINE DATA
    ========================================================= */

    const dashboardData =
        useMemo(
            () => {

                if (
                    !Array.isArray(candles) ||
                    !candles.length
                ) {

                    return null;

                }


                return engine(
                    normalizeCandles(candles)
                );

            },
            [
                candles
            ]
        );


    /* =========================================================
       RSI MTF
    ========================================================= */

    const mtfRSI =
        useMemo(
            () => {

                const selectedData =
                    stockData?.[
                    selectedStock
                    ];


                const rsi5Data =
                    selectedData?.["5M"];


                const rsi15Data =
                    selectedData?.["15M"];


                const rsi1HData =
                    selectedData?.["1H"];


                const rsi5 = rsi5Data?.length
                    ? RSI(
                        normalizeCandles(rsi5Data).map(x => x.c),
                        14
                    )
                    : null;

                const rsi15 = rsi15Data?.length
                    ? RSI(
                        normalizeCandles(rsi15Data).map(x => x.c),
                        14
                    )
                    : null;

                const rsi1H = rsi1HData?.length
                    ? RSI(
                        normalizeCandles(rsi1HData).map(x => x.c),
                        14
                    )
                    : null;


                const rsiValues =
                    [
                        rsi5,
                        rsi15,
                        rsi1H
                    ]
                        .filter(
                            value =>
                                value !== null
                        );


                const rsiAverage =
                    rsiValues.length
                        ? rsiValues.reduce(
                            (
                                a,
                                b
                            ) =>
                                a + b,
                            0
                        ) /
                        rsiValues.length
                        : null;


                return {

                    rsi5,

                    rsi15,

                    rsi1H,

                    rsiAverage,

                    status:
                        rsiAverage === null
                            ? "—"
                            : rsiAverage > 55
                                ? "🟢 BULLISH"
                                : rsiAverage < 45
                                    ? "🔴 BEARISH"
                                    : "🟡 NEUTRAL"

                };

            },
            [
                selectedStock,
                dataVersion,
                stockData
            ]
        );


    /* =========================================================
       SELECTED ROW
    ========================================================= */

    const selectedRow =
        useMemo(
            () => {

                if (!dashboardData) {
                    return null;
                }


                const d =
                    dashboardData;


                return {

                    stock:
                        selectedStock,


                    price:
                        "₹" +
                        d.p.toFixed(2),


                    ema:
                        d.emaTrend,


                    vwap:
                        Number.isFinite(d.w)
                            ? (
                                d.p > d.w
                                    ? "🟢 Above"
                                    : "🔴 Below"
                            )
                            : "— N/A",


                    rsi:
                        d.R > 55
                            ? "🟢 Bull"
                            : d.R < 45
                                ? "🔴 Bear"
                                : "🟡 Neutral",


                    adx:
                        Number.isFinite(d.D.A)
                            ? (
                                d.D.A.toFixed(1) +
                                (
                                    d.D.A > 25
                                        ? " ↑"
                                        : " →"
                                )
                            )
                            : "—",


                    di:
                        Number.isFinite(d.D.P) &&
                            Number.isFinite(d.D.N)
                            ? (
                                d.D.P.toFixed(1) +
                                "/" +
                                d.D.N.toFixed(1)
                            )
                            : "—",


                    structure:
                        d.S,


                    sr:
                        d.Z.signal,


                    volume:
                        d.rel > 1.5
                            ? "🟢 Spike"
                            : "Natural",


                    sentiment:
                        (
                            d.sentiment > 55
                                ? "🟢 "
                                : d.sentiment < 45
                                    ? "🔴 "
                                    : "🟡 "
                        ) +
                        d.sentiment.toFixed(0) +
                        "%",


                    trend:
                        d.strength > 65
                            ? "🟢 Strong"
                            : "🟡 Moderate",


                    buySell:
                        d.buy +
                        "% / " +
                        d.sell +
                        "%",


                    confidence:
                        d.conf +
                        "/100",


                    status:
                        d.final

                };

            },
            [
                dashboardData,
                selectedStock
            ]
        );


        


    /* =========================================================
       RETURN
    ========================================================= */

    return {

        dashboardData,

        mtfRSI,

        selectedRow

    };

}


export default useDashboardData;