function ActiveTradeTable({
    activeTrades = [],
    selectedStock,
    activeTradeSelectedRow,
    onRowSelect,
    onEdit,
    onExit,
    onBuy,
    onSell
}) {
    return (
        <div className="activeStockCard">

            <div className="activeStockTitle">
                ACTIVE STOCK TABLE
            </div>

            <div className="activeStockTableWrap">
                <table className="activeStockTable">

                    <thead>
                        <tr>
                            <th>SR. NO.</th>
                            <th>STOCK</th>
                            <th>QTY</th>
                            <th>ENTRY</th>
                            <th>SL</th>
                            <th>T1</th>
                            <th>T2</th>
                            <th>T3</th>
                            <th>AMOUNT</th>
                            <th>P/L</th>
                            <th>BUY / SELL</th>
                            <th>EDIT</th>
                            <th>EXIT</th>
                        </tr>
                    </thead>

                    <tbody id="activeTradeBody">

                        {[0, 1, 2].map((index) => {

                            const trade =
                                activeTrades[index] || {};

                            /*
                             * ROW 1 MUST ALWAYS SHOW
                             * CURRENT DASHBOARD STOCK
                             */
                            const rowStock =
                                index === 0
                                    ? selectedStock
                                    : trade.stock;

                            return (
                                <tr
                                    key={index}
                                    data-row={index}
                                    className={
                                        activeTradeSelectedRow === index
                                            ? "activeTradeSelectedRow"
                                            : ""
                                    }
                                    onClick={() =>
                                        onRowSelect &&
                                        onRowSelect(index)
                                    }
                                >

                                    <td>
                                        {index + 1}
                                    </td>

                                    <td data-field="stock">
                                        {rowStock || ""}
                                    </td>

                                    <td data-field="quantity">
                                        {trade.quantity || ""}
                                    </td>

                                    <td data-field="entry">
                                        {trade.entry !== undefined &&
                                        trade.entry !== null &&
                                        trade.entry !== ""
                                            ? trade.entry
                                            : "—"}
                                    </td>

                                    <td data-field="stopLoss">
                                        {trade.stopLoss !== undefined &&
                                        trade.stopLoss !== null &&
                                        trade.stopLoss !== ""
                                            ? trade.stopLoss
                                            : "—"}
                                    </td>

                                    <td data-field="target1">
                                        {trade.target1 !== undefined &&
                                        trade.target1 !== null &&
                                        trade.target1 !== ""
                                            ? trade.target1
                                            : "—"}
                                    </td>

                                    <td data-field="target2">
                                        {trade.target2 !== undefined &&
                                        trade.target2 !== null &&
                                        trade.target2 !== ""
                                            ? trade.target2
                                            : "—"}
                                    </td>

                                    <td data-field="target3">
                                        {trade.target3 !== undefined &&
                                        trade.target3 !== null &&
                                        trade.target3 !== ""
                                            ? trade.target3
                                            : "—"}
                                    </td>

                                    <td data-field="amount">
                                        {trade.amount !== undefined &&
                                        trade.amount !== null &&
                                        trade.amount !== ""
                                            ? trade.amount
                                            : "—"}
                                    </td>

                                    <td
                                        data-field="pnl"
                                        className={
                                            Number(trade.pnl) > 0
                                                ? "profit"
                                                : Number(trade.pnl) < 0
                                                    ? "loss"
                                                    : ""
                                        }
                                    >
                                        {trade.pnl !== undefined &&
                                        trade.pnl !== null &&
                                        trade.pnl !== ""
                                            ? trade.pnl
                                            : "—"}
                                    </td>

                                    <td data-field="direction">

                                        <button
                                            type="button"
                                            className="activeBuyBtn"
                                            onClick={(event) => {
                                                event.stopPropagation();

                                                if (onBuy) {
                                                    onBuy(index);
                                                }
                                            }}
                                        >
                                            BUY
                                        </button>

                                        <button
                                            type="button"
                                            className="activeSellBtn"
                                            onClick={(event) => {
                                                event.stopPropagation();

                                                if (onSell) {
                                                    onSell(index);
                                                }
                                            }}
                                        >
                                            SELL
                                        </button>

                                    </td>

                                    <td data-field="edit">

                                        <button
                                            type="button"
                                            className="activeEditBtn"
                                            title="Edit"
                                            onClick={(event) => {
                                                event.stopPropagation();

                                                if (onEdit) {
                                                    onEdit(index);
                                                }
                                            }}
                                        >
                                            ✎
                                        </button>

                                    </td>

                                    <td data-field="exit">

                                        <button
                                            type="button"
                                            className="activeExitBtn"
                                            title="Exit Trade"
                                            onClick={(event) => {
                                                event.stopPropagation();

                                                if (onExit) {
                                                    onExit(index);
                                                }
                                            }}
                                        >
                                            EXIT
                                        </button>

                                    </td>

                                </tr>
                            );
                        })}

                    </tbody>

                </table>
            </div>

        </div>
    );
}

export default ActiveTradeTable;