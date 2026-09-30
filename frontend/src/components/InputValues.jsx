import {
    useEffect,
    useState
} from "react";


function InputValues({
    stocks = [],
    selectedStock,
    stockData,
    currentTF,
    editTradeData,
    onApplyTrade
}) {

    const [
        stock,
        setStock
    ] = useState(
        selectedStock || ""
    );


    const [
        quantity,
        setQuantity
    ] = useState(10);


    const [
        entry,
        setEntry
    ] = useState("");


    const [
        stopLoss,
        setStopLoss
    ] = useState(30);


    const [
        target1,
        setTarget1
    ] = useState(20);


    const [
        target2,
        setTarget2
    ] = useState(20);


    /*
 * =========================================================
 * SYNC INPUT STOCK WITH CURRENT DASHBOARD STOCK
 * =========================================================
 *
 * When the dashboard stock changes from the header,
 * automatically update:
 *
 * 1. Stock Name
 * 2. Entry Price
 *
 * Do NOT reset:
 * - Quantity
 * - Stop Loss
 * - Target 1
 * - Target 2
 *
 * Existing edit mode is preserved.
 */

    useEffect(() => {

        if (
            !selectedStock ||
            editTradeData
        ) {
            return;
        }


        /*
         * Update Stock Name
         */
        setStock(
            selectedStock
        );


        /*
         * Fetch current price of the
         * newly selected dashboard stock.
         */
        const data =
            stockData?.[
            selectedStock
            ]?.[
            currentTF
            ];


        if (
            !Array.isArray(data) ||
            !data.length
        ) {
            return;
        }


        const latestCandle =
            data[
            data.length - 1
            ];


        const price =
            Number(
                latestCandle?.c
            );


        if (
            !Number.isFinite(price)
        ) {
            return;
        }


        setEntry(
            price.toFixed(2)
        );

    }, [
        selectedStock,
        // stockData,
        // currentTF,
        editTradeData
    ]);
    /*
     * =========================================================
     * CURRENT DASHBOARD STOCK
     * =========================================================
     */

    useEffect(() => {

        if (!stock) {
            return;
        }

        const data =
            stockData?.[stock]?.[currentTF];

        if (!Array.isArray(data) || !data.length) {
            return;
        }

        const latestCandle =
            data[data.length - 1];

        const price =
            Number(latestCandle?.c);

        if (!Number.isFinite(price)) {
            return;
        }

        /*
         * Don't overwrite the entry while editing.
         */
        if (editTradeData) {
            return;
        }

        setEntry(
            price.toFixed(2)
        );

    }, [
        stock,
        stockData,
        currentTF,
        editTradeData
    ]);


    /*
     * =========================================================
     * EDIT EXISTING ROW
     * =========================================================
     */

    useEffect(() => {

        if (!editTradeData) {
            return;
        }


        const trade =
            editTradeData.trade;


        setStock(
            trade.stock || ""
        );


        setQuantity(
            trade.quantity || 10
        );


        setEntry(
            trade.entry ?? ""
        );


        setStopLoss(
            editTradeData.stopLossPoints ??
            30
        );


        setTarget1(
            editTradeData.target1Points ??
            20
        );


        setTarget2(
            editTradeData.target2Points ??
            20
        );

    }, [editTradeData]);


    /*
     * =========================================================
     * APPLY BUTTON
     * =========================================================
     */

    function handleApply() {

        const success =
            onApplyTrade({

                stock,

                quantity,

                entry,

                stopLossPoints:
                    stopLoss,

                target1Points:
                    target1,

                target2Points:
                    target2

            });


        if (!success) {
            return;
        }


        /*
         * Same clearing behavior after Apply.
         */

        setEntry("");

        setQuantity(10);

        setStopLoss(30);

        setTarget1(20);

        setTarget2(20);

    }


    return (

        <section
            id="activeInputSection"
            className="card activeInputCard"
        >

            <div className="activeInputTitle">
                INPUT VALUES
            </div>


            <div className="activeInputBody">


                {/* STOCK + QUANTITY */}

                <div className="activeInputRow">

                    <div className="activeInputGroup">

                        <label className="activeInputLabel">
                            Stock Name
                        </label>

                        <select
                            id="activeInputStock"
                            className="activeInputControl"
                            value={stock}
                            onChange={event => {

                                const newStock =
                                    event.target.value;

                                setStock(
                                    newStock
                                );

                                setQuantity(10);
                                setStopLoss(30);
                                setTarget1(20);
                                setTarget2(20);

                            }}
                        >

                            {stocks.map(
                                item => (

                                    <option
                                        key={item}
                                        value={item}
                                    >
                                        {item}
                                    </option>

                                )
                            )}

                        </select>

                    </div>


                    <div className="activeInputGroup">

                        <label className="activeInputLabel">
                            Quantity
                        </label>

                        <input
                            id="activeInputQuantity"
                            className="activeInputControl"
                            type="number"
                            value={quantity}
                            onChange={event =>
                                setQuantity(
                                    event.target.value
                                )
                            }
                        />

                    </div>

                </div>


                {/* ENTRY + SL */}

                <div className="activeInputRow">

                    <div className="activeInputGroup">

                        <label className="activeInputLabel">
                            Entry Price
                        </label>

                        <input
                            id="activeInputEntry"
                            className="activeInputControl"
                            type="number"
                            placeholder="e.g. 25000"
                            value={entry}
                            onChange={event =>
                                setEntry(
                                    event.target.value
                                )
                            }
                        />

                    </div>


                    <div className="activeInputGroup">

                        <label className="activeInputLabel">
                            Stop Loss (Points)
                        </label>

                        <input
                            id="activeInputSL"
                            className="activeInputControl"
                            type="number"
                            value={stopLoss}
                            onChange={event =>
                                setStopLoss(
                                    event.target.value
                                )
                            }
                        />

                    </div>

                </div>


                {/* TARGETS */}

                <div className="activeInputRow">

                    <div className="activeInputGroup">

                        <label className="activeInputLabel">
                            Target 1 (Points)
                        </label>

                        <input
                            id="activeInputTarget1"
                            className="activeInputControl"
                            type="number"
                            value={target1}
                            onChange={event =>
                                setTarget1(
                                    event.target.value
                                )
                            }
                        />

                    </div>


                    <div className="activeInputGroup">

                        <label className="activeInputLabel">
                            Target 2 (Points)
                        </label>

                        <input
                            id="activeInputTarget2"
                            className="activeInputControl"
                            type="number"
                            value={target2}
                            onChange={event =>
                                setTarget2(
                                    event.target.value
                                )
                            }
                        />

                    </div>

                </div>


                {/* APPLY */}

                <button
                    type="button"
                    className={
                        `activeApplyBtn ${editTradeData
                            ? "editing"
                            : ""
                        }`
                    }
                    onClick={handleApply}
                >
                    {editTradeData
                        ? "SAVE CHANGES"
                        : "APPLY TO ACTIVE TABLE"
                    }
                </button>

            </div>

        </section>

    );

}


export default InputValues;