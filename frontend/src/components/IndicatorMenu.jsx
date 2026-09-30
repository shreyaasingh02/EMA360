import { useMemo, useState } from "react";


const indicatorSections = [
    {
        title: "Popular",
        items: [
            {
                name: "Open Interest Profile",
                label: "Open Interest Profile",
                isNew: true
            },
            {
                name: "RSI",
                label: "Relative Strength Index"
            },
            {
                name: "EMA",
                label: "Moving Average Exponential"
            },
            {
                name: "SuperTrend",
                label: "SuperTrend"
            },
            {
                name: "Pivot Points Standard",
                label: "Pivot Points Standard"
            },
            {
                name: "MACD",
                label: "MACD"
            },
            {
                name: "Bollinger Bands",
                label: "Bollinger Bands"
            },
            {
                name: "Moving Average",
                label: "Moving Average"
            },
            {
                name: "VWAP",
                label: "VWAP"
            }
        ]
    },


    {
        title: "Trend",
        items: [
            {
                name: "ADX",
                label: "Average Directional Index"
            },
            {
                name: "Directional Movement",
                label: "Directional Movement"
            },
            {
                name: "Aroon",
                label: "Aroon"
            },
            {
                name: "Aroon Oscillator",
                label: "Aroon Oscillator"
            },
            {
                name: "Ichimoku Cloud",
                label: "Ichimoku Cloud"
            },
            {
                name: "Parabolic SAR",
                label: "Parabolic SAR"
            },
            {
                name: "SuperTrend",
                label: "SuperTrend"
            },
            {
                name: "Trend Strength Index",
                label: "Trend Strength Index"
            },
            {
                name: "Vortex Indicator",
                label: "Vortex Indicator"
            },
            {
                name: "Williams Alligator",
                label: "Williams Alligator"
            },
            {
                name: "Williams Fractal",
                label: "Williams Fractal"
            },
            {
                name: "Zig Zag",
                label: "Zig Zag"
            },
            {
                name: "Donchian Channels",
                label: "Donchian Channels"
            },
            {
                name: "Keltner Channels",
                label: "Keltner Channels"
            },
            {
                name: "Price Channel",
                label: "Price Channel"
            },
            {
                name: "Pivot Points Standard",
                label: "Pivot Points Standard"
            },
            {
                name: "Pivot Points High Low",
                label: "Pivot Points High Low"
            },
            {
                name: "Chande Kroll Stop",
                label: "Chande Kroll Stop"
            },
            {
                name: "Chop Zone",
                label: "Chop Zone"
            },
            {
                name: "Choppiness Index",
                label: "Choppiness Index"
            }
        ]
    },


    {
        title: "Momentum / Oscillators",
        items: [
            {
                name: "RSI",
                label: "Relative Strength Index"
            },
            {
                name: "MACD",
                label: "MACD"
            },
            {
                name: "Stochastic",
                label: "Stochastic"
            },
            {
                name: "Stochastic RSI",
                label: "Stochastic RSI"
            },
            {
                name: "Commodity Channel Index",
                label: "Commodity Channel Index"
            },
            {
                name: "Awesome Oscillator",
                label: "Awesome Oscillator"
            },
            {
                name: "Accelerator Oscillator",
                label: "Accelerator Oscillator"
            },
            {
                name: "Momentum",
                label: "Momentum"
            },
            {
                name: "Rate Of Change",
                label: "Rate Of Change"
            },
            {
                name: "Price Oscillator",
                label: "Price Oscillator"
            },
            {
                name: "Percentage Price Oscillator",
                label: "Percentage Price Oscillator"
            },
            {
                name: "Ultimate Oscillator",
                label: "Ultimate Oscillator"
            },
            {
                name: "Williams %R",
                label: "Williams %R"
            },
            {
                name: "True Strength Indicator",
                label: "True Strength Indicator"
            },
            {
                name: "TRIX",
                label: "TRIX"
            },
            {
                name: "Rank Correlation Index",
                label: "Rank Correlation Index"
            },
            {
                name: "Relative Vigor Index",
                label: "Relative Vigor Index"
            },
            {
                name: "Relative Volatility Index",
                label: "Relative Volatility Index"
            },
            {
                name: "SMI Ergodic Indicator/Oscillator",
                label: "SMI Ergodic Indicator/Oscillator"
            },
            {
                name: "Fisher Transform",
                label: "Fisher Transform"
            },
            {
                name: "Detrended Price Oscillator",
                label: "Detrended Price Oscillator"
            },
            {
                name: "Coppock Curve",
                label: "Coppock Curve"
            },
            {
                name: "Know Sure Thing",
                label: "Know Sure Thing"
            },
            {
                name: "Chande Momentum Oscillator",
                label: "Chande Momentum Oscillator"
            },
            {
                name: "Mass Index",
                label: "Mass Index"
            },
            {
                name: "Connors RSI",
                label: "Connors RSI"
            },
            {
                name: "Standard Error",
                label: "Standard Error"
            },
            {
                name: "Standard Error Bands",
                label: "Standard Error Bands"
            }
        ]
    },


    {
        title: "Volatility",
        items: [
            {
                name: "Average True Range",
                label: "Average True Range"
            },
            {
                name: "Bollinger Bands",
                label: "Bollinger Bands"
            },
            {
                name: "Bollinger Bands %B",
                label: "Bollinger Bands %B"
            },
            {
                name: "Bollinger Bands Width",
                label: "Bollinger Bands Width"
            },
            {
                name: "Historical Volatility",
                label: "Historical Volatility"
            },
            {
                name: "Chaikin Volatility",
                label: "Chaikin Volatility"
            },
            {
                name: "Keltner Channels",
                label: "Keltner Channels"
            },
            {
                name: "Standard Deviation",
                label: "Standard Deviation"
            },
            {
                name: "Volatility Close-to-Close",
                label: "Volatility Close-to-Close"
            },
            {
                name: "Volatility Zero Trend Close-to-Close",
                label: "Volatility Zero Trend Close-to-Close"
            },
            {
                name: "Volatility O-H-L-C",
                label: "Volatility O-H-L-C"
            },
            {
                name: "Volatility Index",
                label: "Volatility Index"
            },
            {
                name: "Volatility Stop",
                label: "Volatility Stop"
            },
            {
                name: "Chandelier Exit",
                label: "Chandelier Exit"
            },
            {
                name: "Envelopes",
                label: "Envelopes"
            }
        ]
    },


    {
        title: "Volume",
        items: [
            {
                name: "Volume",
                label: "Volume"
            },
            {
                name: "On Balance Volume",
                label: "On Balance Volume"
            },
            {
                name: "Volume Oscillator",
                label: "Volume Oscillator"
            },
            {
                name: "VWAP",
                label: "Volume Weighted Average Price"
            },
            {
                name: "Volume-Weighted Moving Average",
                label: "Volume-Weighted Moving Average"
            },
            {
                name: "Money Flow Index",
                label: "Money Flow Index"
            },
            {
                name: "Chaikin Money Flow",
                label: "Chaikin Money Flow"
            },
            {
                name: "Chaikin Oscillator",
                label: "Chaikin Oscillator"
            },
            {
                name: "Accumulation/Distribution",
                label: "Accumulation/Distribution"
            },
            {
                name: "Elder's Force Index",
                label: "Elder's Force Index"
            },
            {
                name: "Ease of Movement",
                label: "Ease of Movement"
            },
            {
                name: "Net Volume",
                label: "Net Volume"
            },
            {
                name: "Price Volume Trend",
                label: "Price Volume Trend"
            },
            {
                name: "Cumulative Volume Delta",
                label: "Cumulative Volume Delta"
            },
            {
                name: "Cumulative Volume Index",
                label: "Cumulative Volume Index"
            },
            {
                name: "Relative Volume at Time",
                label: "Relative Volume at Time"
            },
            {
                name: "Percentage Volume Oscillator",
                label: "Percentage Volume Oscillator"
            },
            {
                name: "Up/Down Volume",
                label: "Up/Down Volume"
            },
            {
                name: "Volume Profile Fixed Range",
                label: "Volume Profile Fixed Range"
            },
            {
                name: "Volume Profile Visible Range",
                label: "Volume Profile Visible Range"
            }
        ]
    },


    {
        title: "Price / Other",
        items: [
            {
                name: "Average Price",
                label: "Average Price"
            },
            {
                name: "Typical Price",
                label: "Typical Price"
            },
            {
                name: "Median Price",
                label: "Median Price"
            },
            {
                name: "Ratio",
                label: "Ratio"
            },
            {
                name: "Spread",
                label: "Spread"
            },
            {
                name: "Correlation Coefficient",
                label: "Correlation Coefficient"
            },
            {
                name: "Correlation - Log",
                label: "Correlation - Log"
            },
            {
                name: "Linear Regression Curve",
                label: "Linear Regression Curve"
            },
            {
                name: "Linear Regression Slope",
                label: "Linear Regression Slope"
            },
            {
                name: "Linear Regression",
                label: "Linear Regression"
            },
            {
                name: "Performance",
                label: "Performance"
            },
            {
                name: "52 Week High/Low",
                label: "52 Week High/Low"
            },
            {
                name: "Majority Rule",
                label: "Majority Rule"
            },
            {
                name: "Advance/Decline",
                label: "Advance/Decline"
            },
            {
                name: "Balance of Power",
                label: "Balance of Power"
            },
            {
                name: "Divergence",
                label: "Divergence"
            },
            {
                name: "Pivot Points Standard",
                label: "Pivot Points Standard"
            },
            {
                name: "Price target - indicator",
                label: "Price target - indicator"
            }
        ]
    }
];


