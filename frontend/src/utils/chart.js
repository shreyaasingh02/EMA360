/* =========================================================
   CHART CONSTANTS
========================================================= */

export const CHART_LEFT_PAD = 55;
export const CHART_RIGHT_PAD = 105;
export const CHART_TOP_PAD = 32;

export const MIN_VISIBLE_CANDLES = 20;
export const MAX_VISIBLE_CANDLES = 1000;


/* =========================================================
   VALID CANDLES
========================================================= */

export function getValidCandles(
    candles
) {

    if (
        !Array.isArray(candles)
    ) {
        return [];
    }

    return candles.filter(
        candle =>
            candle &&
            Number.isFinite(
                Number(candle.o)
            ) &&
            Number.isFinite(
                Number(candle.h)
            ) &&
            Number.isFinite(
                Number(candle.l)
            ) &&
            Number.isFinite(
                Number(candle.c)
            )
    );
}


/* =========================================================
   HEIKIN ASHI
========================================================= */

export function heikinAshi(
    candles
) {

    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {
        return [];
    }

    const result = [];

    let previousOpen = null;
    let previousClose = null;

    candles.forEach(
        candle => {

            const open =
                Number(
                    candle.o
                );

            const high =
                Number(
                    candle.h
                );

            const low =
                Number(
                    candle.l
                );

            const close =
                Number(
                    candle.c
                );

            if (
                !Number.isFinite(open) ||
                !Number.isFinite(high) ||
                !Number.isFinite(low) ||
                !Number.isFinite(close)
            ) {
                return;
            }

            const haClose =
                (
                    open +
                    high +
                    low +
                    close
                ) / 4;

            const haOpen =
                previousOpen === null
                    ? (
                        open +
                        close
                    ) / 2
                    : (
                        previousOpen +
                        previousClose
                    ) / 2;

            const haHigh =
                Math.max(
                    high,
                    haOpen,
                    haClose
                );

            const haLow =
                Math.min(
                    low,
                    haOpen,
                    haClose
                );

            result.push({
                ...candle,
                o: haOpen,
                h: haHigh,
                l: haLow,
                c: haClose
            });

            previousOpen =
                haOpen;

            previousClose =
                haClose;
        }
    );

    return result;
}


/* =========================================================
   CHART PLOT INFORMATION
========================================================= */

export function getChartPlotInfo(
    chartCanvas,
    selectedIndicators = new Set()
) {

    if (
        !chartCanvas
    ) {
        return {
            rect: null,
            width: 0,
            height: 0,
            plotWidth: 0,
            plotHeight: 0,
            bottomPad: 30
        };
    }

    const rect =
        chartCanvas.getBoundingClientRect();

    const width =
        rect.width;

    const height =
        rect.height;

    const oscillatorSelected =
        selectedIndicators.has(
            "RSI"
        ) ||
        selectedIndicators.has(
            "MACD"
        ) ||
        selectedIndicators.has(
            "ADX"
        );

    const bottomPad =
        oscillatorSelected
            ? 125
            : 30;

    const plotWidth =
        width -
        CHART_LEFT_PAD -
        CHART_RIGHT_PAD;

    const plotHeight =
        height -
        CHART_TOP_PAD -
        bottomPad;

    return {
        rect,
        width,
        height,
        plotWidth,
        plotHeight,
        bottomPad
    };
}


/* =========================================================
   CLAMP VISIBLE CANDLE COUNT
========================================================= */

export function clampVisibleCount(
    visibleCount,
    candleLength
) {

    const maximum =
        Math.min(
            MAX_VISIBLE_CANDLES,
            Math.max(
                1,
                candleLength
            )
        );

    return Math.max(
        Math.min(
            MIN_VISIBLE_CANDLES,
            maximum
        ),
        Math.min(
            maximum,
            visibleCount
        )
    );
}


/* =========================================================
   GET VISIBLE CANDLE WINDOW
========================================================= */

