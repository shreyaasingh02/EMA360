function SelectedStock({
    selectedStock,
    currentTF,
    dashboardData,
    previousPrice,
    selectedRow,
    onEmergencySell
}) {

    const d =
        dashboardData;


    const change =
        d
            ? d.p - previousPrice
            : 0;


    return (
        <>
            <section className="top">

                <div className="stockInfo">

                    <div
                        id="sym"
                        className="symbol"
                    >
                        {selectedStock}
                    </div>

                    <div
                        id="time"
                        className="muted"
                    >
                        Updating... {currentTF}
                    </div>

                </div>


                <div className="topFinalStatus">

                    <div className="topFinalStatusMain">

                        <div className="label">
                            FINAL STATUS
                        </div>

                        <div
                            id="final"
                            className={
                                "status " +
                                (
                                    d?.final?.includes("🟢")
                                        ? "green"
                                        : d?.final?.includes("🔴")
                                            ? "red"
                                            : "yellow"
                                )
                            }
                        >
                            {d?.final || "🟡 WAIT"}
                        </div>

                    </div>


                    <div className="score">

                        <span id="confidence">
                            {d?.conf ?? 0}
                        </span>

                        <small>
                            /100
                        </small>

                    </div>


                    <div className="bar">

                        <span
                            id="bar"
                            style={{
                                width:
                                    `${d?.conf ?? 0}%`
                            }}
                        />

                    </div>

                </div>


                <div className="emergencySellWrap">

                    <button
                        id="emergencySellBtn"
                        className="emergencySellBtn"
                        type="button" onClick={onEmergencySell}
                    >
                        EMERGENCY SELL
                    </button>

                </div>


                <div className="price">

                    ₹{" "}

                    <span id="price">
                        {d
                            ? d.p.toFixed(2)
                            : "-"
                        }
                    </span>


                    <span
                        id="chg"
                        className={
                            change >= 0
                                ? "green"
                                : "red"
                        }
                    >
                        {d
                            ? (
                                (change >= 0
                                    ? "+"
                                    : ""
                                ) +
                                change.toFixed(2)
                            )
                            : "+0.00"
                        }
                    </span>

                </div>

            </section>


            <section className="selectedRowCard">

                <div className="selectedTitle">
                    SELECTED STOCK — NIFTY 50 STYLE SUMMARY
                </div>


                <div className="selectedRowWrap">

                    <div className="selectedRow">

                        <div className="selectedCell selectedHead">
                            Stock
                        </div>

                        <div className="selectedCell selectedHead">
                            Price
                        </div>

                        <div className="selectedCell selectedHead">
                            EMA Trend
                        </div>

                        <div className="selectedCell selectedHead">
                            VWAP
                        </div>

                        <div className="selectedCell selectedHead">
                            RSI MTF
                        </div>

                        <div className="selectedCell selectedHead">
                            ADX
                        </div>

                        <div className="selectedCell selectedHead">
                            +DI/-DI
                        </div>

                        <div className="selectedCell selectedHead">
                            Structure
                        </div>

                        <div className="selectedCell selectedHead">
                            S/R
                        </div>

                        <div className="selectedCell selectedHead">
                            Volume
                        </div>

                        <div className="selectedCell selectedHead">
                            Sentiment
                        </div>

                        <div className="selectedCell selectedHead">
                            Trend
                        </div>

                        <div className="selectedCell selectedHead">
                            Buy/Sell
                        </div>

                        <div className="selectedCell selectedHead">
                            Confidence
                        </div>

                        <div className="selectedCell selectedHead">
                            Status
                        </div>


                        <div
                            id="selStock"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.stock || selectedStock}
                        </div>


                        <div
                            id="selPrice"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.price || "₹25000.00"}
                        </div>


                        <div
                            id="selEMA"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.ema || "🟡 Mixed"}
                        </div>


                        <div
                            id="selVWAP"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.vwap || "🟢 Above"}
                        </div>


                        <div
                            id="selRSI"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.rsi || "🟢 Bull"}
                        </div>


                        <div
                            id="selADX"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.adx || "20 →"}
                        </div>


                        <div
                            id="selDI"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.di || "20/20"}
                        </div>


                        <div
                            id="selStructure"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.structure || "🟡 Mixed"}
                        </div>


                        <div
                            id="selSR"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.sr || "🟡 Range"}
                        </div>


                        <div
                            id="selVolume"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.volume || "Natural"}
                        </div>


                        <div
                            id="selSentiment"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.sentiment || "🟡 50%"}
                        </div>


                        <div
                            id="selTrend"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.trend || "🟡 Moderate"}
                        </div>


                        <div
                            id="selBuySell"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.buySell || "50% / 50%"}
                        </div>


                        <div
                            id="selConfidence"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.confidence || "50/100"}
                        </div>


                        <div
                            id="selStatus"
                            className="selectedCell selectedValue"
                        >
                            {selectedRow?.status || "🟡 WAIT"}
                        </div>

                    </div>

                </div>

            </section>
        </>
    );
}


export default SelectedStock;