function IndicatorMenu({
    selectedIndicators,
    toggleIndicator
}) {

    const [
        search,
        setSearch
    ] = useState("");


    const totalIndicators =
        indicatorSections.reduce(
            (
                total,
                section
            ) =>
                total +
                section.items.length,
            0
        );


    const filteredSections =
        useMemo(
            () => {

                const query =
                    search
                        .trim()
                        .toLowerCase();


                return indicatorSections
                    .map(
                        section => {

                            const items =
                                section.items.filter(
                                    item => {

                                        if (!query) {
                                            return true;
                                        }

                                        return (
                                            item.label
                                                .toLowerCase()
                                                .includes(query) ||
                                            item.name
                                                .toLowerCase()
                                                .includes(query)
                                        );

                                    }
                                );


                            return {
                                ...section,
                                items
                            };

                        }
                    )
                    .filter(
                        section =>
                            section.items.length > 0
                    );

            },
            [
                search
            ]
        );


    return (
        <>

            <div className="indicatorMenuTitle">

                Indicators

                <span
                    className="indicatorCount"
                    id="indicatorCount"
                >
                    {totalIndicators}
                </span>

            </div>


            <div className="indicatorSearch">

                <input
                    type="text"
                    id="indicatorSearch"
                    placeholder="Search indicators..."
                    value={search}
                    onChange={
                        event =>
                            setSearch(
                                event.target.value
                            )
                    }
                />

            </div>


            <div id="indicatorList">

                {
                    filteredSections.map(
                        section => (

                            <div
                                className="indicatorSection"
                                key={section.title}
                            >

                                <div className="indicatorSectionTitle">
                                    {section.title}
                                </div>


                                {
                                    section.items.map(
                                        item => {

                                            const active =
                                                selectedIndicators?.has(
                                                    item.name
                                                );


                                            return (
                                                <button
                                                    key={
                                                        item.name
                                                    }
                                                    type="button"
                                                    className={
                                                        active
                                                            ? "indicatorItem active"
                                                            : "indicatorItem"
                                                    }
                                                    data-indicator={
                                                        item.name
                                                    }
                                                    onClick={
                                                        () =>
                                                            toggleIndicator(
                                                                item.name
                                                            )
                                                    }
                                                >

                                                    {item.label}


                                                    {
                                                        item.isNew && (
                                                            <>
                                                                {" "}
                                                                <span className="indicatorNewBadge">
                                                                    NEW
                                                                </span>
                                                            </>
                                                        )
                                                    }

                                                </button>
                                            );

                                        }
                                    )
                                }

                            </div>

                        )
                    )
                }


                {
                    filteredSections.length === 0 && (
                        <div className="indicatorEmpty">
                            No indicators found.
                        </div>
                    )
                }

            </div>

        </>
    );
}


export default IndicatorMenu;