export function getVisibleCandles(
    candles,
    candleMode,
    chartVisibleCount,
    chartEndIndex,
    chartFollowLatest
) {

    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {
        return {
            data: [],
            startIndex: 0,
            endIndex: 0,
            visibleCount: 0
        };
    }

    const sourceCandles =
        candles;

    let data =
        candleMode === "heikin"
            ? heikinAshi(
                sourceCandles
            )
            : sourceCandles;

    chartVisibleCount =
        clampVisibleCount(
            chartVisibleCount,
            data.length
        );

    const visibleCount =
        Math.min(
            chartVisibleCount,
            data.length
        );

    if (
        chartFollowLatest ||
        chartEndIndex === null
    ) {
        chartEndIndex =
            data.length;
    }

    chartEndIndex =
        Math.max(
            visibleCount,
            Math.min(
                data.length,
                chartEndIndex
            )
        );

    const startIndex =
        Math.max(
            0,
            chartEndIndex -
            visibleCount
        );

    data =
        data.slice(
            startIndex,
            chartEndIndex
        );

    return {
        data,
        startIndex,
        endIndex:
            chartEndIndex,
        visibleCount
    };
}


/* =========================================================
   PRICE RANGE
========================================================= */

export function getPriceRange(
    data
) {

    if (
        !Array.isArray(data) ||
        !data.length
    ) {
        return {
            min: 0,
            max: 1
        };
    }

    const lows =
        data
            .map(
                candle =>
                    Number(
                        candle.l
                    )
            )
            .filter(
                Number.isFinite
            );

    const highs =
        data
            .map(
                candle =>
                    Number(
                        candle.h
                    )
            )
            .filter(
                Number.isFinite
            );

    if (
        !lows.length ||
        !highs.length
    ) {
        return {
            min: 0,
            max: 1
        };
    }

    return {
        min:
            Math.min(
                ...lows
            ),

        max:
            Math.max(
                ...highs
            )
    };
}


/* =========================================================
   INCLUDE INDICATOR LEVELS IN PRICE RANGE
========================================================= */

export function extendPriceRange(
    min,
    max,
    levels = []
) {

    const validLevels =
        levels
            .map(
                value =>
                    Number(value)
            )
            .filter(
                value =>
                    Number.isFinite(
                        value
                    ) &&
                    value > 0
            );

    if (
        validLevels.length
    ) {

        min =
            Math.min(
                min,
                ...validLevels
            );

        max =
            Math.max(
                max,
                ...validLevels
            );
    }

    return {
        min,
        max
    };
}


/* =========================================================
   PRICE → Y
========================================================= */

export function priceToY(
    price,
    min,
    max,
    top,
    plotHeight
) {

    if (
        !Number.isFinite(
            Number(price)
        )
    ) {
        return null;
    }

    if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        max === min
    ) {
        return (
            top +
            plotHeight / 2
        );
    }

    return (
        top +
        (
            (
                max -
                Number(price)
            ) /
            (
                max -
                min
            )
        ) *
        plotHeight
    );
}


/* =========================================================
   Y → PRICE
========================================================= */

export function yToPrice(
    y,
    min,
    max,
    top,
    plotHeight
) {

    if (
        !Number.isFinite(
            y
        ) ||
        !Number.isFinite(
            min
        ) ||
        !Number.isFinite(
            max
        ) ||
        plotHeight <= 0
    ) {
        return null;
    }

    return (
        max -
        (
            (
                y -
                top
            ) /
            plotHeight
        ) *
        (
            max -
            min
        )
    );
}


/* =========================================================
   CANDLE → X
========================================================= */

export function candleToX(
    index,
    startIndex,
    visibleCount,
    plotLeft,
    plotWidth
) {

    if (
        visibleCount <= 0 ||
        plotWidth <= 0
    ) {
        return null;
    }

    const relativeIndex =
        index -
        startIndex;

    return (
        plotLeft +
        (
            (
                relativeIndex +
                0.5
            ) /
            visibleCount
        ) *
        plotWidth
    );
}


