import {
    useCallback,
    useEffect,
    useRef,
    useState
} from "react";

import {
    CHART_LEFT_PAD,
    CHART_RIGHT_PAD,
    CHART_TOP_PAD,
    clampChartEndIndex,
    clampVisibleCount,
    getChartPlotInfo,
    getTouchDistance,
    getTouchMidpoint,
    calculateWheelPan,
    calculateWheelZoom
} from "../utils/chart";

import {
    getExtendedIndicator,
    calcSR,
    calcVWAP,
    EMA
} from "../utils/indicators";


/* =========================================================
   CHART VIEW STORAGE
========================================================= */

const getChartViewStorageKey = (
    selectedStock,
    currentTF
) =>
    `ema360.chart.view.${selectedStock || "NONE"}.${currentTF || "5M"}`;


const getSavedChartView = (
    selectedStock,
    currentTF
) => {

    try {

        const key =
            getChartViewStorageKey(
                selectedStock,
                currentTF
            );

        const saved =
            localStorage.getItem(key);

        if (!saved) {
            return null;
        }

        return JSON.parse(saved);

    } catch {
        return null;
    }

};


/* =========================================================
   USE CHART
========================================================= */

function useChart({
    candles = [],
    selectedStock,
    currentTF,
    selectedIndicators: externalIndicators,
    onIndicatorsChange,
    dashboardData = null,
    mtfRSI = null
}) {

    /* =========================================================
       CANVAS
    ========================================================= */

    const canvasRef =
        useRef(null);


    /* =========================================================
       CANDLE STATE
    ========================================================= */

    const [
        candleMode,
        setCandleMode
    ] = useState(
        "normal"
    );


    /* =========================================================
       CHART VIEW STATE
    ========================================================= */

    const savedChartView =
        getSavedChartView(
            selectedStock,
            currentTF
        );


    const [
        chartVisibleCount,
        setChartVisibleCount
    ] = useState(
        Number.isFinite(
            savedChartView?.visibleCount
        )
            ? savedChartView.visibleCount
            : 50
    );

    const [
        chartEndIndex,
        setChartEndIndex
    ] = useState(
        Number.isFinite(
            savedChartView?.endIndex
        )
            ? savedChartView.endIndex
            : null
    );

    const [
        chartFollowLatest,
        setChartFollowLatest
    ] = useState(
        true
    );


    /* =========================================================
       INDICATOR STATE
    ========================================================= */

    const [
        internalSelectedIndicators,
        setInternalSelectedIndicators
    ] = useState(
        () =>
            new Set([
                "EMA",
                "VWAP"
            ])
    );

    const selectedIndicators =
        externalIndicators ??
        internalSelectedIndicators;


    /* =========================================================
       CHART DRAG STATE
    ========================================================= */

    const [
        chartDragging,
        setChartDragging
    ] = useState(
        false
    );


    const chartDragStartX =
        useRef(0);

    const chartDragStartY =
        useRef(0);

    const chartDragStartEndIndex =
        useRef(0);

    const chartDragCandlesPerPixel =
        useRef(0);

    const chartDragOnPriceScale =
        useRef(false);


    /* =========================================================
       TOUCH STATE
    ========================================================= */

    const chartTouchStartDistance =
        useRef(0);

    const chartTouchStartVisibleCount =
        useRef(150);

    const chartTouchStartEndIndex =
        useRef(0);

    const chartTouchStartX =
        useRef(0);

    const chartTouchStartY =
        useRef(0);

    const chartTouchOnPriceScale =
        useRef(false);


    /* =========================================================
       PRICE SCALE STATE
    ========================================================= */

    const [
        chartPriceScaleManual,
        setChartPriceScaleManual
    ] = useState(
        Number.isFinite(
            savedChartView?.priceMin
        ) &&
        Number.isFinite(
            savedChartView?.priceMax
        )
    );

    const [
        chartPriceScaleMin,
        setChartPriceScaleMin
    ] = useState(
        Number.isFinite(
            savedChartView?.priceMin
        )
            ? savedChartView.priceMin
            : null
    );

    const [
        chartPriceScaleMax,
        setChartPriceScaleMax
    ] = useState(
        Number.isFinite(
            savedChartView?.priceMax
        )
            ? savedChartView.priceMax
            : null
    );


    /* =========================================================
   SAVE CHART VIEW
========================================================= */

    useEffect(
        () => {

            try {

                const key =
                    getChartViewStorageKey(
                        selectedStock,
                        currentTF
                    );

                localStorage.setItem(
                    key,
                    JSON.stringify({
                        visibleCount:
                            chartVisibleCount,

                        endIndex:
                            chartEndIndex,

                        priceMin:
                            chartPriceScaleManual
                                ? chartPriceScaleMin
                                : null,

                        priceMax:
                            chartPriceScaleManual
                                ? chartPriceScaleMax
                                : null
                    })
                );

            } catch {
                /* Ignore localStorage errors */
            }

        },
        [
            selectedStock,
            currentTF,
            chartVisibleCount,
            chartEndIndex,
            chartPriceScaleManual,
            chartPriceScaleMin,
            chartPriceScaleMax
        ]
    );

    /* =========================================================
       INDICATOR STATUS
    ========================================================= */

    const [
        chartIndicatorStatus,
        setChartIndicatorStatus
    ] = useState(
        ""
    );


    /* =========================================================
       DRAW FUNCTION REF
    ========================================================= */

    const drawChartRef =
        useRef(
            null
        );


    /* =========================================================
       UPDATE GLOBAL PRICE SCALE
       Old code uses window.__chartPriceMin / Max.
    ========================================================= */

    const updateGlobalPriceScale =
        useCallback(
            (
                min,
                max
            ) => {

                window.__chartPriceMin =
                    min;

                window.__chartPriceMax =
                    max;
            },
            []
        );


    /* =========================================================
       RESET PRICE SCALE
    ========================================================= */

    const resetPriceScale =
        useCallback(
            () => {

                setChartPriceScaleManual(
                    false
                );

                setChartPriceScaleMin(
                    null
                );

                setChartPriceScaleMax(
                    null
                );

                updateGlobalPriceScale(
                    null,
                    null
                );

            },
            [
                updateGlobalPriceScale
            ]
        );


    /* =========================================================
       RESET CHART POSITION
    ========================================================= */

    const resetChartPosition =
        useCallback(
            () => {

                setChartVisibleCount(
                    50
                );

                setChartEndIndex(
                    null
                );

                setChartFollowLatest(
                    true
                );

            },
            []
        );


    /* =========================================================
       CLAMP END INDEX
    ========================================================= */

    const clampEndIndex =
        useCallback(
            (
                value,
                visibleCount =
                    chartVisibleCount
            ) => {

                return clampChartEndIndex(
                    candles,
                    visibleCount,
                    value
                );

            },
            [
                candles,
                chartVisibleCount
            ]
        );


    /* =========================================================
       PAN CHART
    ========================================================= */

    const panChartByPixels =
        useCallback(
            dx => {

                if (
                    !candles.length
                ) {
                    return;
                }

                if (
                    !chartDragCandlesPerPixel.current
                ) {
                    return;
                }

                const candleShift =
                    Math.round(
                        dx *
                        chartDragCandlesPerPixel.current
                    );

                const startEnd =
                    chartDragStartEndIndex.current;

                const nextEnd =
                    startEnd -
                    candleShift;

                const clamped =
                    clampChartEndIndex(
                        candles,
                        chartVisibleCount,
                        nextEnd
                    );

                setChartEndIndex(
                    clamped
                );

                setChartFollowLatest(
                    false
                );

            },
            [
                candles,
                chartVisibleCount
            ]);


    /* =========================================================
       MOUSE DOWN
    ========================================================= */

    const handleMouseDown =
        useCallback(
            event => {

                if (
                    !candles.length
                ) {
                    return;
                }

                event.preventDefault();

                const canvas =
                    canvasRef.current;

                if (
                    !canvas
                ) {
                    return;
                }

                const rect =
                    canvas.getBoundingClientRect();

                const x =
                    event.clientX -
                    rect.left;

                chartDragStartX.current =
                    event.clientX;

                chartDragStartY.current =
                    event.clientY;

                chartDragStartEndIndex.current =
                    chartEndIndex === null
                        ? candles.length
                        : chartEndIndex;

                chartDragOnPriceScale.current =
                    x >=
                    rect.width -
                    CHART_RIGHT_PAD;

                setChartFollowLatest(
                    false
                );

                const {
                    plotWidth
                } =
                    getChartPlotInfo(
                        canvas,
                        selectedIndicators
                    );

                chartDragCandlesPerPixel.current =
                    plotWidth > 0
                        ? chartVisibleCount /
                        plotWidth
                        : 0;

                if (
                    chartDragOnPriceScale.current
                ) {

                    const startMin =
                        Number(
                            window.__chartPriceMin
                        );

                    const startMax =
                        Number(
                            window.__chartPriceMax
                        );

                    if (
                        Number.isFinite(
                            startMin
                        ) &&
                        Number.isFinite(
                            startMax
                        ) &&
                        startMax > startMin
                    ) {

                        setChartPriceScaleMin(
                            startMin
                        );

                        setChartPriceScaleMax(
                            startMax
                        );

                        setChartPriceScaleManual(
                            true
                        );

                    }
                }

                setChartDragging(
                    true
                );

                canvas.style.cursor =
                    chartDragOnPriceScale.current
                        ? "ns-resize"
                        : "grabbing";

            },
            [
                candles,
                chartEndIndex,
                chartVisibleCount,
                selectedIndicators,
                chartPriceScaleManual
            ]);


    /* =========================================================
       MOUSE MOVE
    ========================================================= */

    const handleMouseMove =
        useCallback(
            event => {

                const canvas =
                    canvasRef.current;

                if (
                    !canvas
                ) {
                    return;
                }

                if (
                    !chartDragging
                ) {

                    const rect =
                        canvas.getBoundingClientRect();

                    const x =
                        event.clientX -
                        rect.left;

                    const onPriceScale =
                        x >=
                        rect.width -
                        CHART_RIGHT_PAD;

                    canvas.style.cursor =
                        onPriceScale
                            ? "ns-resize"
                            : "grab";

                    return;
                }

                const dx =
                    event.clientX -
                    chartDragStartX.current;

                const dy =
                    event.clientY -
                    chartDragStartY.current;


                /* ===================================================
                   PRICE SCALE
                =================================================== */

                /* ===================================================
   PRICE SCALE

   Move UP   → candles become taller
   Move DOWN → candles become shorter

   Horizontal candle width is NOT changed.
=================================================== */

                if (
                    chartDragOnPriceScale.current
                ) {

                    const {
                        rect,
                        plotHeight
                    } =
                        getChartPlotInfo(
                            canvas,
                            selectedIndicators
                        );

                    const startMin =
                        Number(
                            window.__chartPriceMin
                        );

                    const startMax =
                        Number(
                            window.__chartPriceMax
                        );

                    if (
                        Number.isFinite(
                            startMin
                        ) &&
                        Number.isFinite(
                            startMax
                        ) &&
                        startMax >
                        startMin &&
                        plotHeight > 0
                    ) {

                        const startRange =
                            startMax -
                            startMin;

                        /*
                         * dy:
                         * UP    = negative
                         * DOWN  = positive
                         *
                         * Therefore:
                         * UP   → smaller price range → taller candles
                         * DOWN → larger price range → shorter candles
                         */
                        const scaleFactor =
                            Math.exp(
                                dy *
                                0.0012
                            );

                        const newRange =
                            Math.max(
                                startRange * 0.20,
                                Math.min(
                                    startRange * 4.0,
                                    startRange *
                                    scaleFactor
                                )
                            );

                        /*
                         * Keep the price under the mouse
                         * as the anchor while scaling.
                         */
                        const pointerY =
                            chartDragStartY.current -
                            rect.top;

                        const ratio =
                            Math.max(
                                0,
                                Math.min(
                                    1,
                                    (
                                        pointerY -
                                        CHART_TOP_PAD
                                    ) /
                                    plotHeight
                                )
                            );

                        const anchorPrice =
                            startMax -
                            ratio *
                            startRange;

                        const newMax =
                            anchorPrice +
                            ratio *
                            newRange;

                        const newMin =
                            anchorPrice -
                            (
                                1 -
                                ratio
                            ) *
                            newRange;

                        setChartPriceScaleMin(
                            newMin
                        );

                        setChartPriceScaleMax(
                            newMax
                        );

                        setChartPriceScaleManual(
                            true
                        );

                        updateGlobalPriceScale(
                            newMin,
                            newMax
                        );

                        canvas.style.cursor =
                            "ns-resize";

                        drawChartRef.current?.();

                        return;
                    }

                    return;
                }


                /* ===================================================
                   MAIN CHART
                   HORIZONTAL-ONLY PAN
                =================================================== */

                panChartByPixels(
                    dx
                );

                canvas.style.cursor =
                    "grabbing";

            },
            [
                chartDragging,
                panChartByPixels,
                selectedIndicators,
                updateGlobalPriceScale
            ]);


    /* =========================================================
       MOUSE UP
    ========================================================= */

    const handleMouseUp =
        useCallback(
            () => {

                setChartDragging(
                    false
                );

                const canvas =
                    canvasRef.current;

                if (
                    canvas
                ) {
                    canvas.style.cursor =
                        "grab";
                }

            },
            []
        );


    /* =========================================================
       MOUSE LEAVE
    ========================================================= */

    const handleMouseLeave =
        useCallback(
            () => {

                if (
                    chartDragging
                ) {
                    return;
                }

                const canvas =
                    canvasRef.current;

                if (
                    canvas
                ) {
                    canvas.style.cursor =
                        "default";
                }

            },
            [
                chartDragging
            ]
        );


    /* =========================================================
MOUSE WHEEL
========================================================= */

    /* =========================================================
   MOUSE / TRACKPAD WHEEL

   IMPORTANT:
   - Browser/page zoom is blocked.
   - Ctrl + wheel / trackpad pinch becomes chart zoom.
   - Zoom is intentionally gentle.
   - Horizontal wheel movement pans the chart.
========================================================= */

    /* =========================================================
       MOUSE / TRACKPAD WHEEL
    
       Horizontal movement:
       → smooth chart pan
    
       Vertical / pinch:
       → gentle chart zoom
    
       Zoom is ALWAYS centered on the chart.
       Browser/page zoom is blocked.
    ========================================================= */

    const handleWheel =
        useCallback(
            event => {

                if (
                    !candles.length
                ) {
                    return;
                }

                event.preventDefault();

                if (
                    event.nativeEvent
                ) {
                    event.nativeEvent.preventDefault();
                }

                const canvas =
                    canvasRef.current;

                if (
                    !canvas
                ) {
                    return;
                }

                const {
                    plotWidth
                } =
                    getChartPlotInfo(
                        canvas,
                        selectedIndicators
                    );

                if (
                    plotWidth <= 0
                ) {
                    return;
                }


                /* =====================================================
                   HORIZONTAL PAN
    
                   Trackpad left/right movement should ONLY move
                   through the candles.
    
                   Candle width does NOT change.
                ===================================================== */

                if (
                    Math.abs(
                        event.deltaX
                    ) > 0.01
                ) {

                    const currentEnd =
                        chartEndIndex === null
                            ? candles.length
                            : chartEndIndex;

                    /*
                     * Very small movement per wheel event.
                     *
                     * This makes horizontal scrolling smooth
                     * instead of jumping through many candles.
                     */
                    const candleShift =
                        Math.round(
                            event.deltaX * 0.8
                        );

                    if (
                        candleShift === 0
                    ) {
                        return;
                    }

                    const newEnd =
                        clampChartEndIndex(
                            candles,
                            chartVisibleCount,
                            currentEnd +
                            candleShift
                        );

                    setChartEndIndex(
    newEnd
);

/*
 * Horizontal movement should always
 * use automatic vertical scaling.
 *
 * The newly visible candles are therefore
 * automatically centered vertically.
 */
setChartPriceScaleManual(
    false
);

setChartPriceScaleMin(
    null
);

setChartPriceScaleMax(
    null
);

updateGlobalPriceScale(
    null,
    null
);

setChartFollowLatest(
    false
);

                    drawChartRef.current?.();

                    return;
                }


                /* =====================================================
                   ZOOM
    
                   IMPORTANT:
                   Zoom is centered on the CHART,
                   NOT on the mouse cursor.
    
                   This means:
    
                           ← candles → 
                             CENTER
                           ← candles →
    
                   remain visually centered.
                ===================================================== */

                const rawDelta =
                    Number(
                        event.deltaY
                    );

                if (
                    !Number.isFinite(
                        rawDelta
                    ) ||
                    rawDelta === 0
                ) {
                    return;
                }


                /*
                 * Make zoom extremely gentle.
                 *
                 * Trackpad can send very large delta values,
                 * so first normalize them.
                 */
                const zoomDelta =
                    Math.max(
                        -25,
                        Math.min(
                            25,
                            rawDelta *
                            0.12
                        )
                    );


                /*
                 * IMPORTANT:
                 *
                 * Use the CENTER of the chart,
                 * not event.clientX.
                 */
                const rect =
                    canvas.getBoundingClientRect();

                const centerX =
                    rect.left +
                    CHART_LEFT_PAD +
                    plotWidth / 2;


                const {
                    visibleCount,
                    endIndex
                } =
                    calculateWheelZoom(
                        zoomDelta,
                        centerX,
                        rect,
                        plotWidth,
                        candles,
                        chartVisibleCount,
                        chartEndIndex
                    );


                /* =====================================================
                   EXTRA ZOOM LIMIT
    
                   Never allow one gesture to suddenly jump
                   from e.g. 150 candles → 40 candles.
                ===================================================== */

                const maxChange =
                    Math.max(
                        2,
                        Math.round(
                            chartVisibleCount *
                            0.04
                        )
                    );


                let limitedVisibleCount;

                if (
                    visibleCount >
                    chartVisibleCount
                ) {

                    limitedVisibleCount =
                        Math.min(
                            chartVisibleCount +
                            maxChange,
                            visibleCount
                        );

                } else {

                    limitedVisibleCount =
                        Math.max(
                            chartVisibleCount -
                            maxChange,
                            visibleCount
                        );

                }


                limitedVisibleCount =
                    Math.max(
                        10,
                        Math.min(
                            candles.length,
                            limitedVisibleCount
                        )
                    );


                /* =====================================================
                   KEEP THE VISIBLE RANGE CENTERED
                ===================================================== */

                const currentEnd =
                    chartEndIndex === null
                        ? candles.length
                        : chartEndIndex;

                const currentCenter =
                    currentEnd -
                    chartVisibleCount / 2;


                let centeredEnd =
                    Math.round(
                        currentCenter +
                        limitedVisibleCount / 2
                    );


                centeredEnd =
                    clampChartEndIndex(
                        candles,
                        limitedVisibleCount,
                        centeredEnd
                    );


                setChartVisibleCount(
                    limitedVisibleCount
                );

                setChartEndIndex(
                    centeredEnd
                );

                setChartFollowLatest(
                    false
                );

                drawChartRef.current?.();

            },
            [
                candles,
                chartVisibleCount,
                chartEndIndex,
                selectedIndicators
            ]
        );




    /* =========================================================
       DOUBLE CLICK PRICE SCALE
    ========================================================= */

    const handleDoubleClick =
        useCallback(
            event => {

                const canvas =
                    canvasRef.current;

                if (
                    !canvas
                ) {
                    return;
                }

                const rect =
                    canvas.getBoundingClientRect();

                const x =
                    event.clientX -
                    rect.left;

                if (
                    x <
                    rect.width -
                    CHART_RIGHT_PAD
                ) {
                    return;
                }

                resetPriceScale();

                drawChartRef.current?.();

            },
            [
                resetPriceScale
            ]);


    /* =========================================================
       CANDLE MODE
    ========================================================= */

    const changeCandleMode =
        useCallback(
            mode => {

                setCandleMode(
                    mode
                );

            },
            []
        );


    /* =========================================================
       TOGGLE INDICATOR
    ========================================================= */

    const toggleIndicator =
        useCallback(
            name => {

                const previous =
                    new Set(
                        selectedIndicators
                    );

                if (
                    previous.has(name)
                ) {
                    previous.delete(name);
                } else {
                    previous.add(name);
                }

                if (
                    onIndicatorsChange
                ) {
                    onIndicatorsChange(
                        previous
                    );
                } else {
                    setInternalSelectedIndicators(
                        previous
                    );
                }

            },
            [
                selectedIndicators,
                onIndicatorsChange
            ]
        );

    /* =========================================================
       SET INDICATORS
    ========================================================= */

    const setIndicators =
        useCallback(
            indicators => {

                const next =
                    new Set(indicators);

                if (onIndicatorsChange) {

                    onIndicatorsChange(
                        next
                    );

                } else {

                    setInternalSelectedIndicators(
                        next
                    );

                }

            },
            [
                onIndicatorsChange
            ]
        );


    /* =========================================================
       TOUCH START
    ========================================================= */

    const handleTouchStart =
        useCallback(
            event => {

                if (
                    !candles.length
                ) {
                    return;
                }

                event.preventDefault();

                const canvas =
                    canvasRef.current;

                if (
                    !canvas
                ) {
                    return;
                }

                const rect =
                    canvas.getBoundingClientRect();

                if (
                    event.touches.length === 2
                ) {

                    chartTouchStartDistance.current =
                        getTouchDistance(
                            event.touches
                        );

                    chartTouchStartVisibleCount.current =
                        chartVisibleCount;

                    chartTouchStartEndIndex.current =
                        chartEndIndex === null
                            ? candles.length
                            : chartEndIndex;

                    setChartDragging(
                        true
                    );

                    return;
                }


                if (
                    event.touches.length === 1
                ) {

                    const touch =
                        event.touches[0];

                    const x =
                        touch.clientX -
                        rect.left;

                    chartTouchStartX.current =
                        touch.clientX;

                    chartTouchStartY.current =
                        touch.clientY;

                    chartTouchStartEndIndex.current =
                        chartEndIndex === null
                            ? candles.length
                            : chartEndIndex;

                    chartTouchOnPriceScale.current =
                        x >=
                        rect.width -
                        CHART_RIGHT_PAD;

                    const {
                        plotWidth
                    } =
                        getChartPlotInfo(
                            canvas,
                            selectedIndicators
                        );

                    chartDragCandlesPerPixel.current =
                        plotWidth > 0
                            ? chartVisibleCount /
                            plotWidth
                            : 0;

                    setChartFollowLatest(
                        false
                    );

                    setChartDragging(
                        true
                    );

                }

            },
            [
                candles,
                chartVisibleCount,
                chartEndIndex,
                selectedIndicators
            ]);


    /* =========================================================
       TOUCH MOVE
    ========================================================= */

    const handleTouchMove =
        useCallback(
            event => {

                if (
                    !chartDragging
                ) {
                    return;
                }

                event.preventDefault();

                const canvas =
                    canvasRef.current;

                if (
                    !canvas
                ) {
                    return;
                }


                /* ===================================================
                   PINCH
                =================================================== */

                if (
                    event.touches.length === 2
                ) {

                    const currentDistance =
                        getTouchDistance(
                            event.touches
                        );

                    const startDistance =
                        chartTouchStartDistance.current;

                    if (
                        !startDistance
                    ) {
                        return;
                    }

                    const scale =
                        startDistance /
                        currentDistance;

                    let newCount =
                        Math.round(
                            chartTouchStartVisibleCount.current *
                            scale
                        );

                    newCount =
                        clampVisibleCount(
                            newCount,
                            candles.length
                        );

                    const oldCount =
                        chartTouchStartVisibleCount.current;

                    const oldEnd =
                        chartTouchStartEndIndex.current;

                    const midpoint =
                        getTouchMidpoint(
                            event.touches
                        );

                    const rect =
                        canvas.getBoundingClientRect();

                    const {
                        plotWidth
                    } =
                        getChartPlotInfo(
                            canvas,
                            selectedIndicators
                        );

                    const ratio =
                        plotWidth > 0
                            ? Math.max(
                                0,
                                Math.min(
                                    1,
                                    (
                                        midpoint.x -
                                        rect.left -
                                        CHART_LEFT_PAD
                                    ) /
                                    plotWidth
                                )
                            )
                            : 0.5;

                    const oldStart =
                        Math.max(
                            0,
                            oldEnd -
                            oldCount
                        );

                    const candleAtMidpoint =
                        oldStart +
                        ratio *
                        oldCount;

                    let newEnd =
                        Math.round(
                            candleAtMidpoint +
                            (
                                1 -
                                ratio
                            ) *
                            newCount
                        );

                    newEnd =
                        clampChartEndIndex(
                            candles,
                            newCount,
                            newEnd
                        );

                    setChartVisibleCount(
                        newCount
                    );

                    setChartEndIndex(
                        newEnd
                    );

                    setChartFollowLatest(
                        false
                    );

                    drawChartRef.current?.();

                    return;
                }


                /* ===================================================
                   ONE FINGER
                =================================================== */

                if (
                    event.touches.length === 1
                ) {

                    const touch =
                        event.touches[0];

                    const dx =
                        touch.clientX -
                        chartTouchStartX.current;

                    const dy =
                        touch.clientY -
                        chartTouchStartY.current;


                    /* =================================================
                       PRICE SCALE
                    ================================================= */

                    if (
                        chartTouchOnPriceScale.current &&
                        Math.abs(dy) >
                        Math.abs(dx)
                    ) {

                        const {
                            rect,
                            plotHeight
                        } =
                            getChartPlotInfo(
                                canvas,
                                selectedIndicators
                            );

                        const startMin =
                            Number(
                                window.__chartPriceMin
                            );

                        const startMax =
                            Number(
                                window.__chartPriceMax
                            );

                        if (
                            Number.isFinite(
                                startMin
                            ) &&
                            Number.isFinite(
                                startMax
                            ) &&
                            startMax >
                            startMin &&
                            plotHeight > 0
                        ) {

                            const startRange =
                                startMax -
                                startMin;

                            const scaleFactor =
                                Math.exp(
                                    dy *
                                    0.0012
                                );

                            const newRange =
                                Math.max(
                                    startRange *
                                    0.35,
                                    Math.min(
                                        startRange *
                                        3.0,
                                        startRange *
                                        scaleFactor
                                    )
                                );

                            const pointerY =
                                chartTouchStartY.current -
                                rect.top;

                            const ratio =
                                Math.max(
                                    0,
                                    Math.min(
                                        1,
                                        (
                                            pointerY -
                                            CHART_TOP_PAD
                                        ) /
                                        plotHeight
                                    )
                                );

                            const anchorPrice =
                                startMax -
                                ratio *
                                startRange;

                            const newMax =
                                anchorPrice +
                                ratio *
                                newRange;

                            const newMin =
                                anchorPrice -
                                (
                                    1 -
                                    ratio
                                ) *
                                newRange;

                            setChartPriceScaleMax(
                                newMax
                            );

                            setChartPriceScaleMin(
                                newMin
                            );

                            setChartPriceScaleManual(
                                true
                            );

                            updateGlobalPriceScale(
                                newMin,
                                newMax
                            );

                            drawChartRef.current?.();

                            return;
                        }
                    }


                    /* =================================================
                       HORIZONTAL PAN
                    ================================================= */

                    if (
                        !chartDragCandlesPerPixel.current
                    ) {
                        return;
                    }

                    const candleShift =
                        Math.round(
                            dx *
                            chartDragCandlesPerPixel.current
                        );

                    let newEnd =
                        chartTouchStartEndIndex.current -
                        candleShift;

                    newEnd =
                        clampChartEndIndex(
                            candles,
                            chartVisibleCount,
                            newEnd
                        );

                    setChartEndIndex(
                        newEnd
                    );

                    setChartFollowLatest(
                        false
                    );

                    drawChartRef.current?.();

                }

            },
            [
                chartDragging,
                candles,
                chartVisibleCount,
                selectedIndicators,
                updateGlobalPriceScale
            ]);


    /* =========================================================
       TOUCH END
    ========================================================= */

    const handleTouchEnd =
        useCallback(
            event => {

                if (
                    event.touches.length === 0
                ) {

                    setChartDragging(
                        false
                    );

                    chartTouchStartDistance.current =
                        0;

                    const canvas =
                        canvasRef.current;

                    if (
                        canvas
                    ) {
                        canvas.style.cursor =
                            "grab";
                    }

                    return;
                }


                /* ===================================================
                   IF ONE FINGER REMAINS,
                   START A NEW PAN GESTURE
                =================================================== */

                if (
                    event.touches.length === 1
                ) {

                    const touch =
                        event.touches[0];

                    const canvas =
                        canvasRef.current;

                    if (
                        !canvas
                    ) {
                        return;
                    }

                    const rect =
                        canvas.getBoundingClientRect();

                    chartTouchStartX.current =
                        touch.clientX;

                    chartTouchStartY.current =
                        touch.clientY;

                    chartTouchStartEndIndex.current =
                        chartEndIndex === null
                            ? candles.length
                            : chartEndIndex;

                    chartTouchOnPriceScale.current =
                        (
                            touch.clientX -
                            rect.left
                        ) >=
                        rect.width -
                        CHART_RIGHT_PAD;

                    chartTouchStartDistance.current =
                        0;

                    const {
                        plotWidth
                    } =
                        getChartPlotInfo(
                            canvas,
                            selectedIndicators
                        );

                    chartDragCandlesPerPixel.current =
                        plotWidth > 0
                            ? chartVisibleCount /
                            plotWidth
                            : 0;

                }

            },
            [
                candles.length,
                chartEndIndex,
                chartVisibleCount,
                selectedIndicators
            ]);


    /* =========================================================
       RESET WHEN STOCK / TIMEFRAME CHANGES
    ========================================================= */

    useEffect(
        () => {

            resetPriceScale();

            resetChartPosition();

        },
        [
            selectedStock,
            currentTF,
            resetPriceScale,
            resetChartPosition
        ]
    );


    /* =========================================================
       KEEP END INDEX VALID
    ========================================================= */

    useEffect(
        () => {

            if (
                !candles.length
            ) {
                return;
            }

            setChartEndIndex(
                previous => {

                    const next =
                        clampChartEndIndex(
                            candles,
                            chartVisibleCount,
                            previous
                        );

                    if (
                        next ===
                        previous
                    ) {
                        return previous;
                    }

                    return next;
                }
            );

        },
        [
            candles,
            chartVisibleCount
        ]
    );

    function macdSeries(arr) {

        const closes =
            arr.map(
                candle =>
                    Number(candle.c)
            );

        function ema(values, period) {

            const result =
                new Array(values.length)
                    .fill(null);

            if (!values.length) {
                return result;
            }

            const alpha =
                2 /
                (period + 1);

            let previous =
                Number(values[0]);

            if (!Number.isFinite(previous)) {
                return result;
            }

            result[0] =
                previous;

            for (
                let i = 1;
                i < values.length;
                i++
            ) {

                const value =
                    Number(values[i]);

                if (
                    !Number.isFinite(value)
                ) {
                    result[i] =
                        previous;

                    continue;
                }

                previous =
                    value * alpha +
                    previous * (1 - alpha);

                result[i] =
                    previous;
            }

            return result;
        }

        const ema12 =
            ema(
                closes,
                12
            );

        const ema26 =
            ema(
                closes,
                26
            );

        const macd =
            closes.map(
                (_, index) => {

                    if (
                        !Number.isFinite(
                            ema12[index]
                        ) ||
                        !Number.isFinite(
                            ema26[index]
                        )
                    ) {
                        return null;
                    }

                    return (
                        ema12[index] -
                        ema26[index]
                    );
                }
            );

        const signal =
            new Array(
                macd.length
            ).fill(null);

        const valid = [];

        macd.forEach(
            (value, index) => {

                if (
                    Number.isFinite(value)
                ) {
                    valid.push({
                        index,
                        value
                    });
                }

            }
        );

        if (
            valid.length >= 9
        ) {

            let previous =
                valid
                    .slice(0, 9)
                    .reduce(
                        (sum, item) =>
                            sum + item.value,
                        0
                    ) / 9;

            signal[
                valid[8].index
            ] =
                previous;

            const alpha =
                2 / 10;

            for (
                let i = 9;
                i < valid.length;
                i++
            ) {

                previous =
                    valid[i].value * alpha +
                    previous * (1 - alpha);

                signal[
                    valid[i].index
                ] =
                    previous;
            }
        }

        return {
            macd,
            signal
        };
    }

    /* =========================================================
   INDICATOR NAME RESOLVER
   Menu names and calculation-engine names are not always
   identical.
========================================================= */

    function resolveExtendedIndicator(
        name,
        sourceCandles
    ) {
        const aliases = {
            "ADX": [
                "ADX",
                "Average Directional Index"
            ],

            "Ichimoku Cloud": [
                "Ichimoku Cloud",
                "Ichimoku"
            ],

            "Stochastic": [
                "Stochastic",
                "Stochastic Oscillator"
            ],

            "Rate Of Change": [
                "Rate Of Change",
                "Rate of Change",
                "ROC"
            ],

            "Commodity Channel Index": [
                "Commodity Channel Index",
                "CCI"
            ],

            "Average True Range": [
                "Average True Range",
                "ATR"
            ],

            "On Balance Volume": [
                "On Balance Volume",
                "OBV"
            ],

            "Volume Oscillator": [
                "Volume Oscillator"
            ],

            "Trend Strength Index": [
                "Trend Strength Index",
                "Trend Strength"
            ]
        };

        const candidates =
            aliases[name] || [name];

        for (
            const candidate
            of candidates
        ) {

            const calculation =
                getExtendedIndicator(
                    candidate,
                    sourceCandles
                );

            if (
                calculation
            ) {
                return calculation;
            }
        }

        return null;
    }

    /* =========================================================
       RSI SERIES - SAME CALCULATION AS OLD index.html
    ========================================================= */

    function rsiSeries(arr, length = 14) {

        const result =
            new Array(arr.length).fill(null);

        if (
            !Array.isArray(arr) ||
            arr.length <= length
        ) {
            return result;
        }

        let gainSum = 0;
        let lossSum = 0;

        for (let i = 1; i <= length; i++) {

            const current = Number(arr[i].c);
            const previous = Number(arr[i - 1].c);
            const diff = current - previous;

            if (diff > 0) {
                gainSum += diff;
            } else {
                lossSum += Math.abs(diff);
            }
        }

        let avgGain = gainSum / length;
        let avgLoss = lossSum / length;

        const calculateRSI = () => {

            if (avgLoss === 0) return 100;
            if (avgGain === 0) return 0;

            const rs = avgGain / avgLoss;

            return 100 - (100 / (1 + rs));
        };

        result[length] = calculateRSI();

        for (let i = length + 1; i < arr.length; i++) {

            const current = Number(arr[i].c);
            const previous = Number(arr[i - 1].c);
            const diff = current - previous;

            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? Math.abs(diff) : 0;

            avgGain =
                (avgGain * (length - 1) + gain) /
                length;

            avgLoss =
                (avgLoss * (length - 1) + loss) /
                length;

            result[i] = calculateRSI();
        }

        return result;
    }


    /* =========================================================
       ADX / +DI / -DI SERIES - SAME CALCULATION AS OLD index.html
    ========================================================= */

    function adxSeries(arr) {

        const period = 14;

        const adxValues =
            new Array(arr.length).fill(null);

        const plusValues =
            new Array(arr.length).fill(null);

        const minusValues =
            new Array(arr.length).fill(null);

        if (
            !Array.isArray(arr) ||
            arr.length < period * 2
        ) {
            return {
                adx: adxValues,
                plus: plusValues,
                minus: minusValues
            };
        }

        const tr = [];
        const plusDM = [];
        const minusDM = [];

        for (let i = 1; i < arr.length; i++) {

            const high = Number(arr[i].h);
            const low = Number(arr[i].l);
            const previousHigh = Number(arr[i - 1].h);
            const previousLow = Number(arr[i - 1].l);
            const previousClose = Number(arr[i - 1].c);

            const upMove = high - previousHigh;
            const downMove = previousLow - low;

            tr.push(
                Math.max(
                    high - low,
                    Math.abs(high - previousClose),
                    Math.abs(low - previousClose)
                )
            );

            plusDM.push(
                upMove > downMove && upMove > 0
                    ? upMove
                    : 0
            );

            minusDM.push(
                downMove > upMove && downMove > 0
                    ? downMove
                    : 0
            );
        }

        let smoothedTR =
            tr.slice(0, period).reduce(
                (a, b) => a + b,
                0
            );

        let smoothedPlus =
            plusDM.slice(0, period).reduce(
                (a, b) => a + b,
                0
            );

        let smoothedMinus =
            minusDM.slice(0, period).reduce(
                (a, b) => a + b,
                0
            );

        const dx = [];

        for (let i = period - 1; i < tr.length; i++) {

            if (i >= period) {
                smoothedTR =
                    smoothedTR -
                    smoothedTR / period +
                    tr[i];

                smoothedPlus =
                    smoothedPlus -
                    smoothedPlus / period +
                    plusDM[i];

                smoothedMinus =
                    smoothedMinus -
                    smoothedMinus / period +
                    minusDM[i];
            }

            if (smoothedTR <= 0) continue;

            const plusDI =
                (smoothedPlus / smoothedTR) * 100;

            const minusDI =
                (smoothedMinus / smoothedTR) * 100;

            const denominator = plusDI + minusDI;

            if (denominator <= 0) continue;

            const dxValue =
                Math.abs(plusDI - minusDI) /
                denominator *
                100;

            const candleIndex = i + 1;

            plusValues[candleIndex] = plusDI;
            minusValues[candleIndex] = minusDI;

            dx.push({
                candleIndex,
                value: dxValue
            });
        }

        if (dx.length < period) {
            return {
                adx: adxValues,
                plus: plusValues,
                minus: minusValues
            };
        }

        let adx =
            dx.slice(0, period).reduce(
                (sum, item) => sum + item.value,
                0
            ) / period;

        adxValues[dx[period - 1].candleIndex] = adx;

        for (let i = period; i < dx.length; i++) {

            adx =
                (
                    adx * (period - 1) +
                    dx[i].value
                ) /
                period;

            adxValues[dx[i].candleIndex] = adx;
        }

        return {
            adx: adxValues,
            plus: plusValues,
            minus: minusValues
        };
    }


    /* =========================================================
       ANALYSIS CARD VALUE CHECK
       A chart value box is shown ONLY when the corresponding
       analysis card does not currently have a real value.
    ========================================================= */

    const analysisCardHasValue =
        useCallback(
            name => {

                const d = dashboardData;

                switch (name) {

                    case "EMA":
                        return Boolean(
                            d &&
                            [
                                d.e30,
                                d.e50,
                                d.e100
                            ].some(
                                Number.isFinite
                            )
                        );

                    case "VWAP":
                        return Boolean(
                            d &&
                            Number.isFinite(
                                Number(d.w)
                            )
                        );

                    case "RSI":
                        return Boolean(
                            mtfRSI &&
                            Number.isFinite(
                                Number(
                                    mtfRSI.rsiAverage
                                )
                            )
                        );

                    case "ADX":
                        return Boolean(
                            d?.D &&
                            Number.isFinite(
                                Number(d.D.A)
                            ) &&
                            Number.isFinite(
                                Number(d.D.P)
                            ) &&
                            Number.isFinite(
                                Number(d.D.N)
                            )
                        );

                    case "Volume":
                        return Boolean(
                            d &&
                            Number.isFinite(
                                Number(d.rel)
                            )
                        );

                    case "Trend Strength":
                    case "Trend Strength Index":
                        return Boolean(
                            d &&
                            Number.isFinite(
                                Number(d.strength)
                            )
                        );

                    case "Support":
                    case "Resistance":
                        return Boolean(
                            d?.Z &&
                            (
                                Number.isFinite(
                                    Number(d.Z.support)
                                ) ||
                                Number.isFinite(
                                    Number(d.Z.resistance)
                                )
                            )
                        );

                    default:
                        return false;
                }
            },
            [dashboardData, mtfRSI]
        );

    /* =========================================================
   DRAW CHART
========================================================= */

    const drawChart =
        useCallback(
            () => {

                const canvas =
                    canvasRef.current;

                if (
                    !canvas
                ) {
                    return;
                }

                const ctx =
                    canvas.getContext(
                        "2d"
                    );

                if (
                    !ctx
                ) {
                    return;
                }

                const rect =
                    canvas.getBoundingClientRect();

                if (
                    rect.width <= 0 ||
                    rect.height <= 0
                ) {
                    return;
                }


                /* =====================================================
                   CANVAS SIZE
                ===================================================== */

                const dpr =
                    window.devicePixelRatio ||
                    1;

                const width =
                    Math.round(
                        rect.width
                    );

                const height =
                    Math.round(
                        rect.height
                    );

                canvas.width =
                    width * dpr;

                canvas.height =
                    height * dpr;

                ctx.setTransform(
                    dpr,
                    0,
                    0,
                    dpr,
                    0,
                    0
                );


                /* =====================================================
                   CLEAR
                ===================================================== */

                ctx.clearRect(
                    0,
                    0,
                    width,
                    height
                );


                if (
                    !Array.isArray(
                        candles
                    ) ||
                    candles.length === 0
                ) {
                    return;
                }


                /* =====================================================
   REAL CANDLE DATA FOR INDICATORS
   DO NOT USE HEIKIN ASHI HERE
===================================================== */

                const indicatorCandles =
                    candles;

                const sourceCandles =
                    indicatorCandles;


                /* =====================================================
                   INDICATOR CALCULATIONS
                ===================================================== */

                const sr =
                    calcSR(
                        indicatorCandles
                    );

                    console.log("========== SR DEBUG ==========");
console.log("STOCK:", selectedStock);
console.log("TIMEFRAME:", currentTF);
console.log("CURRENT PRICE:", indicatorCandles.at(-1)?.c);
console.log("SR RESULT:", sr);

console.log(
    "CANDLE DATA:",
    JSON.stringify(
        indicatorCandles.slice(-50).map(c => ({
            time: c.time,
            o: c.o,
            h: c.h,
            l: c.l,
            c: c.c,
            v: c.v
        })),
        null,
        2
    )
);

console.log(
    "HIGHEST PREVIOUS HIGH:",
    Math.max(
        ...indicatorCandles
            .slice(-51, -1)
            .map(c => Number(c.h))
            .filter(Number.isFinite)
    )
);

console.log(
    "LOWEST PREVIOUS LOW:",
    Math.min(
        ...indicatorCandles
            .slice(-51, -1)
            .map(c => Number(c.l))
            .filter(Number.isFinite)
    )
);

console.log("================================");

                const extendedIndicators = [];

                let hasPanelIndicator =
                    false;

                selectedIndicators.forEach(
                    name => {

                        /*
                         * These are already drawn separately.
                         */
                        if (
                            name === "EMA" ||
                            name === "VWAP"
                        ) {
                            return;
                        }

                        if (
                            name === "RSI" ||
                            name === "ADX" ||
                            name === "MACD"
                        ) {
                            hasPanelIndicator = true;
                            return;
                        }

                        const calculation =
                            resolveExtendedIndicator(
                                name,
                                indicatorCandles
                            );

                        if (
                            !calculation
                        ) {
                            return;
                        }

                        if (
                            calculation.panel ===
                            "overlay"
                        ) {

                            extendedIndicators.push({
                                name,
                                calculation
                            });

                        }

                        if (
                            calculation.panel ===
                            "panel"
                        ) {

                            hasPanelIndicator =
                                true;

                        }

                    }
                );

                /* =====================================================
                   PLOT AREA
                ===================================================== */

                const left =
                    CHART_LEFT_PAD;

                const right =
                    width -
                    CHART_RIGHT_PAD;

                const top =
                    CHART_TOP_PAD;

                const indicatorPanelHeight =
                    hasPanelIndicator
                        ? 95
                        : 0;

                const indicatorPanelGap =
                    hasPanelIndicator
                        ? 8
                        : 0;

                const bottom =
                    height -
                    30 -
                    indicatorPanelHeight -
                    indicatorPanelGap;

                const plotWidth =
                    Math.max(
                        1,
                        right -
                        left
                    );

                const plotHeight =
                    Math.max(
                        1,
                        bottom -
                        top
                    );


                /* =====================================================
                   VISIBLE CANDLES
                ===================================================== */

                const visibleCount =
                    clampVisibleCount(
                        chartVisibleCount,
                        candles.length
                    );

                let endIndex =
                    chartEndIndex === null
                        ? candles.length
                        : chartEndIndex;

                endIndex =
                    clampChartEndIndex(
                        candles,
                        visibleCount,
                        endIndex
                    );

                const startIndex =
                    Math.max(
                        0,
                        endIndex -
                        visibleCount
                    );

                const source =
                    candles.slice(
                        startIndex,
                        endIndex
                    );


                /* =====================================================
                   HEIKIN ASHI
                   ONLY VISUAL CANDLES
                ===================================================== */

                let visibleCandles =
                    source;

                if (
                    candleMode ===
                    "heikin"
                ) {

                    let previousOpen =
                        null;

                    let previousClose =
                        null;

                    visibleCandles =
                        source.map(
                            candle => {

                                const o =
                                    Number(
                                        candle.o
                                    );

                                const h =
                                    Number(
                                        candle.h
                                    );

                                const l =
                                    Number(
                                        candle.l
                                    );

                                const c =
                                    Number(
                                        candle.c
                                    );

                                const haClose =
                                    (
                                        o +
                                        h +
                                        l +
                                        c
                                    ) / 4;

                                const haOpen =
                                    previousOpen === null
                                        ? (
                                            o +
                                            c
                                        ) / 2
                                        : (
                                            previousOpen +
                                            previousClose
                                        ) / 2;

                                const haHigh =
                                    Math.max(
                                        h,
                                        haOpen,
                                        haClose
                                    );

                                const haLow =
                                    Math.min(
                                        l,
                                        haOpen,
                                        haClose
                                    );

                                previousOpen =
                                    haOpen;

                                previousClose =
                                    haClose;

                                return {
                                    ...candle,
                                    o:
                                        haOpen,
                                    h:
                                        haHigh,
                                    l:
                                        haLow,
                                    c:
                                        haClose
                                };

                            }
                        );
                }


                /* =====================================================
                   PRICE RANGE
                ===================================================== */

                let priceMin =
                    Infinity;

                let priceMax =
                    -Infinity;

                visibleCandles.forEach(
                    candle => {

                        const high =
                            Number(
                                candle.h
                            );

                        const low =
                            Number(
                                candle.l
                            );

                        if (
                            Number.isFinite(
                                high
                            )
                        ) {
                            priceMax =
                                Math.max(
                                    priceMax,
                                    high
                                );
                        }

                        if (
                            Number.isFinite(
                                low
                            )
                        ) {
                            priceMin =
                                Math.min(
                                    priceMin,
                                    low
                                );
                        }

                    }
                );

                /* =====================================================
                   PRICE RANGE MANUAL SCALE
                ===================================================== */

                /* =====================================================
   PRICE RANGE MANUAL SCALE
===================================================== */

if (
    chartPriceScaleManual &&
    Number.isFinite(chartPriceScaleMin) &&
    Number.isFinite(chartPriceScaleMax) &&
    chartPriceScaleMax > chartPriceScaleMin
) {
    priceMin = chartPriceScaleMin;
    priceMax = chartPriceScaleMax;
}




                /* =====================================================
   INCLUDE SUPPORT / RESISTANCE IN PRICE RANGE
===================================================== */

                /* =====================================================
   SUPPORT / RESISTANCE

   IMPORTANT:
   S/R is drawn on the chart, but it must NOT affect
   the automatic candle price scale.

   Otherwise a distant S/R level can compress the
   visible candles vertically.
===================================================== */

                /* =====================================================
                   FALLBACK RANGE
                ===================================================== */

                if (
                    !Number.isFinite(
                        priceMin
                    ) ||
                    !Number.isFinite(
                        priceMax
                    ) ||
                    priceMax <=
                    priceMin
                ) {

                    priceMin =
                        0;

                    priceMax =
                        1;
                }


                const range =
                    priceMax -
                    priceMin;

                const padding =
                    range *
                    0.06;

                if (
                    !chartPriceScaleManual
                ) {

                    priceMin -=
                        padding;

                    priceMax +=
                        padding;
                }


                updateGlobalPriceScale(
                    priceMin,
                    priceMax
                );


                /* =====================================================
                   BACKGROUND
                ===================================================== */

                ctx.fillStyle =
                    "#0b1220";

                ctx.fillRect(
                    0,
                    0,
                    width,
                    height
                );


                /* =====================================================
                   GRID
                ===================================================== */

                ctx.strokeStyle =
                    "rgba(255,255,255,0.06)";

                ctx.lineWidth =
                    1;

                const gridRows =
                    6;

                for (
                    let i = 0;
                    i <= gridRows;
                    i++
                ) {

                    const y =
                        top +
                        (
                            i /
                            gridRows
                        ) *
                        plotHeight;

                    ctx.beginPath();

                    ctx.moveTo(
                        left,
                        y
                    );

                    ctx.lineTo(
                        right,
                        y
                    );

                    ctx.stroke();

                }


                /* =====================================================
                   PRICE SCALE
                ===================================================== */

                ctx.fillStyle =
                    "#9ca3af";

                ctx.font =
                    "11px Arial";

                ctx.textAlign =
                    "left";

                ctx.textBaseline =
                    "middle";

                for (
                    let i = 0;
                    i <= gridRows;
                    i++
                ) {

                    const ratio =
                        i /
                        gridRows;

                    const price =
                        priceMax -
                        (
                            ratio *
                            (
                                priceMax -
                                priceMin
                            )
                        );

                    const y =
                        top +
                        ratio *
                        plotHeight;

                    ctx.fillText(
                        price.toFixed(
                            2
                        ),
                        right +
                        8,
                        y
                    );

                }


                /* =====================================================
                   CANDLE WIDTH
                ===================================================== */

                const slotWidth =
                    plotWidth /
                    Math.max(
                        1,
                        visibleCandles.length
                    );

                const candleWidth =
                    Math.max(
                        1,
                        Math.min(
                            18,
                            slotWidth *
                            0.68
                        )
                    );


                /* =====================================================
                   PRICE → Y
                ===================================================== */

                const priceToY =
                    price => {

                        return (
                            top +
                            (
                                (
                                    priceMax -
                                    price
                                ) /
                                (
                                    priceMax -
                                    priceMin
                                )
                            ) *
                            plotHeight
                        );

                    };

                /* =====================================================
   CHART VALUE BOX RULE
===================================================== */

                const shouldShowChartValueBox =
                    name => !analysisCardHasValue(name);

                /* =====================================================
INDICATOR VALUE BOX
===================================================== */

                /* =====================================================
   INDICATOR VALUE BOX
===================================================== */

                const drawIndicatorValueBox =
                    (
                        value,
                        yPosition,
                        color,
                        label,
                        minY = 3,
                        maxY = height - 3
                    ) => {

                        if (
                            !Number.isFinite(
                                Number(value)
                            )
                        ) {
                            return;
                        }

                        const numberValue =
                            Number(value);

                        const labelText =
                            `${label} ${numberValue.toFixed(2)}`;

                        ctx.save();

                        const boxHeight =
                            18;

                        const boxX =
                            right + 4;

                        const boxRight =
                            width - 4;

                        const boxWidth =
                            Math.min(
                                100,
                                boxRight -
                                boxX
                            );

                        const boxY =
                            Math.max(
                                minY,
                                Math.min(
                                    maxY -
                                    boxHeight,
                                    yPosition -
                                    boxHeight / 2
                                )
                            );

                        ctx.font =
                            "bold 10px Arial";

                        ctx.fillStyle =
                            "#0b2345";

                        ctx.fillRect(
                            boxX,
                            boxY,
                            boxWidth,
                            boxHeight
                        );

                        ctx.strokeStyle =
                            color ||
                            "#7189aa";

                        ctx.lineWidth =
                            1;

                        ctx.strokeRect(
                            boxX,
                            boxY,
                            boxWidth,
                            boxHeight
                        );

                        ctx.fillStyle =
                            "#ffffff";

                        ctx.textAlign =
                            "center";

                        ctx.textBaseline =
                            "middle";

                        ctx.fillText(
                            labelText,
                            boxX +
                            boxWidth / 2,
                            boxY +
                            boxHeight / 2
                        );

                        ctx.restore();
                    };

                /* =====================================================
   HORIZONTAL LEVEL
===================================================== */

                const drawHorizontalLevel =
                    (
                        value,
                        color,
                        label
                    ) => {

                        if (
                            !Number.isFinite(
                                Number(value)
                            )
                        ) {
                            return;
                        }

                        const y =
                            priceToY(
                                Number(value)
                            );

                        if (
                            !Number.isFinite(y)
                        ) {
                            return;
                        }

                        ctx.save();

                        ctx.strokeStyle =
                            color;

                        ctx.lineWidth =
                            1;

                        ctx.setLineDash(
                            [
                                6,
                                4
                            ]
                        );

                        ctx.beginPath();

                        ctx.moveTo(
                            left,
                            y
                        );

                        ctx.lineTo(
                            right,
                            y
                        );

                        ctx.stroke();

                        ctx.setLineDash([]);

                        ctx.font =
                            "bold 10px Arial";

                        ctx.textAlign =
                            "right";

                        ctx.textBaseline =
                            "middle";

                        ctx.fillStyle =
                            color;



                        ctx.restore();
                    };

                /* =====================================================
                   CANDLES
                ===================================================== */

                visibleCandles.forEach(
                    (
                        candle,
                        index
                    ) => {

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
                            !Number.isFinite(
                                open
                            ) ||
                            !Number.isFinite(
                                high
                            ) ||
                            !Number.isFinite(
                                low
                            ) ||
                            !Number.isFinite(
                                close
                            )
                        ) {
                            return;
                        }

                        const x =
                            left +
                            (
                                index +
                                0.5
                            ) *
                            slotWidth;

                        const yHigh =
                            priceToY(
                                high
                            );

                        const yLow =
                            priceToY(
                                low
                            );

                        const yOpen =
                            priceToY(
                                open
                            );

                        const yClose =
                            priceToY(
                                close
                            );

                        const bullish =
                            close >=
                            open;


                        /* WICK */

                        ctx.beginPath();

                        ctx.moveTo(
                            x,
                            yHigh
                        );

                        ctx.lineTo(
                            x,
                            yLow
                        );

                        ctx.strokeStyle =
                            bullish
                                ? "#22c55e"
                                : "#ef4444";

                        ctx.lineWidth =
                            1;

                        ctx.stroke();


                        /* BODY */

                        const bodyTop =
                            Math.min(
                                yOpen,
                                yClose
                            );

                        const bodyHeight =
                            Math.max(
                                1,
                                Math.abs(
                                    yClose -
                                    yOpen
                                )
                            );

                        ctx.fillStyle =
                            bullish
                                ? "#22c55e"
                                : "#ef4444";

                        ctx.fillRect(
                            x -
                            candleWidth /
                            2,
                            bodyTop,
                            candleWidth,
                            bodyHeight
                        );

                    }
                );


                /* =====================================================
   SUPPORT
===================================================== */

                drawHorizontalLevel(
                    sr.support,
                    "#19d39b",
                    "Support"
                );


                /* =====================================================
                   RESISTANCE
                ===================================================== */

                drawHorizontalLevel(
                    sr.resistance,
                    "#ff6572",
                    "Resistance"
                );


                /* =====================================================
   EXTENDED OVERLAY INDICATORS
===================================================== */

                const extendedColors = [
                    "#5caeff",
                    "#ffc857",
                    "#d58cff",
                    "#19d39b",
                    "#ff6572",
                    "#f5a3ff"
                ];

                extendedIndicators.forEach(
                    (
                        item,
                        indicatorIndex
                    ) => {

                        const series =
                            item.calculation?.series;

                        if (
                            !Array.isArray(series)
                        ) {
                            return;
                        }

                        series.forEach(
                            (
                                currentSeries,
                                seriesIndex
                            ) => {

                                const values =
                                    currentSeries.values;

                                if (
                                    !Array.isArray(values)
                                ) {
                                    return;
                                }

                                ctx.strokeStyle =
                                    extendedColors[
                                    seriesIndex %
                                    extendedColors.length
                                    ];

                                ctx.lineWidth =
                                    1.5;

                                ctx.beginPath();

                                let started =
                                    false;

                                for (
                                    let index =
                                        startIndex;
                                    index <
                                    endIndex;
                                    index++
                                ) {

                                    const value =
                                        Number(
                                            values[index]
                                        );

                                    if (
                                        !Number.isFinite(
                                            value
                                        )
                                    ) {

                                        started =
                                            false;

                                        continue;
                                    }

                                    const localIndex =
                                        index -
                                        startIndex;

                                    const x =
                                        left +
                                        (
                                            localIndex +
                                            0.5
                                        ) *
                                        slotWidth;

                                    const y =
                                        priceToY(
                                            value
                                        );

                                    if (
                                        !Number.isFinite(y)
                                    ) {
                                        continue;
                                    }

                                    if (
                                        !started
                                    ) {

                                        ctx.moveTo(
                                            x,
                                            y
                                        );

                                        started =
                                            true;

                                    } else {

                                        ctx.lineTo(
                                            x,
                                            y
                                        );

                                    }

                                }

                                if (
                                    started
                                ) {
                                    ctx.stroke();
                                }

                                /* =====================================================
   LATEST VALUE BOX
===================================================== */

                                if (
                                    shouldShowChartValueBox(
                                        item.name
                                    )
                                ) {

                                    const latestValue =
                                        [...values]
                                            .slice(
                                                0,
                                                endIndex
                                            )
                                            .reverse()
                                            .find(
                                                value =>
                                                    Number.isFinite(
                                                        Number(value)
                                                    )
                                            );

                                    if (
                                        Number.isFinite(
                                            Number(latestValue)
                                        )
                                    ) {

                                        drawIndicatorValueBox(
                                            latestValue,
                                            priceToY(
                                                Number(
                                                    latestValue
                                                )
                                            ),
                                            extendedColors[
                                            seriesIndex %
                                            extendedColors.length
                                            ],
                                            currentSeries.name ||
                                            item.name
                                        );

                                    }

                                }

                            }
                        );

                    }
                );


                /* =====================================================
                   INDICATOR PANEL
                ===================================================== */

                if (
                    hasPanelIndicator
                ) {

                    const panelTop =
                        height -
                        indicatorPanelHeight -
                        8;

                    const panelBottom =
                        height -
                        8;

                    ctx.save();

                    ctx.fillStyle =
                        "#0b1220";

                    ctx.fillRect(
                        left,
                        panelTop,
                        plotWidth,
                        indicatorPanelHeight
                    );

                    ctx.strokeStyle =
                        "#31527e";

                    ctx.lineWidth =
                        1;

                    ctx.beginPath();

                    ctx.moveTo(
                        left,
                        panelTop
                    );

                    ctx.lineTo(
                        right,
                        panelTop
                    );

                    ctx.stroke();


                    /* =================================================
                       GENERIC PANEL INDICATORS
                    ================================================= */

                    const panelIndicators = [];

                    selectedIndicators.forEach(
                        name => {

                            if (
                                name === "EMA" ||
                                name === "VWAP" ||
                                name === "RSI" ||
                                name === "ADX" ||
                                name === "MACD"
                            ) {
                                return;
                            }

                            const calculation =
                                resolveExtendedIndicator(
                                    name,
                                    indicatorCandles
                                );

                            if (
                                calculation?.panel ===
                                "panel"
                            ) {

                                panelIndicators.push({
                                    name,
                                    calculation
                                });

                            }

                        }
                    );


                    panelIndicators.forEach(
                        (
                            item,
                            itemIndex
                        ) => {

                            item.calculation.series.forEach(
                                (
                                    currentSeries,
                                    seriesIndex
                                ) => {

                                    const values =
                                        currentSeries.values.slice(
                                            startIndex,
                                            endIndex
                                        );

                                    const numericValues =
                                        values
                                            .map(Number)
                                            .filter(Number.isFinite);

                                    if (
                                        !numericValues.length
                                    ) {
                                        return;
                                    }

                                    let min =
                                        Math.min(
                                            ...numericValues
                                        );

                                    let max =
                                        Math.max(
                                            ...numericValues
                                        );

                                    if (
                                        min === max
                                    ) {
                                        min -= 1;
                                        max += 1;
                                    }

                                    const padding =
                                        (
                                            max -
                                            min
                                        ) * 0.08;

                                    min -= padding;
                                    max += padding;

                                    const color =
                                        extendedColors[
                                        (
                                            itemIndex +
                                            seriesIndex
                                        ) %
                                        extendedColors.length
                                        ];

                                    ctx.strokeStyle =
                                        color;

                                    ctx.lineWidth =
                                        1.4;

                                    ctx.beginPath();

                                    let started =
                                        false;

                                    values.forEach(
                                        (
                                            value,
                                            index
                                        ) => {

                                            const numberValue =
                                                Number(value);

                                            if (
                                                !Number.isFinite(
                                                    numberValue
                                                )
                                            ) {
                                                started = false;
                                                return;
                                            }

                                            const x =
                                                left +
                                                (
                                                    index +
                                                    0.5
                                                ) *
                                                slotWidth;

                                            const y =
                                                panelTop +
                                                (
                                                    (
                                                        max -
                                                        numberValue
                                                    ) /
                                                    (
                                                        max -
                                                        min
                                                    )
                                                ) *
                                                indicatorPanelHeight;

                                            if (!started) {
                                                ctx.moveTo(x, y);
                                                started = true;
                                            } else {
                                                ctx.lineTo(x, y);
                                            }

                                        }
                                    );

                                    if (started) {
                                        ctx.stroke();
                                    }

                                    /* Only show this box when the same
                                       value is NOT already in a top card. */
                                    if (
                                        shouldShowChartValueBox(
                                            item.name
                                        )
                                    ) {

                                        const latestValue =
                                            [...currentSeries.values]
                                                .slice(
                                                    0,
                                                    endIndex
                                                )
                                                .reverse()
                                                .find(
                                                    value =>
                                                        Number.isFinite(
                                                            Number(value)
                                                        )
                                                );

                                        if (
                                            Number.isFinite(
                                                Number(latestValue)
                                            )
                                        ) {

                                            const latestY =
                                                panelTop +
                                                (
                                                    (
                                                        max -
                                                        Number(
                                                            latestValue
                                                        )
                                                    ) /
                                                    (
                                                        max -
                                                        min
                                                    )
                                                ) *
                                                indicatorPanelHeight;

                                            drawIndicatorValueBox(
                                                latestValue,
                                                latestY,
                                                color,
                                                currentSeries.name ||
                                                item.name,
                                                panelTop + 2,
                                                panelBottom - 2
                                            );

                                        }

                                    }

                                }
                            );

                        }
                    );


                    /* =================================================
                       NORMALIZED OSCILLATOR HELPER
                       RSI / ADX / DI are 0-100.
                    ================================================= */

                    function drawOscillatorSeries(
                        values,
                        color,
                        minValue,
                        maxValue
                    ) {

                        const visible =
                            values.slice(
                                startIndex,
                                endIndex
                            );

                        ctx.strokeStyle =
                            color;

                        ctx.lineWidth =
                            1.5;

                        ctx.beginPath();

                        let started =
                            false;

                        visible.forEach(
                            (
                                value,
                                i
                            ) => {

                                if (
                                    !Number.isFinite(
                                        Number(value)
                                    )
                                ) {
                                    return;
                                }

                                const normalized =
                                    (
                                        maxValue -
                                        Number(value)
                                    ) /
                                    (
                                        maxValue -
                                        minValue
                                    );

                                const py =
                                    panelTop +
                                    normalized *
                                    indicatorPanelHeight;

                                const xx =
                                    left +
                                    (
                                        i +
                                        0.5
                                    ) *
                                    slotWidth;

                                if (!started) {
                                    ctx.moveTo(xx, py);
                                    started = true;
                                } else {
                                    ctx.lineTo(xx, py);
                                }

                            }
                        );

                        if (started) {
                            ctx.stroke();
                        }
                    }


                    /* =================================================
                       RSI - EXACT OLD CHART LOGIC
                    ================================================= */

                    if (
                        selectedIndicators.has("RSI")
                    ) {

                        const rsi =
                            rsiSeries(
                                indicatorCandles,
                                14
                            );

                        drawOscillatorSeries(
                            rsi,
                            "#d58cff",
                            0,
                            100
                        );

                        if (
                            shouldShowChartValueBox(
                                "RSI"
                            )
                        ) {

                            const latestRSI =
                                [...rsi]
                                    .slice(
                                        0,
                                        endIndex
                                    )
                                    .reverse()
                                    .find(
                                        value =>
                                            Number.isFinite(
                                                Number(value)
                                            )
                                    );

                            if (
                                Number.isFinite(
                                    Number(latestRSI)
                                )
                            ) {

                                const rsiY =
                                    panelTop +
                                    (
                                        (
                                            100 -
                                            Number(
                                                latestRSI
                                            )
                                        ) /
                                        100
                                    ) *
                                    indicatorPanelHeight;

                                drawIndicatorValueBox(
                                    latestRSI,
                                    rsiY,
                                    "#d58cff",
                                    "RSI 14",
                                    panelTop + 2,
                                    panelBottom - 2
                                );

                            }
                        }

                        const rsi70 =
                            panelTop +
                            ((100 - 70) / 100) *
                            indicatorPanelHeight;

                        const rsi30 =
                            panelTop +
                            ((100 - 30) / 100) *
                            indicatorPanelHeight;

                        ctx.setLineDash([5, 4]);

                        ctx.strokeStyle =
                            "#ff6572";

                        ctx.beginPath();
                        ctx.moveTo(left, rsi70);
                        ctx.lineTo(right, rsi70);
                        ctx.stroke();

                        ctx.strokeStyle =
                            "#19d39b";

                        ctx.beginPath();
                        ctx.moveTo(left, rsi30);
                        ctx.lineTo(right, rsi30);
                        ctx.stroke();

                        ctx.setLineDash([]);
                    }


                    /* =================================================
                       ADX / +DI / -DI - EXACT OLD CHART LOGIC
                    ================================================= */

                    if (
                        selectedIndicators.has("ADX")
                    ) {

                        const adx =
                            adxSeries(
                                indicatorCandles
                            );

                        drawOscillatorSeries(
                            adx.adx,
                            "#ffc857",
                            0,
                            100
                        );

                        drawOscillatorSeries(
                            adx.plus,
                            "#19d39b",
                            0,
                            100
                        );

                        drawOscillatorSeries(
                            adx.minus,
                            "#ff6572",
                            0,
                            100
                        );

                        /* ADX card already has ADX/+DI/-DI values when
                           available. Therefore boxes are shown only if
                           the corresponding card value is missing. */

                        const adxValues = [
                            {
                                value:
                                    [...adx.adx]
                                        .slice(0, endIndex)
                                        .reverse()
                                        .find(
                                            value =>
                                                Number.isFinite(
                                                    Number(value)
                                                )
                                        ),
                                color: "#ffc857",
                                label: "ADX",
                                cardKey: "ADX"
                            },
                            {
                                value:
                                    [...adx.plus]
                                        .slice(0, endIndex)
                                        .reverse()
                                        .find(
                                            value =>
                                                Number.isFinite(
                                                    Number(value)
                                                )
                                        ),
                                color: "#19d39b",
                                label: "+DI",
                                cardKey: "ADX"
                            },
                            {
                                value:
                                    [...adx.minus]
                                        .slice(0, endIndex)
                                        .reverse()
                                        .find(
                                            value =>
                                                Number.isFinite(
                                                    Number(value)
                                                )
                                        ),
                                color: "#ff6572",
                                label: "-DI",
                                cardKey: "ADX"
                            }
                        ];

                        const adxBoxes =
                            adxValues
                                .filter(
                                    item =>
                                        shouldShowChartValueBox(
                                            item.cardKey
                                        ) &&
                                        Number.isFinite(
                                            Number(item.value)
                                        )
                                )
                                .map(
                                    item => ({
                                        ...item,
                                        y:
                                            panelTop +
                                            (
                                                (
                                                    100 -
                                                    Number(item.value)
                                                ) /
                                                100
                                            ) *
                                            indicatorPanelHeight
                                    })
                                )
                                .sort(
                                    (a, b) =>
                                        a.y - b.y
                                );

                        const minimumGap =
                            20;

                        for (
                            let i = 1;
                            i < adxBoxes.length;
                            i++
                        ) {

                            if (
                                adxBoxes[i].y -
                                adxBoxes[i - 1].y <
                                minimumGap
                            ) {

                                adxBoxes[i].y =
                                    adxBoxes[i - 1].y +
                                    minimumGap;
                            }
                        }

                        adxBoxes.forEach(
                            item => {

                                drawIndicatorValueBox(
                                    item.value,
                                    item.y,
                                    item.color,
                                    item.label,
                                    panelTop + 2,
                                    panelBottom - 2
                                );

                            }
                        );
                    }


                    /* =================================================
                       MACD - EXACT PANEL BEHAVIOUR
                    ================================================= */

                    if (
                        selectedIndicators.has("MACD")
                    ) {

                        const macd =
                            macdSeries(
                                indicatorCandles
                            );

                        const visibleMACD =
                            macd.macd.slice(
                                startIndex,
                                endIndex
                            );

                        const visibleSignal =
                            macd.signal.slice(
                                startIndex,
                                endIndex
                            );

                        const combined = [
                            ...visibleMACD.filter(
                                Number.isFinite
                            ),
                            ...visibleSignal.filter(
                                Number.isFinite
                            )
                        ];

                        if (
                            combined.length
                        ) {

                            let macdMin =
                                Math.min(...combined);

                            let macdMax =
                                Math.max(...combined);

                            if (
                                macdMin ===
                                macdMax
                            ) {
                                macdMin -= 1;
                                macdMax += 1;
                            }

                            const macdRange =
                                macdMax -
                                macdMin;

                            const mapMACD =
                                value =>
                                    panelTop +
                                    (
                                        (
                                            macdMax -
                                            value
                                        ) /
                                        macdRange
                                    ) *
                                    indicatorPanelHeight;

                            const drawMACDLine =
                                (
                                    values,
                                    color
                                ) => {

                                    ctx.strokeStyle =
                                        color;

                                    ctx.lineWidth =
                                        1.5;

                                    ctx.beginPath();

                                    let started =
                                        false;

                                    values.forEach(
                                        (
                                            value,
                                            index
                                        ) => {

                                            if (
                                                !Number.isFinite(
                                                    Number(value)
                                                )
                                            ) {
                                                return;
                                            }

                                            const x =
                                                left +
                                                (
                                                    index +
                                                    0.5
                                                ) *
                                                slotWidth;

                                            const y =
                                                mapMACD(
                                                    Number(value)
                                                );

                                            if (!started) {
                                                ctx.moveTo(x, y);
                                                started = true;
                                            } else {
                                                ctx.lineTo(x, y);
                                            }
                                        }
                                    );

                                    if (started) {
                                        ctx.stroke();
                                    }
                                };

                            drawMACDLine(
                                visibleMACD,
                                "#5caeff"
                            );

                            drawMACDLine(
                                visibleSignal,
                                "#ffc857"
                            );

                            const latestMACD =
                                [...macd.macd]
                                    .slice(0, endIndex)
                                    .reverse()
                                    .find(
                                        value =>
                                            Number.isFinite(
                                                Number(value)
                                            )
                                    );

                            const latestSignal =
                                [...macd.signal]
                                    .slice(0, endIndex)
                                    .reverse()
                                    .find(
                                        value =>
                                            Number.isFinite(
                                                Number(value)
                                            )
                                    );

                            if (
                                shouldShowChartValueBox(
                                    "MACD"
                                )
                            ) {

                                const macdBoxes = [];

                                if (
                                    Number.isFinite(
                                        Number(latestMACD)
                                    )
                                ) {
                                    macdBoxes.push({
                                        value: Number(latestMACD),
                                        color: "#5caeff",
                                        label: "MACD",
                                        y: mapMACD(
                                            Number(latestMACD)
                                        )
                                    });
                                }

                                if (
                                    Number.isFinite(
                                        Number(latestSignal)
                                    )
                                ) {
                                    macdBoxes.push({
                                        value: Number(latestSignal),
                                        color: "#ffc857",
                                        label: "Signal",
                                        y: mapMACD(
                                            Number(latestSignal)
                                        )
                                    });
                                }

                                macdBoxes.sort(
                                    (a, b) =>
                                        a.y - b.y
                                );

                                for (
                                    let i = 1;
                                    i < macdBoxes.length;
                                    i++
                                ) {
                                    if (
                                        macdBoxes[i].y -
                                        macdBoxes[i - 1].y <
                                        20
                                    ) {
                                        macdBoxes[i].y =
                                            macdBoxes[i - 1].y +
                                            20;
                                    }
                                }

                                macdBoxes.forEach(
                                    item =>
                                        drawIndicatorValueBox(
                                            item.value,
                                            item.y,
                                            item.color,
                                            item.label,
                                            panelTop + 2,
                                            panelBottom - 2
                                        )
                                );
                            }

                            const zeroY =
                                mapMACD(0);

                            ctx.strokeStyle =
                                "#7189aa";

                            ctx.setLineDash([5, 4]);

                            ctx.beginPath();
                            ctx.moveTo(left, zeroY);
                            ctx.lineTo(right, zeroY);
                            ctx.stroke();

                            ctx.setLineDash([]);
                        }
                    }


                    /* =================================================
                       PANEL TITLE
                    ================================================= */

                    ctx.font =
                        "bold 10px Arial";

                    ctx.fillStyle =
                        "#dbe8f8";

                    ctx.textAlign =
                        "left";

                    const panelNames = [];

                    if (
                        selectedIndicators.has("RSI")
                    ) {
                        panelNames.push("RSI 14");
                    }

                    if (
                        selectedIndicators.has("MACD")
                    ) {
                        panelNames.push("MACD 12/26/9");
                    }

                    if (
                        selectedIndicators.has("ADX")
                    ) {
                        panelNames.push("ADX / +DI / -DI");
                    }

                    panelIndicators.forEach(
                        item => {
                            panelNames.push(
                                item.name
                            );
                        }
                    );

                    ctx.fillText(
                        panelNames.join(" • "),
                        left + 6,
                        panelTop + 13
                    );

                    ctx.restore();
                }

                /* =====================================================
                   INDICATOR LINE HELPER
                ===================================================== */

                const drawSeries =
                    (
                        values,
                        lineWidth = 1.5
                    ) => {

                        if (
                            !Array.isArray(values)
                        ) {
                            return;
                        }

                        ctx.lineWidth =
                            lineWidth;

                        ctx.beginPath();

                        let started = false;

                        for (
                            let index = startIndex;
                            index < endIndex;
                            index++
                        ) {

                            /* =========================================
                               IMPORTANT:
                               Check the ORIGINAL value BEFORE Number()
                
                               Number(null) = 0
                               which was causing the huge vertical
                               VWAP lines.
                            ========================================= */

                            const rawValue =
                                values[index];

                            if (
                                rawValue === null ||
                                rawValue === undefined ||
                                rawValue === ""
                            ) {

                                started = false;

                                continue;
                            }

                            const value =
                                Number(rawValue);

                            if (
                                !Number.isFinite(value)
                            ) {

                                started = false;

                                continue;
                            }

                            const localIndex =
                                index -
                                startIndex;

                            const x =
                                left +
                                (
                                    localIndex +
                                    0.5
                                ) *
                                slotWidth;

                            const y =
                                priceToY(value);

                            if (
                                !Number.isFinite(y)
                            ) {

                                started = false;

                                continue;
                            }

                            if (
                                !started
                            ) {

                                ctx.moveTo(
                                    x,
                                    y
                                );

                                started = true;

                            } else {

                                ctx.lineTo(
                                    x,
                                    y
                                );

                            }
                        }

                        if (
                            started
                        ) {
                            ctx.stroke();
                        }
                    };


                /* =====================================================
                   EMA
                ===================================================== */
                /* =====================================================
                   EMA SERIES
                ===================================================== */

                /* =====================================================
   EMA SERIES
===================================================== */

                function emaSeries(
                    arr,
                    length
                ) {

                    if (
                        !Array.isArray(arr) ||
                        !arr.length
                    ) {
                        return [];
                    }

                    const closes =
                        arr.map(
                            candle =>
                                Number(candle.c)
                        );

                    const alpha =
                        2 /
                        (length + 1);

                    let previous =
                        closes[0];

                    const values = [
                        previous
                    ];

                    for (
                        let i = 1;
                        i < closes.length;
                        i++
                    ) {

                        const value =
                            closes[i];

                        if (
                            !Number.isFinite(value)
                        ) {
                            values.push(
                                previous
                            );

                            continue;
                        }

                        previous =
                            value * alpha +
                            previous *
                            (1 - alpha);

                        values.push(
                            previous
                        );
                    }

                    return values;
                }


                /* =====================================================
                   DRAW EMA9 / EMA21
                ===================================================== */

                if (
                    selectedIndicators.has(
                        "EMA"
                    )
                ) {

                    /*
                     * Calculate from ALL candles.
                     * Then draw only the visible portion.
                     */

                    const ema9 =
                        emaSeries(
                            indicatorCandles,
                            9
                        );

                    const ema21 =
                        emaSeries(
                            indicatorCandles,
                            21
                        );


                    /* =================================================
                       EMA 9
                    ================================================= */

                    ctx.strokeStyle =
                        "#5caeff";

                    drawSeries(
                        ema9,
                        1.8
                    );


                    /* =================================================
                       EMA 21
                    ================================================= */

                    ctx.strokeStyle =
                        "#ffc857";

                    drawSeries(
                        ema21,
                        1.8
                    );
                }


                /* =====================================================
   VWAP SERIES
   SESSION VWAP

   VWAP =
       Σ(Typical Price × Volume)
       -------------------------
              Σ Volume

   Typical Price =
       (High + Low + Close) / 3

   The calculation is performed separately
   for every trading day.
===================================================== */

                if (
                    selectedIndicators.has("VWAP")
                ) {

                    const vwapValues =
                        new Array(
                            indicatorCandles.length
                        ).fill(null);

                    let sessionDate = null;

                    let cumulativePV = 0;
                    let cumulativeVolume = 0;

                    for (
                        let index = 0;
                        index < indicatorCandles.length;
                        index++
                    ) {

                        const candle =
                            indicatorCandles[index];

                        if (!candle) {
                            continue;
                        }

                        /* =========================================
                           TIME
                        ========================================= */

                        const timeString =
                            String(
                                candle.time ?? ""
                            );

                        const date =
                            timeString.slice(
                                0,
                                10
                            );

                        const time =
                            timeString.slice(
                                11,
                                16
                            );

                        if (
                            !date ||
                            !time
                        ) {
                            continue;
                        }

                        /* =========================================
                           NEW SESSION
                        ========================================= */

                        if (
                            date !== sessionDate
                        ) {

                            sessionDate =
                                date;

                            cumulativePV =
                                0;

                            cumulativeVolume =
                                0;
                        }

                        /* =========================================
                           ONLY NSE REGULAR SESSION
                        ========================================= */

                        if (
                            time < "09:15" ||
                            time > "15:30"
                        ) {
                            continue;
                        }

                        /* =========================================
                           OHLCV
                        ========================================= */

                        const high =
                            Number(candle.h);

                        const low =
                            Number(candle.l);

                        const close =
                            Number(candle.c);

                        const volume =
                            Number(candle.v);

                        if (
                            !Number.isFinite(high) ||
                            !Number.isFinite(low) ||
                            !Number.isFinite(close) ||
                            !Number.isFinite(volume) ||
                            volume <= 0
                        ) {
                            continue;
                        }

                        /* =========================================
                           TYPICAL PRICE
                        ========================================= */

                        const typicalPrice =
                            (
                                high +
                                low +
                                close
                            ) / 3;

                        /* =========================================
                           CUMULATIVE VALUES
                        ========================================= */

                        cumulativePV +=
                            typicalPrice *
                            volume;

                        cumulativeVolume +=
                            volume;

                        /* =========================================
                           VWAP
                        ========================================= */

                        vwapValues[index] =
                            cumulativePV /
                            cumulativeVolume;
                    }

                    /* =============================================
                   DRAW VWAP SESSION BY SESSION
                
                   Important:
                   Do NOT draw across a trading-day boundary.
                
                   Each day's VWAP is one continuous curve.
                ============================================= */

                    ctx.strokeStyle =
                        "#ffffff";

                    ctx.lineWidth =
                        2.2;

                    ctx.beginPath();

                    let vwapStarted =
                        false;

                    let previousVWAPDate =
                        null;

                    for (
                        let index = startIndex;
                        index < endIndex;
                        index++
                    ) {

                        const value =
                            vwapValues[index];

                        /* -----------------------------------------
                           Invalid / missing VWAP
                        ----------------------------------------- */

                        if (
                            value === null ||
                            value === undefined ||
                            !Number.isFinite(
                                Number(value)
                            )
                        ) {

                            vwapStarted =
                                false;

                            previousVWAPDate =
                                null;

                            continue;
                        }

                        const candle =
                            indicatorCandles[index];

                        if (!candle) {
                            continue;
                        }

                        /* -----------------------------------------
                           Get candle date
                        ----------------------------------------- */

                        const timeString =
                            String(
                                candle.time ?? ""
                            );

                        const currentDate =
                            timeString.slice(
                                0,
                                10
                            );

                        if (!currentDate) {

                            vwapStarted =
                                false;

                            previousVWAPDate =
                                null;

                            continue;
                        }

                        /* -----------------------------------------
                           NEVER CONNECT TWO DIFFERENT DAYS
                        ----------------------------------------- */

                        if (
                            previousVWAPDate !== null &&
                            currentDate !==
                            previousVWAPDate
                        ) {

                            vwapStarted =
                                false;
                        }

                        previousVWAPDate =
                            currentDate;

                        /* -----------------------------------------
                           X POSITION
                        ----------------------------------------- */

                        const localIndex =
                            index -
                            startIndex;

                        const x =
                            left +
                            (
                                localIndex +
                                0.5
                            ) *
                            slotWidth;

                        /* -----------------------------------------
                           Y POSITION
                        ----------------------------------------- */

                        const y =
                            priceToY(
                                Number(value)
                            );

                        if (
                            !Number.isFinite(y)
                        ) {

                            vwapStarted =
                                false;

                            continue;
                        }

                        /* -----------------------------------------
                           DRAW
                        ----------------------------------------- */

                        if (
                            !vwapStarted
                        ) {

                            ctx.moveTo(
                                x,
                                y
                            );

                            vwapStarted =
                                true;

                        } else {

                            ctx.lineTo(
                                x,
                                y
                            );

                        }
                    }

                    ctx.stroke();
                }


                /* =====================================================
                   CURRENT PRICE
                ===================================================== */

                // const lastCandle =
                //     visibleCandles[
                //     visibleCandles.length -
                //     1
                //     ];

                // if (
                //     lastCandle
                // ) {

                //     const currentPrice =
                //         Number(
                //             lastCandle.c
                //         );

                //     if (
                //         Number.isFinite(
                //             currentPrice
                //         )
                //     ) {

                //         const y =
                //             priceToY(
                //                 currentPrice
                //             );

                //         ctx.setLineDash(
                //             [
                //                 4,
                //                 4
                //             ]
                //         );

                //         ctx.strokeStyle =
                //             "rgba(255,255,255,0.25)";

                //         ctx.beginPath();

                //         ctx.moveTo(
                //             left,
                //             y
                //         );

                //         ctx.lineTo(
                //             right,
                //             y
                //         );

                //         ctx.stroke();

                //         ctx.setLineDash(
                //             []
                //         );

                //     }

                // }




            },
            [
                candles,
                candleMode,
                chartVisibleCount,
                chartEndIndex,
                chartPriceScaleManual,
                chartPriceScaleMin,
                chartPriceScaleMax,
                selectedIndicators,
                dashboardData,
                mtfRSI,
                analysisCardHasValue,
                updateGlobalPriceScale
            ]
        );


    /* =========================================================
       STORE DRAW FUNCTION
    ========================================================= */

    useEffect(
        () => {

            drawChartRef.current =
                drawChart;

        },
        [
            drawChart
        ]
    );

    /* =========================================================
   NATIVE CHART WHEEL HANDLER

   Prevent browser/page zoom.

   Trackpad pinch / Ctrl + wheel:
   → chart zoom only

   Normal horizontal wheel:
   → chart pan only
========================================================= */

    useEffect(
    () => {

        const canvas =
            canvasRef.current;

        if (
            !canvas
        ) {
            return;
        }

        const handleNativeWheel =
            event => {

                /*
                 * The chart owns the wheel gesture.
                 *
                 * This prevents Chrome from:
                 * - going Back / Forward
                 * - scrolling the page
                 * - zooming the entire browser
                 */

                event.preventDefault();

            };

        canvas.addEventListener(
            "wheel",
            handleNativeWheel,
            {
                passive: false
            }
        );

        /*
         * Prevent browser overscroll/history navigation
         * while interacting with the chart.
         */
        canvas.style.overscrollBehavior =
            "contain";

        return () => {

            canvas.removeEventListener(
                "wheel",
                handleNativeWheel
            );

        };

    },
    []
);

    /* =========================================================
       DRAW WHEN CHART DATA CHANGES
    ========================================================= */

    useEffect(
        () => {

            drawChart();

        },
        [
            drawChart
        ]
    );


    /* =========================================================
       RESIZE
    ========================================================= */

    useEffect(
        () => {

            const handleResize =
                () => {

                    drawChart();

                };

            window.addEventListener(
                "resize",
                handleResize
            );

            return () => {

                window.removeEventListener(
                    "resize",
                    handleResize
                );

            };

        },
        [
            drawChart
        ]
    );


    /* =========================================================
       RETURN
    ========================================================= */

    return {

        canvasRef,
        drawChart,

        candleMode,

        setCandleMode:
            changeCandleMode,

        chartVisibleCount,

        setChartVisibleCount,

        chartEndIndex,

        setChartEndIndex,

        chartFollowLatest,

        setChartFollowLatest,

        selectedIndicators,

        setSelectedIndicators:
            setIndicators,

        toggleIndicator,

        chartDragging,

        chartPriceScaleManual,

        chartPriceScaleMin,

        chartPriceScaleMax,

        chartIndicatorStatus,

        setChartIndicatorStatus,

        drawChartRef,

        handleMouseDown,

        handleMouseMove,

        handleMouseUp,

        handleMouseLeave,

        handleWheel,

        handleDoubleClick,

        handleTouchStart,

        handleTouchMove,

        handleTouchEnd,

        resetPriceScale,

        resetChartPosition
    };
}


export default useChart;