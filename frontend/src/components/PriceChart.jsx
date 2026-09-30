import { useEffect, useState } from "react";
import useChart from "../hooks/useChart";
import IndicatorMenu from "./IndicatorMenu";

function PriceChart({
    selectedStock,
    currentTF,
    candles,
    selectedIndicators,
    onIndicatorsChange,
    dashboardData,
    mtfRSI
}) {
    const [indicatorMenuOpen, setIndicatorMenuOpen] = useState(false);

    const {
        canvasRef,
        candleMode,
        setCandleMode,
        toggleIndicator,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleMouseLeave,
        handleWheel,
        handleDoubleClick,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        drawChart
    } = useChart({
        candles,
        selectedStock,
        currentTF,
        selectedIndicators,
        onIndicatorsChange,
        dashboardData,
        mtfRSI
    });

    useEffect(() => {
        drawChart();
    }, [drawChart]);

    useEffect(() => {
        function handleOutsideClick() {
            setIndicatorMenuOpen(false);
        }

        document.addEventListener(
            "click",
            handleOutsideClick
        );

        return () => {
            document.removeEventListener(
                "click",
                handleOutsideClick
            );
        };
    }, []);

    function handleIndicatorClick(event) {
        event.stopPropagation();

        setIndicatorMenuOpen(
            previous => !previous
        );
    }

    function handleMenuClick(event) {
        event.stopPropagation();
    }

    function removeIndicator(name) {
        toggleIndicator(name);
    }

    const legendItems = [];

    if (selectedIndicators.has("EMA")) {
        legendItems.push(
            {
                label: "EMA9",
                color: "#5caeff",
                key: "EMA"
            },
            {
                label: "EMA21",
                color: "#ffc857",
                key: "EMA"
            }
        );
    }

    if (
        selectedIndicators.has("SMA") ||
        selectedIndicators.has("Moving Average")
    ) {
        legendItems.push({
            label: "Moving Average",
            color: "#ff9f43",
            key: selectedIndicators.has("SMA")
                ? "SMA"
                : "Moving Average"
        });
    }

    if (selectedIndicators.has("VWAP")) {
        legendItems.push({
            label: "VWAP",
            color: "#ffffff",
            key: "VWAP"
        });
    }

    if (selectedIndicators.has("RSI")) {
        legendItems.push({
            label: "RSI",
            color: "#d58cff",
            key: "RSI"
        });
    }

    if (selectedIndicators.has("MACD")) {
        legendItems.push({
            label: "MACD",
            color: "#5caeff",
            key: "MACD"
        });
    }

    if (selectedIndicators.has("ADX")) {
        legendItems.push({
            label: "ADX",
            color: "#ffc857",
            key: "ADX"
        });
    }

    const extendedLegend = [
        ["SuperTrend", "#19d39b"],
        ["Pivot Points Standard", "#9bb7d8"],
        ["Bollinger Bands", "#5caeff"],
        ["Ichimoku Cloud", "#d58cff"],
        ["Stochastic", "#ffc857"],
        ["Stochastic RSI", "#ffc857"],
        ["ATR", "#ffc857"],
        ["CCI", "#5caeff"],
        ["OBV", "#19d39b"],
        ["Volume", "#19d39b"]
    ];

    extendedLegend.forEach(
        ([key, color]) => {
            if (selectedIndicators.has(key)) {
                legendItems.push({
                    label: key,
                    color,
                    key
                });
            }
        }
    );

    return (
        <section
            id="chartSection"
            className="card chartCard"
        >

            <div className="chartHead">

                <h2>
                    Price Chart
                </h2>

                <div className="chartControls">

                    <button
                        id="indicatorBtn"
                        className="indicatorBtn"
                        type="button"
                        onClick={handleIndicatorClick}
                    >
                        ⌁ Indicators
                    </button>

                    <span className="muted">
                        Candle:
                    </span>

                    <select
                        id="candleType"
                        value={candleMode}
                        onChange={event =>
                            setCandleMode(
                                event.target.value
                            )
                        }
                    >
                        <option value="normal">
                            Normal Candles
                        </option>

                        <option value="heikin">
                            Heikin Ashi
                        </option>
                    </select>

                    <span className="muted">
                        TF:
                    </span>

                    <select
                        id="chartTF"
                        value={currentTF || "5M"}
                        onChange={() => { }}
                    >
                        <option value="1M">1M</option>
                        <option value="3M">3M</option>
                        <option value="5M">5M</option>
                        <option value="15M">15M</option>
                        <option value="30M">30M</option>
                        <option value="1H">1H</option>
                        <option value="1D">1D</option>
                    </select>

                </div>

                {indicatorMenuOpen && (
                    <div
                        id="indicatorMenu"
                        className="indicatorMenu"
                        onClick={handleMenuClick}
                    >
                        <IndicatorMenu
                            selectedIndicators={
                                selectedIndicators
                            }
                            toggleIndicator={
                                toggleIndicator
                            }
                        />
                    </div>
                )}

            </div>


            <div
                id="chartWrap"
                className="chartWrap"
            >

                <canvas
                    id="chart"
                    ref={canvasRef}
                    className="chart"

                    onMouseDown={
                        handleMouseDown
                    }

                    onMouseMove={
                        handleMouseMove
                    }

                    onMouseUp={
                        handleMouseUp
                    }

                    onMouseLeave={
                        handleMouseLeave
                    }

                    onWheel={
                        handleWheel
                    }

                    onDoubleClick={
                        handleDoubleClick
                    }

                    onTouchStart={
                        handleTouchStart
                    }

                    onTouchMove={
                        handleTouchMove
                    }

                    onTouchEnd={
                        handleTouchEnd
                    }
                />

                <div
                    id="chartLegendOverlay"
                    className="chartLegendOverlay"
                >

                    {legendItems.map(
                        (item, index) => (
                            <button
                                key={
                                    item.label +
                                    index
                                }
                                type="button"
                                className="chartLegendItem"
                                title={
                                    item.key
                                        ? `Remove ${item.label}`
                                        : item.label
                                }
                                onClick={() =>
                                    removeIndicator(
                                        item.key
                                    )
                                }
                            >

                                <span
                                    className="chartLegendSample"
                                    style={{
                                        background:
                                            item.color
                                    }}
                                />

                                <span>
                                    {item.label}
                                </span>

                                <span className="chartLegendRemove">
                                    ×
                                </span>

                            </button>
                        )
                    )}

                    {/* OLD UI: S/R IS ALWAYS PRESENT */}

                    <span
                        className="chartLegendItem"
                        title="Support"
                    >
                        <span
                            className="chartLegendSample"
                            style={{
                                background:
                                    "#19d39b"
                            }}
                        />

                        <span>
                            Support
                        </span>
                    </span>

                    <span
                        className="chartLegendItem"
                        title="Resistance"
                    >
                        <span
                            className="chartLegendSample"
                            style={{
                                background:
                                    "#ff6572"
                            }}
                        />

                        <span>
                            Resistance
                        </span>
                    </span>

                </div>

            </div>

        </section>
    );
}

export default PriceChart;