/* =========================================================
   X → CANDLE INDEX
========================================================= */

export function xToCandleIndex(
    x,
    startIndex,
    visibleCount,
    plotLeft,
    plotWidth
) {

    if (
        visibleCount <= 0 ||
        plotWidth <= 0
    ) {
        return null;
    }

    const relative =
        (
            x -
            plotLeft
        ) /
        plotWidth;

    return (
        startIndex +
        Math.floor(
            relative *
            visibleCount
        )
    );
}


/* =========================================================
   CLAMP
========================================================= */

export function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}


/* =========================================================
   CANDLE BODY WIDTH
========================================================= */

export function getCandleWidth(
    visibleCount,
    plotWidth
) {

    if (
        visibleCount <= 0 ||
        plotWidth <= 0
    ) {
        return 1;
    }

    return (
        plotWidth /
        visibleCount
    );
}


/* =========================================================
   NICE PRICE STEP
========================================================= */

export function nicePriceStep(
    range,
    targetTicks = 8
) {

    if (
        !Number.isFinite(
            range
        ) ||
        range <= 0
    ) {
        return 1;
    }

    const roughStep =
        range /
        targetTicks;

    const exponent =
        Math.floor(
            Math.log10(
                roughStep
            )
        );

    const fraction =
        roughStep /
        Math.pow(
            10,
            exponent
        );

    let niceFraction;

    if (
        fraction <= 1
    ) {
        niceFraction = 1;
    } else if (
        fraction <= 2
    ) {
        niceFraction = 2;
    } else if (
        fraction <= 5
    ) {
        niceFraction = 5;
    } else {
        niceFraction = 10;
    }

    return (
        niceFraction *
        Math.pow(
            10,
            exponent
        )
    );
}


/* =========================================================
   PRICE TICK VALUES
========================================================= */

export function getPriceTicks(
    min,
    max,
    targetTicks = 8
) {

    if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        max <= min
    ) {
        return [];
    }

    const step =
        nicePriceStep(
            max - min,
            targetTicks
        );

    const first =
        Math.ceil(
            min / step
        ) *
        step;

    const ticks = [];

    for (
        let value = first;
        value <= max;
        value += step
    ) {

        ticks.push(
            value
        );
    }

    return ticks;
}


/* =========================================================
   FORMAT PRICE
========================================================= */

export function formatChartPrice(
    value
) {

    if (
        !Number.isFinite(
            Number(value)
        )
    ) {
        return "—";
    }

    const number =
        Number(value);

    if (
        Math.abs(number) >=
        1000
    ) {
        return number.toFixed(
            2
        );
    }

    if (
        Math.abs(number) >=
        100
    ) {
        return number.toFixed(
            2
        );
    }

    if (
        Math.abs(number) >=
        1
    ) {
        return number.toFixed(
            2
        );
    }

    return number.toFixed(
        4
    );
}

/* =========================================================
   CHART STATE HELPERS
========================================================= */

export function createInitialChartState() {

    return {
        candleMode: "normal",

        chartVisibleCount: 150,

        chartEndIndex: null,

        chartFollowLatest: true,

        selectedIndicators:
            new Set([
                "EMA",
                "VWAP"
            ]),

        chartDragging: false,

        chartDragStartX: 0,

        chartDragStartY: 0,

        chartDragStartEndIndex: 0,

        chartDragOnPriceScale: false,

        chartTouchStartDistance: 0,

        chartTouchStartVisibleCount: 150,

        chartTouchStartEndIndex: 0,

        chartTouchStartX: 0,

        chartTouchStartY: 0,

        chartTouchOnPriceScale: false,

        chartPriceScaleManual: false,

        chartPriceScaleMin: null,

        chartPriceScaleMax: null,

        chartIndicatorStatus: ""
    };
}


