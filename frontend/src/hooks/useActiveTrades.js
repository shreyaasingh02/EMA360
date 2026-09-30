import {
    useCallback,
    useEffect,
    useState
} from "react";


const EMPTY_TRADE = {
    stock: null,
    quantity: 10,
    entry: null,
    stopLoss: null,
    target1: null,
    target2: null,
    target3: null,
    amount: null
};


function createEmptyTrades() {

    return [
        { ...EMPTY_TRADE },
        { ...EMPTY_TRADE },
        { ...EMPTY_TRADE }
    ];

}


function loadActiveTrades() {

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(
                    "ema360_activeTrades"
                ) || "null"
            );

        if (
            Array.isArray(saved) &&
            saved.length === 3
        ) {

            return saved;

        }

    } catch (error) {

        console.error(
            "Failed to load active trades:",
            error
        );

    }

    return createEmptyTrades();

}


function loadTradeHistory() {

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(
                    "ema360_tradeHistory"
                ) || "[]"
            );

        return Array.isArray(saved)
            ? saved
            : [];

    } catch (error) {

        console.error(
            "Failed to load trade history:",
            error
        );

        return [];

    }

}


function useActiveTrades({
    selectedStock,
    stockData,
    currentTF
}) {

    const [
        activeTrades,
        setActiveTrades
    ] = useState(
        loadActiveTrades
    );


    const [
        tradeHistory,
        setTradeHistory
    ] = useState(
        loadTradeHistory
    );


    const [
        activeTradeSelectedRow,
        setActiveTradeSelectedRow
    ] = useState(0);



    const [
        emergencyCleared,
        setEmergencyCleared
    ] = useState(false);
    /*
     * =========================================================
     * ROW 1 ALWAYS = CURRENT DASHBOARD STOCK
     * =========================================================
     */

    useEffect(() => {

        if (!selectedStock) {
            return;
        }


        /*
         * After Emergency Sell, keep the active
         * table completely empty.
         */
        if (emergencyCleared) {
            return;
        }


        setActiveTrades(
            previous => {

                const next = [
                    ...previous
                ];


                while (
                    next.length < 3
                ) {

                    next.push({
                        ...EMPTY_TRADE
                    });

                }


                next[0] = {
                    ...next[0],
                    stock: selectedStock
                };


                return next.slice(0, 3);

            }
        );

    }, [
        selectedStock,
        emergencyCleared
    ]);


    /*
     * =========================================================
     * SAVE ACTIVE TRADES
     * =========================================================
     */

    useEffect(() => {

        localStorage.setItem(
            "ema360_activeTrades",
            JSON.stringify(
                activeTrades
            )
        );

    }, [activeTrades]);


    /*
     * =========================================================
     * SAVE HISTORY
     * =========================================================
     */

    useEffect(() => {

        localStorage.setItem(
            "ema360_tradeHistory",
            JSON.stringify(
                tradeHistory
            )
        );

    }, [tradeHistory]);


    /*
     * =========================================================
     * HISTORY EXIT PRICE
     * =========================================================
     */

    function getHistoryExitPrice(
        stock
    ) {

        const data =
            stockData?.[
            stock
            ]?.[
            currentTF
            ];


        if (
            !Array.isArray(data) ||
            !data.length
        ) {

            return null;

        }


        const latest =
            data[
            data.length - 1
            ];


        const price =
            Number(
                latest?.c
            );


        return Number.isFinite(price)
            ? price
            : null;

    }


    /*
     * =========================================================
     * MOVE TRADE TO HISTORY
     * =========================================================
     */

    const moveTradeToHistory =
        useCallback(
            trade => {

                if (
                    !trade ||
                    !trade.stock ||
                    trade.entry === null
                ) {

                    return;

                }


                const exitPrice =
                    getHistoryExitPrice(
                        trade.stock
                    );


                let pnl = null;


                if (
                    Number.isFinite(
                        exitPrice
                    ) &&
                    Number.isFinite(
                        Number(
                            trade.entry
                        )
                    )
                ) {

                    pnl =
                        (
                            exitPrice -
                            Number(
                                trade.entry
                            )
                        ) *
                        Number(
                            trade.quantity || 0
                        );

                }


                const historyTrade = {

                    stock:
                        trade.stock,

                    quantity:
                        Number(
                            trade.quantity
                        ) || 0,

                    entry:
                        Number(
                            trade.entry
                        ),

                    stopLoss:
                        Number(
                            trade.stopLoss
                        ),

                    target1:
                        Number(
                            trade.target1
                        ),

                    target2:
                        Number(
                            trade.target2
                        ),

                    target3:
                        Number(
                            trade.target3
                        ),

                    exit:
                        Number.isFinite(
                            exitPrice
                        )
                            ? exitPrice
                            : null,

                    amount:
                        Number(
                            trade.amount
                        ) || 0,

                    pnl,

                    time:
                        new Date().toLocaleString(
                            "en-IN",
                            {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit"
                            }
                        )

                };


                setTradeHistory(
                    previous => [
                        historyTrade,
                        ...previous
                    ].slice(0, 20)
                );

            },
            [
                stockData,
                currentTF
            ]
        );


    /*
     * =========================================================
     * APPLY ACTIVE TRADE
     * =========================================================
     */

    const applyActiveTrade =
        useCallback(
            ({
                stock,
                quantity,
                entry,
                stopLossPoints,
                target1Points,
                target2Points
            }) => {

                const cleanStock =
                    String(
                        stock || ""
                    ).trim();


                const qty =
                    Number(quantity);


                const entryPrice =
                    Number(entry);


                const slPoints =
                    Number(
                        stopLossPoints
                    );


                const t1Points =
                    Number(
                        target1Points
                    );


                const t2Points =
                    Number(
                        target2Points
                    );


                /*
                 * =================================================
                 * VALIDATION
                 * =================================================
                 */

                if (!cleanStock) {

                    alert(
                        "Please select a stock."
                    );

                    return false;

                }


                if (
                    !Number.isFinite(
                        entryPrice
                    ) ||
                    entryPrice <= 0
                ) {

                    alert(
                        "Please enter a valid Entry Price."
                    );

                    return false;

                }


                if (
                    !Number.isFinite(qty) ||
                    qty <= 0
                ) {

                    alert(
                        "Please enter a valid Quantity."
                    );

                    return false;

                }


                if (
                    !Number.isFinite(
                        slPoints
                    ) ||
                    slPoints <= 0
                ) {

                    alert(
                        "Please enter valid Stop Loss points."
                    );

                    return false;

                }


                if (
                    !Number.isFinite(
                        t1Points
                    ) ||
                    t1Points <= 0
                ) {

                    alert(
                        "Please enter valid Target 1 points."
                    );

                    return false;

                }


                if (
                    !Number.isFinite(
                        t2Points
                    ) ||
                    t2Points <= 0
                ) {

                    alert(
                        "Please enter valid Target 2 points."
                    );

                    return false;

                }


                /*
                 * =================================================
                 * CREATE TRADE
                 *
                 * SAME CALCULATION AS OLD CODE
                 * =================================================
                 */

                const trade = {

                    stock:
                        cleanStock,

                    quantity:
                        qty,

                    entry:
                        entryPrice,

                    stopLoss:
                        entryPrice -
                        slPoints,

                    target1:
                        entryPrice +
                        t1Points,

                    target2:
                        entryPrice +
                        t1Points +
                        t2Points,

                    target3:
                        entryPrice +
                        t1Points +
                        (t2Points * 2),

                    amount:
                        entryPrice * qty

                };


                setEmergencyCleared(false);

                /*
                 * =================================================
                 * UPDATE STATE
                 * =================================================
                 */

                setActiveTrades(
                    previous => {

                        const next = [
                            ...previous
                        ];


                        /*
                         * Ensure 3 rows.
                         */

                        while (
                            next.length < 3
                        ) {

                            next.push({
                                ...EMPTY_TRADE
                            });

                        }


                        /*
 * =================================================
 * ROW 1 EMPTY TRADE
 *
 * Row 1 may still display the current dashboard
 * stock after Emergency Sell, but that does NOT
 * mean Row 1 contains an active trade.
 *
 * If the selected stock is the current dashboard
 * stock and Row 1 has no entry, put the new trade
 * directly into Row 1.
 * =================================================
 */

                        const row1IsEmpty =
                            !next[0]?.entry ||
                            next[0].entry === null ||
                            next[0].entry === undefined;


                        if (
                            row1IsEmpty &&
                            cleanStock === selectedStock
                        ) {

                            next[0] = {
                                ...trade
                            };


                            setActiveTradeSelectedRow(
                                0
                            );


                            return next;

                        }


                        /*
                         * =================================================
                         * CHECK IF STOCK ALREADY HAS AN ACTIVE TRADE
                         * =================================================
                         *
                         * IMPORTANT:
                         * Check ENTRY also.
                         *
                         * A row containing only a stock name is NOT
                         * considered an active trade.
                         * =================================================
                         */

                        const existingRowIndex =
                            next.findIndex(
                                currentTrade =>
                                    currentTrade?.stock ===
                                    cleanStock &&
                                    currentTrade?.entry !== null &&
                                    currentTrade?.entry !== undefined
                            );


                        /*
                         * =================================================
                         * EXISTING ACTIVE STOCK
                         *
                         * Update that same row.
                         * =================================================
                         */

                        if (
                            existingRowIndex !== -1
                        ) {

                            next[
                                existingRowIndex
                            ] = {
                                ...trade
                            };


                            setActiveTradeSelectedRow(
                                existingRowIndex
                            );


                            return next;

                        }


                        /*
                         * =================================================
                         * EXISTING STOCK
                         *
                         * UPDATE THAT SAME ROW
                         * =================================================
                         */

                        if (
                            existingRowIndex !== -1
                        ) {

                            next[
                                existingRowIndex
                            ] = {
                                ...trade
                            };


                            setActiveTradeSelectedRow(
                                existingRowIndex
                            );


                            return next;

                        }


                        /*
                         * =================================================
                         * NEW STOCK
                         *
                         * ROW 3 → HISTORY
                         * ROW 2 → ROW 3
                         * NEW STOCK → ROW 2
                         *
                         * ROW 1 NEVER TOUCHED
                         * =================================================
                         */

                        const oldRow2 = next[1];
                        const oldRow3 = next[2];


                        /*
                         * =================================================
                         * CHECK WHETHER ROW 2 ACTUALLY HAS A TRADE
                         * =================================================
                         */

                        const row2HasTrade =
                            oldRow2?.stock &&
                            oldRow2.entry !== null &&
                            oldRow2.entry !== undefined;


                        /*
                         * =================================================
                         * ROW 2 IS EMPTY
                         *
                         * New stock goes directly into ROW 2.
                         * ROW 3 MUST NOT MOVE.
                         * =================================================
                         */

                        if (!row2HasTrade) {

                            next[1] = {
                                ...trade
                            };

                        }


                        /*
                         * =================================================
                         * ROW 2 HAS A TRADE
                         *
                         * ROW 3 → HISTORY
                         * ROW 2 → ROW 3
                         * NEW STOCK → ROW 2
                         * =================================================
                         */

                        else {

                            const row3HasTrade =
                                oldRow3?.stock &&
                                oldRow3.entry !== null &&
                                oldRow3.entry !== undefined;


                            /*
                             * Only send ROW 3 to history
                             * if ROW 3 really contains a trade.
                             */

                            if (row3HasTrade) {

                                moveTradeToHistory({
                                    ...oldRow3
                                });

                            }


                            /*
                             * Move actual ROW 2 trade to ROW 3.
                             */

                            next[2] = {
                                ...oldRow2
                            };


                            /*
                             * Put new stock into ROW 2.
                             */

                            next[1] = {
                                ...trade
                            };

                        }


                        /*
                         * Row 1 remains current dashboard stock.
                         */

                        next[0] = {
                            ...next[0],
                            stock:
                                selectedStock
                        };


                        setActiveTradeSelectedRow(
                            1
                        );


                        return next;

                    }
                );


                return true;

            },
            [
                moveTradeToHistory,
                selectedStock
            ]
        );


    /*
     * =========================================================
     * SELECT ROW
     * =========================================================
     */

    const selectTradeRow =
        useCallback(
            index => {

                setActiveTradeSelectedRow(
                    index
                );

            },
            []
        );


    /*
     * =========================================================
     * EDIT ACTIVE TRADE
     * =========================================================
     */

    const editActiveTrade =
        useCallback(
            index => {

                const trade =
                    activeTrades[index];


                if (
                    !trade ||
                    !trade.stock
                ) {

                    return null;

                }


                setActiveTradeSelectedRow(
                    index
                );


                return {

                    row:
                        index,

                    trade:
                    {
                        ...trade
                    },

                    stopLossPoints:
                        Math.abs(
                            Number(
                                trade.entry
                            ) -
                            Number(
                                trade.stopLoss
                            )
                        ),

                    target1Points:
                        Math.abs(
                            Number(
                                trade.target1
                            ) -
                            Number(
                                trade.entry
                            )
                        ),

                    target2Points:
                        Math.abs(
                            Number(
                                trade.target2
                            ) -
                            Number(
                                trade.entry
                            )
                        )

                };

            },
            [
                activeTrades
            ]
        );


    /*
     * =========================================================
     * EXIT ACTIVE TRADE
     * =========================================================
     */

    const exitActiveTrade =
        useCallback(
            index => {

                const trade =
                    activeTrades[index];


                if (
                    !trade ||
                    !trade.stock ||
                    trade.entry === null
                ) {

                    return;

                }


                moveTradeToHistory(
                    {
                        ...trade
                    }
                );


                setActiveTrades(
                    previous => {

                        const next = [
                            ...previous
                        ];


                        next[index] = {

                            ...EMPTY_TRADE,

                            stock:
                                index === 0
                                    ? selectedStock
                                    : null

                        };


                        return next;

                    }
                );


                setActiveTradeSelectedRow(
                    index === 0
                        ? 0
                        : null
                );

            },
            [
                activeTrades,
                selectedStock,
                moveTradeToHistory
            ]
        );




    /*
 * =========================================================
 * EMERGENCY SELL — EXIT ALL ACTIVE TRADES
 * =========================================================
 */

    const emergencySellAll =
        useCallback(
            () => {

                /*
                 * Find only rows that actually
                 * contain a running trade.
                 */
                const runningTrades =
                    activeTrades.filter(
                        trade =>
                            trade &&
                            trade.stock &&
                            trade.entry !== null &&
                            trade.entry !== undefined
                    );


                /*
                 * Nothing to exit.
                 */
                if (
                    runningTrades.length === 0
                ) {

                    return;

                }


                /*
                 * Convert every running trade
                 * into a history record.
                 */
                const historyTrades =
                    runningTrades.map(
                        trade => {

                            const exitPrice =
                                getHistoryExitPrice(
                                    trade.stock
                                );


                            let pnl = null;


                            if (
                                Number.isFinite(
                                    exitPrice
                                ) &&
                                Number.isFinite(
                                    Number(
                                        trade.entry
                                    )
                                )
                            ) {

                                pnl =
                                    (
                                        exitPrice -
                                        Number(
                                            trade.entry
                                        )
                                    ) *
                                    Number(
                                        trade.quantity || 0
                                    );

                            }


                            return {

                                stock:
                                    trade.stock,

                                quantity:
                                    Number(
                                        trade.quantity
                                    ) || 0,

                                entry:
                                    Number(
                                        trade.entry
                                    ),

                                stopLoss:
                                    Number(
                                        trade.stopLoss
                                    ),

                                target1:
                                    Number(
                                        trade.target1
                                    ),

                                target2:
                                    Number(
                                        trade.target2
                                    ),

                                target3:
                                    Number(
                                        trade.target3
                                    ),

                                exit:
                                    Number.isFinite(
                                        exitPrice
                                    )
                                        ? exitPrice
                                        : null,

                                amount:
                                    Number(
                                        trade.amount
                                    ) || 0,

                                pnl,

                                time:
                                    new Date().toLocaleString(
                                        "en-IN",
                                        {
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            second: "2-digit"
                                        }
                                    )

                            };

                        }
                    );


                /*
                 * Add ALL exited trades to history
                 * in one state update.
                 */
                setTradeHistory(
                    previous => [
                        ...historyTrades,
                        ...previous
                    ].slice(0, 20)
                );


                /*
                 * Completely clear the active table.
                 *
                 * IMPORTANT:
                 * Row 1 is also cleared here.
                 */
                setActiveTrades(
                    createEmptyTrades()
                );


                /*
                 * Remove active-row selection.
                 */
                setActiveTradeSelectedRow(
                    null
                );

                setEmergencyCleared(
                    true
                );

            },
            [
                activeTrades,
                stockData,
                currentTF
            ]
        );
    /*
     * =========================================================
     * BUY / SELL
     * =========================================================
     */

    const setTradeDirection =
        useCallback(
            (
                index,
                direction
            ) => {

                setActiveTrades(
                    previous => {

                        const next = [
                            ...previous
                        ];


                        next[index] = {

                            ...next[index],

                            direction

                        };


                        return next;

                    }
                );

            },
            []
        );

    /* =========================================================
DELETE HISTORY TRADE
SAME BEHAVIOR AS OLD index.html
========================================================= */

    const deleteTradeHistory =
        useCallback(
            index => {

                if (
                    !Number.isInteger(index) ||
                    index < 0 ||
                    index >= tradeHistory.length
                ) {
                    return;
                }


                const trade =
                    tradeHistory[index];


                const confirmed =
                    window.confirm(
                        `Delete ${trade?.stock || "this trade"} from Trade History?`
                    );


                if (!confirmed) {
                    return;
                }


                setTradeHistory(
                    previous =>
                        previous.filter(
                            (_, tradeIndex) =>
                                tradeIndex !== index
                        )
                );

            },
            [
                tradeHistory
            ]
        );


    return {

        activeTrades,

        tradeHistory,

        activeTradeSelectedRow,

        applyActiveTrade,

        editActiveTrade,

        exitActiveTrade,

        emergencySellAll,

        moveTradeToHistory,

        selectTradeRow,

        setTradeDirection,

        deleteTradeHistory

    };

}


export default useActiveTrades;