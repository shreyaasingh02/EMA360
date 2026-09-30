function AnalysisModules({
    dashboardData,
    mtfRSI,
    visibleLayers
}) {

    const d =
        dashboardData;


    /* =========================================================
       EMA
    ========================================================= */

    const emaStatus =
        d?.emaTrend || "—";


    /* =========================================================
       VWAP
    ========================================================= */

    let vwapStatus = "— VWAP N/A";
    let vwapValue = "N/A";


    if (
        d &&
        d.w !== null &&
        Number.isFinite(
            Number(d.w)
        )
    ) {

        vwapStatus =
            d.p > d.w
                ? "🟢 ABOVE VWAP"
                : d.p < d.w
                    ? "🔴 BELOW VWAP"
                    : "🟡 AT VWAP";


        vwapValue =
            Number(d.w).toFixed(2);

    }


    /* =========================================================
       RSI MTF
    ========================================================= */

    const rsiStatus =
        mtfRSI?.rsiAverage === null ||
            mtfRSI?.rsiAverage === undefined
            ? "—"
            : mtfRSI.rsiAverage > 55
                ? "🟢 BULLISH"
                : mtfRSI.rsiAverage < 45
                    ? "🔴 BEARISH"
                    : "🟡 NEUTRAL";


    /* =========================================================
       ADX
    ========================================================= */

    const adxValue =
        Number.isFinite(
            d?.D?.A
        )
            ? "ADX " +
            d.D.A.toFixed(1)
            : "—";


    const diValue =
        Number.isFinite(d?.D?.P) &&
            Number.isFinite(d?.D?.N)
            ? (
                d.D.P.toFixed(1) +
                " / " +
                d.D.N.toFixed(1)
            )
            : "—";


    /* =========================================================
       SUPPORT / RESISTANCE
    ========================================================= */

    const resistance =
        d?.Z?.resistance === null ||
            d?.Z?.resistance === undefined
            ? "—"
            : Number(
                d.Z.resistance
            ).toFixed(2);


    const support =
        d?.Z?.support === null ||
            d?.Z?.support === undefined
            ? "—"
            : Number(
                d.Z.support
            ).toFixed(2);


    /* =========================================================
       VOLUME
    ========================================================= */

    let volumeStatus =
        "— VOLUME N/A";


    let relativeVolume =
        "N/A";


    if (
        d &&
        d.rel !== null &&
        Number.isFinite(
            Number(d.rel)
        )
    ) {

        volumeStatus =
            d.rel > 1.5
                ? "🟢 VOLUME SPIKE"
                : d.rel < 0.75
                    ? "🔴 LOW VOLUME"
                    : "Natural";


        relativeVolume =
            Number(d.rel).toFixed(2) +
            "x";

    }


    /* =========================================================
       SENTIMENT
    ========================================================= */

    const sentimentStatus =
        d
            ? (
                d.sentiment > 55
                    ? "🟢 BULLISH "
                    : d.sentiment < 45
                        ? "🔴 BEARISH "
                        : "🟡 NEUTRAL "
            ) +
            d.sentiment.toFixed(0) +
            "%"
            : "—";


    /* =========================================================
       TREND STRENGTH
    ========================================================= */

    const strengthStatus =
        d
            ? (
                d.strength > 65
                    ? "🟢 STRONG "
                    : "🟡 MODERATE "
            ) +
            d.strength +
            "%"
            : "—";


    /* =========================================================
       BUY / SELL
    ========================================================= */

    const buyValue =
        d
            ? "Buy " +
            d.buy +
            "%"
            : "Buy 50%";


    const sellValue =
        d
            ? "Sell " +
            d.sell +
            "%"
            : "Sell 50%";


    return (

        <section className="grid">

            {/* =================================================
                EMA
            ================================================= */}

            <article
                id="ema"
                className="card module"
                style={{
                    display: visibleLayers.has("EMA")
                        ? "block"
                        : "none"
                }}
            >

                <h3>
                    EMA TREND
                </h3>


                <div
                    id="emaS"
                    className="value"
                >
                    {emaStatus}
                </div>


                <div className="row muted">

                    <span>
                        Price
                    </span>

                    <span id="ep">
                        {d
                            ? d.p.toFixed(2)
                            : "—"
                        }
                    </span>

                </div>


                <div className="row muted">
    <span>EMA9</span>
    <span>
        {Number.isFinite(Number(d?.e9))
            ? Number(d.e9).toFixed(2)
            : "—"
        }
    </span>
</div>

<div className="row muted">
    <span>EMA21</span>
    <span>
        {Number.isFinite(Number(d?.e21))
            ? Number(d.e21).toFixed(2)
            : "—"
        }
    </span>
</div>

<div className="row muted">
    <span>EMA30</span>
    <span>
        {Number.isFinite(Number(d?.e30))
            ? Number(d.e30).toFixed(2)
            : "—"
        }
    </span>
</div>

<div className="row muted">
    <span>EMA50</span>
    <span>
        {Number.isFinite(Number(d?.e50))
            ? Number(d.e50).toFixed(2)
            : "—"
        }
    </span>
</div>

<div className="row muted">
    <span>EMA100</span>
    <span>
        {Number.isFinite(Number(d?.e100))
            ? Number(d.e100).toFixed(2)
            : "—"
        }
    </span>
</div>

            </article>


            {/* =================================================
                VWAP
            ================================================= */}

            <article
                id="vwap"
                className="card module"
                style={{
                    display: visibleLayers.has("VWAP")
                        ? "block"
                        : "none"
                }}
            >

                <h3>
                    VWAP
                </h3>


                <div
                    id="vwS"
                    className="value"
                >
                    {vwapStatus}
                </div>


                <div className="muted">

                    VWAP

                    <span id="vw">
                        {vwapValue}
                    </span>

                </div>

            </article>


            {/* =================================================
                RSI
            ================================================= */}

            <article
                id="rsi"
                className="card module"
                style={{
                    display: visibleLayers.has("RSI")
                        ? "block"
                        : "none"
                }}
            >

                <h3>
                    RSI MTF
                </h3>


                <div
                    id="rsiS"
                    className="value"
                >
                    {rsiStatus}
                </div>


                <div className="row muted">

                    <span>
                        5M
                    </span>

                    <span id="r5">
                        {
                            mtfRSI?.rsi5 === null ||
                                mtfRSI?.rsi5 === undefined
                                ? "—"
                                : mtfRSI.rsi5.toFixed(1)
                        }
                    </span>

                </div>


                <div className="row muted">

                    <span>
                        15M
                    </span>

                    <span id="r15">
                        {
                            mtfRSI?.rsi15 === null ||
                                mtfRSI?.rsi15 === undefined
                                ? "—"
                                : mtfRSI.rsi15.toFixed(1)
                        }
                    </span>

                </div>


                <div className="row muted">

                    <span>
                        1H
                    </span>

                    <span id="r1">
                        {
                            mtfRSI?.rsi1H === null ||
                                mtfRSI?.rsi1H === undefined
                                ? "—"
                                : mtfRSI.rsi1H.toFixed(1)
                        }
                    </span>

                </div>

            </article>


            {/* =================================================
                ADX
            ================================================= */}

            <article
                id="adx"
                className="card module"
                style={{
                    display: visibleLayers.has("ADX")
                        ? "block"
                        : "none"
                }}
            >

                <h3>
                    ADX / +DI / -DI
                </h3>


                <div
                    id="adxS"
                    className="value"
                >
                    {adxValue}
                </div>


                <div className="muted">

                    +DI / -DI

                    <span id="di">
                        {diValue}
                    </span>

                </div>

            </article>


            {/* =================================================
                STRUCTURE
            ================================================= */}

            <article
                id="structure"
                className="card module"
                style={{
                    display: visibleLayers.has("Structure")
                        ? "block"
                        : "none"
                }}
            >

                <h3>
                    STRUCTURE
                </h3>


                <div
                    id="stS"
                    className="value"
                >
                    {d?.S || "—"}
                </div>


                <div className="muted">
                    HH / HL / LH / LL
                </div>

            </article>


            {/* =================================================
                SUPPORT / RESISTANCE
            ================================================= */}

            <article
                id="sr"
                className="card module"
                style={{
                    display: visibleLayers.has("SR")
                        ? "block"
                        : "none"
                }}
            >

                <h3>
                    SUPPORT / RESISTANCE
                </h3>


                <div
                    id="srS"
                    className="value"
                >
                    {d?.Z?.signal || "—"}
                </div>


                <div className="row muted">

                    <span>
                        Resistance
                    </span>

                    <span id="res">
                        {resistance}
                    </span>

                </div>


                <div className="row muted">

                    <span>
                        Support
                    </span>

                    <span id="sup">
                        {support}
                    </span>

                </div>

            </article>


            {/* =================================================
                VOLUME
            ================================================= */}

            <article
                id="volume"
                className="card module"
                style={{
                    display: visibleLayers.has("Volume")
                        ? "block"
                        : "none"
                }}
            >

                <h3>
                    VOLUME
                </h3>


                <div
                    id="volS"
                    className="value"
                >
                    {volumeStatus}
                </div>


                <div className="muted">

                    Relative

                    <span id="rv">
                        {relativeVolume}
                    </span>

                </div>

            </article>


            {/* =================================================
                SENTIMENT
            ================================================= */}

            <article
                id="sentiment"
                className="card module"
                style={{
                    display: visibleLayers.has("Sentiment")
                        ? "block"
                        : "none"
                }}
            >

                <h3>
                    SENTIMENT
                </h3>


                <div
                    id="senS"
                    className="value"
                >
                    {sentimentStatus}
                </div>

            </article>


            {/* =================================================
                TREND STRENGTH
            ================================================= */}

            <article
                id="strength"
                className="card module"
                style={{
                    display: visibleLayers.has("Strength")
                        ? "block"
                        : "none"
                }}
            >

                <h3>
                    TREND STRENGTH
                </h3>


                <div
                    id="strS"
                    className="value"
                >
                    {strengthStatus}
                </div>

            </article>


            {/* =================================================
                BUY SELL
            ================================================= */}

            <article
                id="buysell"
                className="card module"
                style={{
                    display: visibleLayers.has("BuySell")
                        ? "block"
                        : "none"
                }}
            >

                <h3>
                    BUY / SELL %
                </h3>


                <div className="value">

                    <span
                        id="buy"
                        className="green"
                    >
                        {buyValue}
                    </span>


                    |


                    <span
                        id="sell"
                        className="red"
                    >
                        {sellValue}
                    </span>

                </div>

            </article>

        </section>

    );

}


export default AnalysisModules;