/* =========================================================
   RESET PRICE SCALE
========================================================= */

export function resetChartPriceScale() {

    return {
        chartPriceScaleManual:
            false,

        chartPriceScaleMin:
            null,

        chartPriceScaleMax:
            null
    };
}


/* =========================================================
   RESET CHART POSITION
========================================================= */

export function resetChartPosition() {

    return {
        chartVisibleCount:
            150,

        chartEndIndex:
            null,

        chartFollowLatest:
            true
    };
}


/* =========================================================
   CLAMP CHART END INDEX
========================================================= */

export function clampChartEndIndex(
    candles,
    chartVisibleCount,
    chartEndIndex
) {

    if (
        !Array.isArray(candles) ||
        !candles.length
    ) {
        return chartEndIndex;
    }

    const maxVisible =
        Math.min(
            chartVisibleCount,
            candles.length
        );

    return Math.max(
        maxVisible,
        Math.min(
            candles.length,
            chartEndIndex === null
                ? candles.length
                : chartEndIndex
        )
    );
}


/* =========================================================
   PAN CHART BY PIXELS
========================================================= */

export function calculatePanEndIndex(
    dx,
    chartDragStartEndIndex,
    chartDragCandlesPerPixel,
    candles,
    chartVisibleCount
) {

    if (
        !Array.isArray(candles) ||
        !candles.length ||
        !chartDragCandlesPerPixel
    ) {
        return chartDragStartEndIndex;
    }

    const candleShift =
        Math.round(
            dx *
            chartDragCandlesPerPixel
        );

    const nextEndIndex =
        chartDragStartEndIndex -
        candleShift;

    return clampChartEndIndex(
        candles,
        chartVisibleCount,
        nextEndIndex
    );
}


/* =========================================================
   CALCULATE WHEEL PAN
========================================================= */

export function calculateWheelPan(
    deltaX,
    chartVisibleCount,
    chartEndIndex,
    candles,
    plotWidth
) {

    if (
        !Array.isArray(candles) ||
        !candles.length ||
        plotWidth <= 0
    ) {
        return chartEndIndex;
    }

    const candlesPerPixel =
        chartVisibleCount /
        plotWidth;

    const candleShift =
        Math.round(
            deltaX *
            candlesPerPixel
        );

    const currentEnd =
        chartEndIndex === null
            ? candles.length
            : chartEndIndex;

    return clampChartEndIndex(
        candles,
        chartVisibleCount,
        currentEnd +
            candleShift
    );
}


/* =========================================================
   CALCULATE WHEEL ZOOM
========================================================= */

export function calculateWheelZoom(
    deltaY,
    clientX,
    rect,
    plotWidth,
    candles,
    chartVisibleCount,
    chartEndIndex
) {

    if (
        !Array.isArray(candles) ||
        !candles.length ||
        plotWidth <= 0
    ) {
        return {
            visibleCount:
                chartVisibleCount,

            endIndex:
                chartEndIndex
        };
    }

    const oldCount =
        chartVisibleCount;

    const zoomIn =
        deltaY < 0;

    const zoomFactor =
        zoomIn
            ? 0.82
            : 1.22;

    let newCount =
        Math.round(
            oldCount *
            zoomFactor
        );

    newCount =
        Math.max(
            20,
            Math.min(
                500,
                newCount
            )
        );

    if (
        newCount ===
        oldCount
    ) {
        return {
            visibleCount:
                oldCount,

            endIndex:
                chartEndIndex
        };
    }

    const mouseX =
        clientX -
        rect.left;

    const ratio =
        Math.max(
            0,
            Math.min(
                1,
                (
                    mouseX -
                    CHART_LEFT_PAD
                ) /
                plotWidth
            )
        );

    const oldEnd =
        chartEndIndex === null
            ? candles.length
            : chartEndIndex;

    const oldStart =
        Math.max(
            0,
            oldEnd -
                oldCount
        );

    const candleAtMouse =
        oldStart +
        ratio *
        oldCount;

    let newEndIndex =
        Math.round(
            candleAtMouse +
            (
                1 -
                ratio
            ) *
            newCount
        );

    newEndIndex =
        clampChartEndIndex(
            candles,
            newCount,
            newEndIndex
        );

    return {
        visibleCount:
            newCount,

        endIndex:
            newEndIndex
    };
}


