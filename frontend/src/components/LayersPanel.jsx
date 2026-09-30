function LayersPanel({
    visible,
    visibleLayers,
    onToggleLayer
}) {

    const layers = [
        ["EMA", "EMA Trend"],
        ["VWAP", "VWAP"],
        ["RSI", "RSI MTF"],
        ["ADX", "ADX / DI"],
        ["Structure", "Structure"],
        ["SR", "Support / Resistance"],
        ["Volume", "Volume"],
        ["Sentiment", "Sentiment"],
        ["Strength", "Trend Strength"],
        ["BuySell", "Buy / Sell %"]
    ];

    return (
        <div
            id="layers"
            className={
                visible
                    ? "layers"
                    : "layers hidden"
            }
        >

            <h3>
                Show / Hide
            </h3>

            {layers.map(
                ([key, label]) => (
                    <label key={key}>

                        <input
                            type="checkbox"
                            checked={
                                visibleLayers.has(key)
                            }
                            onChange={() =>
                                onToggleLayer(key)
                            }
                        />

                        {label}

                    </label>
                )
            )}

        </div>
    );
}

export default LayersPanel;