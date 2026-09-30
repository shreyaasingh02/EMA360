export function getColorClass(text) {

    if (!text) {
        return "yellow";
    }


    if (
        text.includes("🟢") ||
        text.includes("BULL") ||
        text.includes("BUY")
    ) {

        return "green";

    }


    if (
        text.includes("🔴") ||
        text.includes("BEAR") ||
        text.includes("SELL")
    ) {

        return "red";

    }


    return "yellow";

}


/* =========================================================
   UPDATE SELECTED ROW DATA
========================================================= */

export function getSelectedRowData(
    selectedStock,
    d
) {

    if (!d) {
        return null;
    }


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

}


/* =========================================================
   PREPARE DASHBOARD DISPLAY DATA
========================================================= */

export function getDashboardData(
    selectedStock,
    currentTF,
    candles,
    previousPrice
) {

    if (
        !Array.isArray(candles) ||
        !candles.length
    ) {

        return null;

    }


    /*
     * IMPORTANT:
     *
     * engine() is still coming from the old project.
     *
     * We are NOT rewriting the calculation here.
     * We will import the existing engine from
     * indicators.js after converting it.
     */

    return {

        selectedStock,

        currentTF,

        candles,

        previousPrice

    };

}