/* =========================================================
   TOUCH DISTANCE
========================================================= */

export function getTouchDistance(
    touches
) {

    if (
        !touches ||
        touches.length < 2
    ) {
        return 0;
    }

    const dx =
        touches[0].clientX -
        touches[1].clientX;

    const dy =
        touches[0].clientY -
        touches[1].clientY;

    return Math.sqrt(
        dx * dx +
        dy * dy
    );
}


/* =========================================================
   TOUCH MIDPOINT
========================================================= */

export function getTouchMidpoint(
    touches
) {

    if (
        !touches ||
        touches.length < 2
    ) {
        return {
            x: 0,
            y: 0
        };
    }

    return {
        x:
            (
                touches[0].clientX +
                touches[1].clientX
            ) / 2,

        y:
            (
                touches[0].clientY +
                touches[1].clientY
            ) / 2
    };
}


/* =========================================================
   TOUCH PINCH ZOOM
========================================================= */

export function calculatePinchZoom(
    currentDistance,
    startDistance,
    startVisibleCount,
    startEndIndex,
    candles
) {

    if (
        !Array.isArray(candles) ||
        !candles.length ||
        !startDistance
    ) {
        return {
            visibleCount:
                startVisibleCount,

            endIndex:
                startEndIndex
        };
    }

    const scale =
        startDistance /
        currentDistance;

    let newCount =
        Math.round(
            startVisibleCount *
            scale
        );

    newCount =
        Math.max(
            20,
            Math.min(
                500,
                newCount
            )
        );

    const anchor =
        startEndIndex;

    let newEndIndex =
        Math.round(
            anchor
        );

    newEndIndex =
        clampChartEndIndex(
            candles,
            newCount,
            newEndIndex
        );

    return {
        visibleCount:
            newCount,

        endIndex:
            newEndIndex
    };
}


/* =========================================================
   INDICATOR SET HELPERS
========================================================= */

export function toggleIndicator(
    indicators,
    indicator
) {

    const next =
        new Set(
            indicators
        );

    if (
        next.has(
            indicator
        )
    ) {
        next.delete(
            indicator
        );
    } else {
        next.add(
            indicator
        );
    }

    return next;
}


/* =========================================================
   CHECK INDICATOR
========================================================= */

export function hasIndicator(
    indicators,
    indicator
) {

    return (
        indicators instanceof Set &&
        indicators.has(
            indicator
        )
    );
}


/* =========================================================
   BASE INDICATORS
========================================================= */

export const BASE_INDICATORS = [
    "EMA",
    "SMA",
    "VWAP",
    "RSI",
    "MACD",
    "ADX"
];


/* =========================================================
   EXTENDED INDICATORS
========================================================= */

export const EXTENDED_INDICATOR_NAMES = [
    "SuperTrend",
    "Pivot Points Standard",
    "Bollinger Bands",
    "Ichimoku Cloud",
    "Stochastic",
    "Stochastic RSI",
    "ATR",
    "CCI",
    "OBV",
    "Volume"
];


/* =========================================================
   BASE INDICATOR CHECK
========================================================= */

export function isBaseIndicator(
    name
) {

    return BASE_INDICATORS.includes(
        name
    );
}


/* =========================================================
   EXTENDED INDICATOR CHECK
========================================================= */

export function isExtendedIndicator(
    name
) {

    return EXTENDED_INDICATOR_NAMES.includes(
        name
    );
}