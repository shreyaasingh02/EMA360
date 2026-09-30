/* =========================================================
   INDICATOR HELPERS
========================================================= */

export function numSeries(arr, key = "c") {
    return Array.isArray(arr)
        ? arr.map(x => Number(x?.[key]))
        : [];
}

export function typicalPriceSeries(arr) {
    return Array.isArray(arr)
        ? arr.map(x => {
            const h = Number(x?.h);
            const l = Number(x?.l);
            const c = Number(x?.c);

            return (
                Number.isFinite(h) &&
                Number.isFinite(l) &&
                Number.isFinite(c)
            )
                ? (h + l + c) / 3
                : null;
        })
        : [];
}


/* =========================================================
   EMA
========================================================= */

export function EMA(data, length) {

    if (!data.length) {
        return 0;
    }

    const k =
        2 / (length + 1);

    let ema =
        data[0];

    for (let i = 1; i < data.length; i++) {

        ema =
            data[i] * k +
            ema * (1 - k);

    }

    return ema;
}


/* =========================================================
   NORMALIZE CANDLES
   ========================================================= */

export function normalizeCandles(candles) {
    if (!Array.isArray(candles)) {
        return [];
    }

    const normalized = candles
        .map(candle => ({
            time: candle?.time,
            o: Number(candle?.o),
            h: Number(candle?.h),
            l: Number(candle?.l),
            c: Number(candle?.c),
            v: Number(candle?.v)
        }))
        .filter(candle =>
            candle.time &&
            Number.isFinite(candle.o) &&
            Number.isFinite(candle.h) &&
            Number.isFinite(candle.l) &&
            Number.isFinite(candle.c) &&
            Number.isFinite(candle.v)
        );

    /*
     * IMPORTANT:
     * Always calculate indicators chronologically.
     */

    normalized.sort(
        (a, b) =>
            new Date(a.time).getTime() -
            new Date(b.time).getTime()
    );

    /*
     * Remove duplicate timestamps.
     */

    const unique = [];
    const seen = new Set();

    for (const candle of normalized) {
        const key = String(candle.time);

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        unique.push(candle);
    }

    return unique;
}


/* =========================================================
   RSI — WILDER RSI(14)
   ========================================================= */

export function RSI(values, length = 14) {

    if (
        !Array.isArray(values) ||
        values.length < length + 1
    ) {
        return null;
    }

    let gainSum = 0;
    let lossSum = 0;

    /*
     * Initial Wilder average
     */

    for (let i = 1; i <= length; i++) {

        const current = Number(values[i]);
        const previous = Number(values[i - 1]);

        if (
            !Number.isFinite(current) ||
            !Number.isFinite(previous)
        ) {
            return null;
        }

        const diff = current - previous;

        if (diff > 0) {
            gainSum += diff;
        } else {
            lossSum += Math.abs(diff);
        }
    }

    let avgGain = gainSum / length;
    let avgLoss = lossSum / length;

    /*
     * Wilder smoothing
     */

    for (
        let i = length + 1;
        i < values.length;
        i++
    ) {

        const current = Number(values[i]);
        const previous = Number(values[i - 1]);

        if (
            !Number.isFinite(current) ||
            !Number.isFinite(previous)
        ) {
            return null;
        }

        const diff = current - previous;

        const gain =
            diff > 0
                ? diff
                : 0;

        const loss =
            diff < 0
                ? Math.abs(diff)
                : 0;

        avgGain =
            (
                avgGain * (length - 1) +
                gain
            ) / length;

        avgLoss =
            (
                avgLoss * (length - 1) +
                loss
            ) / length;
    }

    if (avgLoss === 0) {
        return 100;
    }

    if (avgGain === 0) {
        return 0;
    }

    const rs =
        avgGain / avgLoss;

    const rsi =
        100 -
        (
            100 /
            (1 + rs)
        );

    return Number.isFinite(rsi)
        ? rsi
        : null;
}


/* =========================================================
   VWAP — CURRENT NSE SESSION ONLY
   ========================================================= */

export function calcVWAP(candles) {

    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {
        return null;
    }

    const arr =
        normalizeCandles(candles);

    if (!arr.length) {
        return null;
    }

    const latest =
        arr[arr.length - 1];

    const latestDate =
        String(latest.time).slice(0, 10);

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(latestDate)
    ) {
        return null;
    }

    let cumulativePV = 0;
    let cumulativeVolume = 0;

    for (const candle of arr) {

        const timeString =
            String(candle.time);

        const candleDate =
            timeString.slice(0, 10);

        /*
         * VWAP resets every trading day.
         */

        if (candleDate !== latestDate) {
            continue;
        }

        const candleTime =
            timeString.slice(11, 16);

        /*
         * NSE regular session.
         */

        if (
            candleTime < "09:15" ||
            candleTime > "15:30"
        ) {
            continue;
        }

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

        const typicalPrice =
            (
                high +
                low +
                close
            ) / 3;

        cumulativePV +=
            typicalPrice * volume;

        cumulativeVolume +=
            volume;
    }

    if (cumulativeVolume <= 0) {
        return null;
    }

    const vwap =
        cumulativePV /
        cumulativeVolume;

    return Number.isFinite(vwap)
        ? vwap
        : null;
}


/* =========================================================
   ADX(14) + DI
   WILDER METHOD
   ========================================================= */

export function calcADX(
    candles,
    length = 14
) {

    const arr =
        normalizeCandles(candles);

    if (
        arr.length <
        (length * 2 + 1)
    ) {
        return {
            adx: null,
            plus: null,
            minus: null
        };
    }

    const trueRanges = [];
    const plusDMs = [];
    const minusDMs = [];

    /*
     * STEP 1
     * TR / +DM / -DM
     */

    for (
        let i = 1;
        i < arr.length;
        i++
    ) {

        const current =
            arr[i];

        const previous =
            arr[i - 1];

        const high =
            Number(current.h);

        const low =
            Number(current.l);

        const previousHigh =
            Number(previous.h);

        const previousLow =
            Number(previous.l);

        const previousClose =
            Number(previous.c);

        if (
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(previousHigh) ||
            !Number.isFinite(previousLow) ||
            !Number.isFinite(previousClose)
        ) {
            continue;
        }

        /*
         * True Range
         */

        const tr =
            Math.max(
                high - low,
                Math.abs(high - previousClose),
                Math.abs(low - previousClose)
            );

        /*
         * Directional Movement
         */

        const upMove =
            high - previousHigh;

        const downMove =
            previousLow - low;

        const plusDM =
            upMove > downMove &&
                upMove > 0
                ? upMove
                : 0;

        const minusDM =
            downMove > upMove &&
                downMove > 0
                ? downMove
                : 0;

        trueRanges.push(tr);
        plusDMs.push(plusDM);
        minusDMs.push(minusDM);
    }

    if (
        trueRanges.length <
        (length * 2)
    ) {
        return {
            adx: null,
            plus: null,
            minus: null
        };
    }

    /*
     * STEP 2
     * Initial Wilder smoothing
     */

    let smoothedTR =
        trueRanges
            .slice(0, length)
            .reduce(
                (sum, value) =>
                    sum + value,
                0
            );

    let smoothedPlusDM =
        plusDMs
            .slice(0, length)
            .reduce(
                (sum, value) =>
                    sum + value,
                0
            );

    let smoothedMinusDM =
        minusDMs
            .slice(0, length)
            .reduce(
                (sum, value) =>
                    sum + value,
                0
            );

    const dxValues = [];

    let latestPlusDI = null;
    let latestMinusDI = null;

    /*
     * STEP 3
     * Wilder smoothing + DI + DX
     */

    for (
        let i = length - 1;
        i < trueRanges.length;
        i++
    ) {

        if (i >= length) {

            smoothedTR =
                smoothedTR -
                (smoothedTR / length) +
                trueRanges[i];

            smoothedPlusDM =
                smoothedPlusDM -
                (smoothedPlusDM / length) +
                plusDMs[i];

            smoothedMinusDM =
                smoothedMinusDM -
                (smoothedMinusDM / length) +
                minusDMs[i];
        }

        if (smoothedTR === 0) {
            continue;
        }

        const plusDI =
            (
                smoothedPlusDM /
                smoothedTR
            ) * 100;

        const minusDI =
            (
                smoothedMinusDM /
                smoothedTR
            ) * 100;

        latestPlusDI = plusDI;
        latestMinusDI = minusDI;

        const denominator =
            plusDI +
            minusDI;

        const dx =
            denominator === 0
                ? 0
                : (
                    Math.abs(
                        plusDI -
                        minusDI
                    ) /
                    denominator
                ) * 100;

        dxValues.push(dx);
    }

    /*
     * Need 14 DX values to initialize ADX.
     */

    if (dxValues.length < length) {
        return {
            adx: null,
            plus: latestPlusDI,
            minus: latestMinusDI
        };
    }

    /*
     * STEP 4
     * Initial ADX
     */

    let adx =
        dxValues
            .slice(0, length)
            .reduce(
                (sum, value) =>
                    sum + value,
                0
            ) / length;

    /*
     * STEP 5
     * Wilder ADX smoothing
     */

    for (
        let i = length;
        i < dxValues.length;
        i++
    ) {

        adx =
            (
                (
                    adx *
                    (length - 1)
                ) +
                dxValues[i]
            ) / length;
    }

    return {
        adx:
            Number.isFinite(adx)
                ? adx
                : null,

        plus:
            Number.isFinite(latestPlusDI)
                ? latestPlusDI
                : null,

        minus:
            Number.isFinite(latestMinusDI)
                ? latestMinusDI
                : null
    };
}

/* =========================================================
   STRUCTURE
========================================================= */

export function structure(arr) {

    if (
        !Array.isArray(arr) ||
        arr.length < 15
    ) {

        return "🟡 Mixed";

    }


    /*
     * We use confirmed swing points.
     *
     * A swing high:
     *   high is higher than the candles
     *   immediately before and after it.
     *
     * A swing low:
     *   low is lower than the candles
     *   immediately before and after it.
     */

    const swingHighs = [];
    const swingLows = [];


    const left = 2;
    const right = 2;


    for (
        let i = left;
        i < arr.length - right;
        i++
    ) {

        const high =
            Number(arr[i].h);

        const low =
            Number(arr[i].l);


        if (
            !Number.isFinite(high) ||
            !Number.isFinite(low)
        ) {

            continue;

        }


        let isSwingHigh = true;
        let isSwingLow = true;


        /*
         * Check candles on both sides.
         */

        for (
            let j = 1;
            j <= left;
            j++
        ) {

            if (
                high <=
                Number(arr[i - j].h) ||

                low >=
                Number(arr[i - j].l)
            ) {

                if (
                    high <=
                    Number(arr[i - j].h)
                ) {

                    isSwingHigh = false;

                }


                if (
                    low >=
                    Number(arr[i - j].l)
                ) {

                    isSwingLow = false;

                }

            }

        }


        for (
            let j = 1;
            j <= right;
            j++
        ) {

            if (
                high <=
                Number(arr[i + j].h)
            ) {

                isSwingHigh = false;

            }


            if (
                low >=
                Number(arr[i + j].l)
            ) {

                isSwingLow = false;

            }

        }


        if (isSwingHigh) {

            swingHighs.push(high);

        }


        if (isSwingLow) {

            swingLows.push(low);

        }

    }


    /*
     * We need at least two swing highs and
     * two swing lows to determine structure.
     */

    if (
        swingHighs.length < 2 ||
        swingLows.length < 2
    ) {

        return "🟡 Mixed";

    }


    /*
     * Only compare the most recent swings.
     */

    const previousHigh =
        swingHighs[
        swingHighs.length - 2
        ];


    const latestHigh =
        swingHighs[
        swingHighs.length - 1
        ];


    const previousLow =
        swingLows[
        swingLows.length - 2
        ];


    const latestLow =
        swingLows[
        swingLows.length - 1
        ];


    /*
     * Higher High + Higher Low
     */

    if (
        latestHigh > previousHigh &&
        latestLow > previousLow
    ) {

        return "🟢 BULLISH HH/HL";

    }


    /*
     * Lower High + Lower Low
     */

    if (
        latestHigh < previousHigh &&
        latestLow < previousLow
    ) {

        return "🔴 BEARISH LH/LL";

    }


    /*
     * One side higher and the other side lower,
     * or no clear direction.
     */

    return "🟡 Mixed";

}


/* =========================================================
   SUPPORT / RESISTANCE
========================================================= */

export function calcSR(arr) {

    if (
        !Array.isArray(arr) ||
        arr.length < 20
    ) {
        return {
            resistance: null,
            support: null,
            signal: "🟡 N/A"
        };
    }

    /*
     * Current price
     */
    const volumeCandles =
    arr.filter(
        candle =>
            candle &&
            Number.isFinite(Number(candle.c)) &&
            Number(candle.v) > 0
    );

const priceCandles =
    volumeCandles.length
        ? volumeCandles
        : arr.filter(
            candle =>
                candle &&
                Number.isFinite(
                    Number(candle.c)
                )
        );

const price =
    Number(
        priceCandles.at(-1)?.c
    );

    if (!Number.isFinite(price)) {
        return {
            resistance: null,
            support: null,
            signal: "🟡 N/A"
        };
    }

    /*
     * Use only COMPLETED candles.
     * Current candle must never create its own S/R.
     */
    const completed =
        arr.slice(
            Math.max(0, arr.length - 51),
            arr.length - 1
        );

    if (completed.length < 10) {
        return {
            resistance: null,
            support: null,
            signal: "🟡 N/A"
        };
    }

    /*
     * ---------------------------------------------------------
     * FIND CONFIRMED SWING HIGHS / LOWS
     * ---------------------------------------------------------
     */

    const swingHighs = [];
    const swingLows = [];

    for (
        let i = 2;
        i < completed.length - 2;
        i++
    ) {

        const high =
            Number(completed[i].h);

        const low =
            Number(completed[i].l);

        if (
            !Number.isFinite(high) ||
            !Number.isFinite(low)
        ) {
            continue;
        }

        const isSwingHigh =
            high >
                Number(completed[i - 1].h) &&
            high >
                Number(completed[i - 2].h) &&
            high >
                Number(completed[i + 1].h) &&
            high >
                Number(completed[i + 2].h);

        const isSwingLow =
            low <
                Number(completed[i - 1].l) &&
            low <
                Number(completed[i - 2].l) &&
            low <
                Number(completed[i + 1].l) &&
            low <
                Number(completed[i + 2].l);

        if (isSwingHigh) {
            swingHighs.push(high);
        }

        if (isSwingLow) {
            swingLows.push(low);
        }
    }

    /*
     * ---------------------------------------------------------
     * RESISTANCE
     *
     * Must be ABOVE current price.
     * Choose the nearest confirmed swing high.
     * ---------------------------------------------------------
     */

    const resistanceCandidates =
        swingHighs
            .filter(
                level =>
                    Number.isFinite(level) &&
                    level > price
            )
            .sort(
                (a, b) =>
                    a - b
            );

    let resistance =
        resistanceCandidates.length
            ? resistanceCandidates[0]
            : null;

    /*
     * If no confirmed swing high exists above price,
     * use the nearest previous candle high above price.
     */

    if (resistance === null) {

        const previousHighs =
            completed
                .map(
                    candle =>
                        Number(candle.h)
                )
                .filter(
                    value =>
                        Number.isFinite(value) &&
                        value > price
                )
                .sort(
                    (a, b) =>
                        a - b
                );

        if (previousHighs.length) {
            resistance =
                previousHighs[0];
        }
    }

    /*
     * ---------------------------------------------------------
     * SUPPORT
     *
     * Must be BELOW current price.
     * Choose the nearest confirmed swing low.
     * ---------------------------------------------------------
     */

    const supportCandidates =
        swingLows
            .filter(
                level =>
                    Number.isFinite(level) &&
                    level < price
            )
            .sort(
                (a, b) =>
                    b - a
            );

    let support =
        supportCandidates.length
            ? supportCandidates[0]
            : null;

    /*
     * If no confirmed swing low exists below price,
     * use the nearest previous candle low below price.
     */

    if (support === null) {

        const previousLows =
            completed
                .map(
                    candle =>
                        Number(candle.l)
                )
                .filter(
                    value =>
                        Number.isFinite(value) &&
                        value < price
                )
                .sort(
                    (a, b) =>
                        b - a
                );

        if (previousLows.length) {
            support =
                previousLows[0];
        }
    }

    /*
     * ---------------------------------------------------------
     * FINAL SAFETY CHECK
     *
     * This is IMPORTANT.
     *
     * Resistance can NEVER be below support.
     *
     * Expected relationship:
     *
     *        Resistance
     *             ↑
     *        Current Price
     *             ↓
     *          Support
     * ---------------------------------------------------------
     */

    if (
        resistance !== null &&
        support !== null &&
        resistance <= support
    ) {

        resistance = null;
        support = null;
    }

    /*
     * ---------------------------------------------------------
     * SIGNAL
     * ---------------------------------------------------------
     */

    let signal =
        "🟡 Range";

    if (
        resistance !== null &&
        price >= resistance
    ) {

        signal =
            "🟢 Breakout";

    }
    else if (
        support !== null &&
        price <= support
    ) {

        signal =
            "🔴 Breakdown";

    }
    else if (
        resistance !== null &&
        Math.abs(price - resistance) /
        resistance < 0.002
    ) {

        signal =
            "🟠 Near Resistance";

    }
    else if (
        support !== null &&
        Math.abs(price - support) /
        support < 0.002
    ) {

        signal =
            "🟠 Near Support";
    }

    return {
        resistance,
        support,
        signal
    };
}

function rollingMean(values, length = 20) {

    const out =
        new Array(
            values.length
        ).fill(null);


    for (
        let i = length - 1;
        i < values.length;
        i++
    ) {

        let sum = 0;
        let ok = true;


        for (
            let j = 0;
            j < length;
            j++
        ) {

            const v =
                Number(
                    values[i - j]
                );


            if (
                !Number.isFinite(v)
            ) {

                ok = false;

                break;

            }


            sum += v;

        }


        if (ok) {

            out[i] =
                sum / length;

        }

    }


    return out;
}


function wmaSeries(
    values,
    length = 20
) {

    const out =
        new Array(
            values.length
        ).fill(null);


    const denom =
        length *
        (length + 1) /
        2;


    for (
        let i = length - 1;
        i < values.length;
        i++
    ) {

        let s = 0;
        let ok = true;


        for (
            let j = 0;
            j < length;
            j++
        ) {

            const v =
                Number(
                    values[i - j]
                );


            if (
                !Number.isFinite(v)
            ) {

                ok = false;

                break;

            }


            s +=
                v *
                (length - j);

        }


        if (ok) {

            out[i] =
                s / denom;

        }

    }


    return out;
}


function rmaSeries(
    values,
    length = 14
) {

    const out =
        new Array(
            values.length
        ).fill(null);


    if (
        values.length < length
    ) {

        return out;

    }


    let sum = 0;


    for (
        let i = 0;
        i < length;
        i++
    ) {

        sum +=
            Number(
                values[i]
            );

    }


    let rma =
        sum / length;


    out[length - 1] =
        rma;


    for (
        let i = length;
        i < values.length;
        i++
    ) {

        rma =
            (
                (length - 1) * rma +
                Number(values[i])
            ) /
            length;


        out[i] =
            rma;

    }


    return out;
}


function demaSeries(
    values,
    length = 20
) {

    const e1 =
        emaSeriesGlobal(
            values,
            length
        );


    const e2 =
        emaSeriesGlobal(
            e1.map(
                v =>
                    Number.isFinite(v)
                        ? v
                        : 0
            ),
            length
        );


    return e1.map(
        (v, i) =>
            Number.isFinite(v) &&
                Number.isFinite(e2[i])
                ? 2 * v -
                e2[i]
                : null
    );
}


function temaSeries(
    values,
    length = 20
) {

    const e1 =
        emaSeriesGlobal(
            values,
            length
        );


    const e2 =
        emaSeriesGlobal(
            e1.map(
                v =>
                    Number.isFinite(v)
                        ? v
                        : 0
            ),
            length
        );


    const e3 =
        emaSeriesGlobal(
            e2.map(
                v =>
                    Number.isFinite(v)
                        ? v
                        : 0
            ),
            length
        );


    return e1.map(
        (v, i) =>
            Number.isFinite(v) &&
                Number.isFinite(e2[i]) &&
                Number.isFinite(e3[i])
                ? 3 * v -
                3 * e2[i] +
                e3[i]
                : null
    );
}


function hmaSeries(
    values,
    length = 20
) {

    const half =
        Math.max(
            1,
            Math.floor(
                length / 2
            )
        );


    const root =
        Math.max(
            1,
            Math.round(
                Math.sqrt(length)
            )
        );


    const wHalf =
        wmaSeries(
            values,
            half
        );


    const wFull =
        wmaSeries(
            values,
            length
        );


    const diff =
        values.map(
            (_, i) =>
                Number.isFinite(wHalf[i]) &&
                    Number.isFinite(wFull[i])
                    ? 2 * wHalf[i] -
                    wFull[i]
                    : null
        );


    return wmaSeries(
        diff,
        root
    );
}

function vwmaSeries(
    arr,
    length = 20
) {

    const out =
        new Array(
            arr.length
        ).fill(null);


    for (
        let i = length - 1;
        i < arr.length;
        i++
    ) {

        let pv = 0;
        let vv = 0;
        let ok = true;


        for (
            let j =
                i - length + 1;
            j <= i;
            j++
        ) {

            const p =
                Number(
                    arr[j]?.c
                );

            const v =
                Number(
                    arr[j]?.v
                );


            if (
                !Number.isFinite(p) ||
                !Number.isFinite(v)
            ) {

                ok = false;

                break;

            }


            pv +=
                p * v;


            vv +=
                v;

        }


        if (
            ok &&
            vv !== 0
        ) {

            out[i] =
                pv / vv;

        }

    }


    return out;
}


function almaSeries(
    values,
    length = 20,
    offset = 0.85,
    sigma = 6
) {

    const out =
        new Array(
            values.length
        ).fill(null);


    const m =
        offset *
        (length - 1);


    const s =
        length /
        sigma;


    const weights =
        Array.from(
            { length },
            (_, j) =>
                Math.exp(
                    -(
                        (j - m) ** 2
                    ) /
                    (
                        2 *
                        s *
                        s
                    )
                )
        );


    const ws =
        weights.reduce(
            (a, b) =>
                a + b,
            0
        );


    for (
        let i = length - 1;
        i < values.length;
        i++
    ) {

        let sum = 0;
        let ok = true;


        for (
            let j = 0;
            j < length;
            j++
        ) {

            const v =
                Number(
                    values[
                    i -
                    length +
                    1 +
                    j
                    ]
                );


            if (
                !Number.isFinite(v)
            ) {

                ok = false;

                break;

            }


            sum +=
                v *
                weights[j];

        }


        if (ok) {

            out[i] =
                sum / ws;

        }

    }


    return out;
}


function mcGinleySeries(
    values,
    length = 14
) {

    const out =
        new Array(
            values.length
        ).fill(null);


    if (!values.length) {

        return out;

    }


    let mg =
        Number(
            values[0]
        );


    out[0] =
        mg;


    for (
        let i = 1;
        i < values.length;
        i++
    ) {

        const price =
            Number(
                values[i]
            );


        if (
            !Number.isFinite(price)
        ) {

            continue;

        }


        const ratio =
            mg !== 0
                ? price / mg
                : 1;


        mg =
            mg +
            (
                price - mg
            ) /
            (
                length *
                Math.pow(
                    Math.max(
                        0.0001,
                        ratio
                    ),
                    4
                )
            );


        out[i] =
            mg;

    }


    return out;
}


function highestSeries(
    values,
    length = 20
) {

    const out =
        new Array(
            values.length
        ).fill(null);


    for (
        let i = length - 1;
        i < values.length;
        i++
    ) {

        const w =
            values
                .slice(
                    i -
                    length +
                    1,
                    i + 1
                )
                .filter(
                    Number.isFinite
                );


        if (
            w.length === length
        ) {

            out[i] =
                Math.max(
                    ...w
                );

        }

    }


    return out;
}


function lowestSeries(
    values,
    length = 20
) {

    const out =
        new Array(
            values.length
        ).fill(null);


    for (
        let i = length - 1;
        i < values.length;
        i++
    ) {

        const w =
            values
                .slice(
                    i -
                    length +
                    1,
                    i + 1
                )
                .filter(
                    Number.isFinite
                );


        if (
            w.length === length
        ) {

            out[i] =
                Math.min(
                    ...w
                );

        }

    }


    return out;
}


function stdevSeries(
    values,
    length = 20
) {

    const out =
        new Array(
            values.length
        ).fill(null);


    for (
        let i = length - 1;
        i < values.length;
        i++
    ) {

        const w =
            values.slice(
                i -
                length +
                1,
                i + 1
            );


        if (
            w.some(
                v =>
                    !Number.isFinite(
                        Number(v)
                    )
            )
        ) {

            continue;

        }


        const mean =
            w.reduce(
                (a, b) =>
                    a +
                    Number(b),
                0
            ) /
            length;


        const variance =
            w.reduce(
                (a, b) =>
                    a +
                    (
                        Number(b) -
                        mean
                    ) ** 2,
                0
            ) /
            length;


        out[i] =
            Math.sqrt(
                variance
            );

    }


    return out;
}


function bollingerSeries(
    arr,
    length = 20,
    mult = 2
) {

    const close =
        numSeries(arr);


    const mid =
        rollingMean(
            close,
            length
        );


    const sd =
        stdevSeries(
            close,
            length
        );


    return {

        mid,

        upper:
            mid.map(
                (v, i) =>
                    Number.isFinite(v) &&
                        Number.isFinite(sd[i])
                        ? v +
                        mult *
                        sd[i]
                        : null
            ),

        lower:
            mid.map(
                (v, i) =>
                    Number.isFinite(v) &&
                        Number.isFinite(sd[i])
                        ? v -
                        mult *
                        sd[i]
                        : null
            ),

        width:
            mid.map(
                (v, i) =>
                    Number.isFinite(v) &&
                        Number.isFinite(sd[i]) &&
                        v !== 0
                        ? (
                            (
                                2 *
                                mult *
                                sd[i]
                            ) /
                            v
                        ) *
                        100
                        : null
            ),

        percentB:
            mid.map(
                (v, i) => {

                    const u =
                        (
                            Number.isFinite(v) &&
                            Number.isFinite(sd[i])
                        )
                            ? v +
                            mult *
                            sd[i]
                            : null;


                    const l =
                        (
                            Number.isFinite(v) &&
                            Number.isFinite(sd[i])
                        )
                            ? v -
                            mult *
                            sd[i]
                            : null;


                    const p =
                        close[i];


                    return (
                        Number.isFinite(u) &&
                        Number.isFinite(l) &&
                        u !== l
                    )
                        ? (
                            (
                                p - l
                            ) /
                            (
                                u - l
                            )
                        ) *
                        100
                        : null;

                }
            )

    };

}


function atrSeries(
    arr,
    length = 14
) {

    const tr =
        new Array(
            arr.length
        ).fill(null);


    for (
        let i = 0;
        i < arr.length;
        i++
    ) {

        const h =
            Number(
                arr[i].h
            );


        const l =
            Number(
                arr[i].l
            );


        const pc =
            i
                ? Number(
                    arr[i - 1].c
                )
                : h;


        if (
            Number.isFinite(h) &&
            Number.isFinite(l) &&
            Number.isFinite(pc)
        ) {

            tr[i] =
                i === 0
                    ? h - l
                    : Math.max(
                        h - l,
                        Math.abs(
                            h - pc
                        ),
                        Math.abs(
                            l - pc
                        )
                    );

        }

    }


    return rmaSeries(
        tr.map(
            v =>
                Number.isFinite(v)
                    ? v
                    : 0
        ),
        length
    );

}

function stochasticSeries(
    arr,
    length = 14,
    smoothK = 3,
    smoothD = 3
) {

    const raw =
        new Array(
            arr.length
        ).fill(null);


    for (
        let i = length - 1;
        i < arr.length;
        i++
    ) {

        const hh =
            Math.max(
                ...arr
                    .slice(
                        i - length + 1,
                        i + 1
                    )
                    .map(
                        x =>
                            Number(x.h)
                    )
            );


        const ll =
            Math.min(
                ...arr
                    .slice(
                        i - length + 1,
                        i + 1
                    )
                    .map(
                        x =>
                            Number(x.l)
                    )
            );


        const c =
            Number(
                arr[i].c
            );


        if (
            Number.isFinite(hh) &&
            Number.isFinite(ll) &&
            hh !== ll
        ) {

            raw[i] =
                (
                    (c - ll) /
                    (hh - ll)
                ) *
                100;

        }

    }


    const k =
        rollingMean(
            raw.map(
                v =>
                    Number.isFinite(v)
                        ? v
                        : NaN
            ),
            smoothK
        );


    const d =
        rollingMean(
            k.map(
                v =>
                    Number.isFinite(v)
                        ? v
                        : NaN
            ),
            smoothD
        );


    return {
        raw,
        k,
        d
    };

}


function williamsRSeries(
    arr,
    length = 14
) {

    const out =
        new Array(
            arr.length
        ).fill(null);


    for (
        let i = length - 1;
        i < arr.length;
        i++
    ) {

        const highs =
            arr
                .slice(
                    i - length + 1,
                    i + 1
                )
                .map(
                    x =>
                        Number(x.h)
                );


        const lows =
            arr
                .slice(
                    i - length + 1,
                    i + 1
                )
                .map(
                    x =>
                        Number(x.l)
                );


        const high =
            Math.max(
                ...highs
            );


        const low =
            Math.min(
                ...lows
            );


        const close =
            Number(
                arr[i].c
            );


        if (
            Number.isFinite(high) &&
            Number.isFinite(low) &&
            Number.isFinite(close) &&
            high !== low
        ) {

            out[i] =
                (
                    (high - close) /
                    (high - low)
                ) *
                -100;

        }

    }


    return out;

}


function ultimateOscillatorSeries(arr) {

    const bp = [];
    const tr = [];


    for (
        let i = 0;
        i < arr.length;
        i++
    ) {

        const h =
            Number(
                arr[i].h
            );


        const l =
            Number(
                arr[i].l
            );


        const c =
            Number(
                arr[i].c
            );


        const pc =
            i
                ? Number(
                    arr[i - 1].c
                )
                : c;


        bp[i] =
            c -
            Math.min(
                l,
                pc
            );


        tr[i] =
            Math.max(
                h,
                pc
            ) -
            Math.min(
                l,
                pc
            );

    }


    const out =
        new Array(
            arr.length
        ).fill(null);


    for (
        let i = 27;
        i < arr.length;
        i++
    ) {

        const avg =
            (n) => {

                const a =
                    bp
                        .slice(
                            i - n + 1,
                            i + 1
                        )
                        .reduce(
                            (s, v) =>
                                s + v,
                            0
                        );


                const b =
                    tr
                        .slice(
                            i - n + 1,
                            i + 1
                        )
                        .reduce(
                            (s, v) =>
                                s + v,
                            0
                        );


                return b
                    ? a / b
                    : 0;

            };


        out[i] =
            100 *
            (
                4 * avg(7) +
                2 * avg(14) +
                avg(28)
            ) /
            7;

    }


    return out;

}


function obvSeries(arr) {

    const out =
        new Array(
            arr.length
        ).fill(null);


    let obv = 0;


    for (
        let i = 0;
        i < arr.length;
        i++
    ) {

        const v =
            Math.max(
                0,
                Number(
                    arr[i].v
                ) || 0
            );


        if (i > 0) {

            if (
                Number(arr[i].c) >
                Number(arr[i - 1].c)
            ) {

                obv += v;

            }
            else if (
                Number(arr[i].c) <
                Number(arr[i - 1].c)
            ) {

                obv -= v;

            }

        }


        out[i] =
            obv;

    }


    return out;

}


function volumeOscSeries(
    arr,
    fast = 5,
    slow = 10
) {

    const v =
        numSeries(
            arr,
            "v"
        );


    const ef =
        emaSeriesGlobal(
            v,
            fast
        );


    const es =
        emaSeriesGlobal(
            v,
            slow
        );


    return ef.map(
        (x, i) =>
            Number.isFinite(x) &&
                Number.isFinite(es[i]) &&
                es[i] !== 0
                ? (
                    (x - es[i]) /
                    es[i]
                ) *
                100
                : null
    );

}


function mfiSeries(
    arr,
    length = 14
) {

    const tp =
        typicalPriceSeries(
            arr
        );


    const vol =
        numSeries(
            arr,
            "v"
        );


    const out =
        new Array(
            arr.length
        ).fill(null);


    for (
        let i = length;
        i < arr.length;
        i++
    ) {

        let pos = 0;
        let neg = 0;


        for (
            let j =
                i - length + 1;
            j <= i;
            j++
        ) {

            const flow =
                Number(tp[j]) *
                Math.max(
                    0,
                    Number(vol[j]) || 0
                );


            if (
                Number(tp[j]) >
                Number(tp[j - 1])
            ) {

                pos += flow;

            }
            else if (
                Number(tp[j]) <
                Number(tp[j - 1])
            ) {

                neg += flow;

            }

        }


        out[i] =
            neg === 0
                ? 100
                : 100 -
                100 /
                (
                    1 +
                    pos / neg
                );

    }


    return out;

}


function linRegSeries(
    values,
    length = 20
) {

    const out =
        new Array(
            values.length
        ).fill(null);


    for (
        let i = length - 1;
        i < values.length;
        i++
    ) {

        const w =
            values
                .slice(
                    i - length + 1,
                    i + 1
                )
                .map(Number);


        if (
            w.some(
                v =>
                    !Number.isFinite(v)
            )
        ) {

            continue;

        }


        const xb =
            (length - 1) /
            2;


        const yb =
            w.reduce(
                (a, b) =>
                    a + b,
                0
            ) /
            length;


        let num = 0;
        let den = 0;


        for (
            let j = 0;
            j < length;
            j++
        ) {

            num +=
                (j - xb) *
                (w[j] - yb);


            den +=
                (j - xb) ** 2;

        }


        const slope =
            den
                ? num / den
                : 0;


        const intercept =
            yb -
            slope * xb;


        out[i] =
            intercept +
            slope *
            (length - 1);

    }


    return out;

}


function linRegSlopeSeries(
    values,
    length = 20
) {

    const out =
        new Array(
            values.length
        ).fill(null);


    for (
        let i = length - 1;
        i < values.length;
        i++
    ) {

        const w =
            values
                .slice(
                    i - length + 1,
                    i + 1
                )
                .map(Number);


        if (
            w.some(
                v =>
                    !Number.isFinite(v)
            )
        ) {

            continue;

        }


        const xb =
            (length - 1) /
            2;


        const yb =
            w.reduce(
                (a, b) =>
                    a + b,
                0
            ) /
            length;


        let num = 0;
        let den = 0;


        for (
            let j = 0;
            j < length;
            j++
        ) {

            num +=
                (j - xb) *
                (w[j] - yb);


            den +=
                (j - xb) ** 2;

        }


        out[i] =
            den
                ? num / den
                : 0;

    }


    return out;

}

function aroonSeries(
    arr,
    length = 14
) {

    const up =
        new Array(
            arr.length
        ).fill(null);


    const down =
        new Array(
            arr.length
        ).fill(null);


    for (
        let i = length - 1;
        i < arr.length;
        i++
    ) {

        let hi = -Infinity;
        let li = Infinity;

        let hiAgo = 0;
        let loAgo = 0;


        for (
            let j = 0;
            j < length;
            j++
        ) {

            const idx =
                i - j;


            const h =
                Number(
                    arr[idx].h
                );


            const l =
                Number(
                    arr[idx].l
                );


            if (
                h > hi
            ) {

                hi =
                    h;

                hiAgo =
                    j;

            }


            if (
                l < li
            ) {

                li =
                    l;

                loAgo =
                    j;

            }

        }


        up[i] =
            (
                (length - hiAgo) /
                length
            ) *
            100;


        down[i] =
            (
                (length - loAgo) /
                length
            ) *
            100;

    }


    return {

        up,

        down,

        osc:
            up.map(
                (v, i) =>
                    Number.isFinite(v) &&
                        Number.isFinite(down[i])
                        ? v -
                        down[i]
                        : null
            )

    };

}


function donchianSeries(
    arr,
    length = 20
) {

    return {

        upper:
            highestSeries(
                numSeries(
                    arr,
                    "h"
                ),
                length
            ),


        lower:
            lowestSeries(
                numSeries(
                    arr,
                    "l"
                ),
                length
            )

    };

}


function keltnerSeries(
    arr,
    length = 20,
    mult = 2
) {

    const tp =
        typicalPriceSeries(
            arr
        );


    const mid =
        emaSeriesGlobal(
            tp,
            length
        );


    const atr =
        atrSeries(
            arr,
            10
        );


    return {

        mid,

        upper:
            mid.map(
                (v, i) =>
                    Number.isFinite(v) &&
                        Number.isFinite(atr[i])
                        ? v +
                        mult *
                        atr[i]
                        : null
            ),


        lower:
            mid.map(
                (v, i) =>
                    Number.isFinite(v) &&
                        Number.isFinite(atr[i])
                        ? v -
                        mult *
                        atr[i]
                        : null
            )

    };

}


function ichimokuSeries(arr) {

    const h =
        numSeries(
            arr,
            "h"
        );


    const l =
        numSeries(
            arr,
            "l"
        );


    const midpoint =
        (a, b) =>
            a.map(
                (v, i) =>
                    Number.isFinite(v) &&
                        Number.isFinite(b[i])
                        ? (
                            v +
                            b[i]
                        ) / 2
                        : null
            );


    const hi9 =
        highestSeries(
            h,
            9
        );


    const lo9 =
        lowestSeries(
            l,
            9
        );


    const hi26 =
        highestSeries(
            h,
            26
        );


    const lo26 =
        lowestSeries(
            l,
            26
        );


    const hi52 =
        highestSeries(
            h,
            52
        );


    const lo52 =
        lowestSeries(
            l,
            52
        );


    const conversion =
        midpoint(
            hi9,
            lo9
        );


    const base =
        midpoint(
            hi26,
            lo26
        );


    const spanA =
        conversion.map(
            (v, i) =>
                Number.isFinite(v) &&
                    Number.isFinite(base[i])
                    ? (
                        v +
                        base[i]
                    ) / 2
                    : null
        );


    const spanB =
        midpoint(
            hi52,
            lo52
        );


    return {

        conversion,

        base,

        spanA,

        spanB

    };

}


function psarSeries(
    arr,
    step = 0.02,
    maxStep = 0.2
) {

    const out =
        new Array(
            arr.length
        ).fill(null);


    if (!arr.length) {

        return out;

    }


    let bull = true;

    let sar =
        Number(
            arr[0].l
        );

    let ep =
        Number(
            arr[0].h
        );

    let af =
        step;


    out[0] =
        sar;


    for (
        let i = 1;
        i < arr.length;
        i++
    ) {

        const h =
            Number(
                arr[i].h
            );


        const l =
            Number(
                arr[i].l
            );


        const ph =
            Number(
                arr[i - 1].h
            );


        const pl =
            Number(
                arr[i - 1].l
            );


        sar =
            sar +
            af *
            (
                ep -
                sar
            );


        if (bull) {

            sar =
                Math.min(
                    sar,
                    pl,
                    i > 1
                        ? Number(
                            arr[i - 2].l
                        )
                        : pl
                );


            if (
                l < sar
            ) {

                bull =
                    false;

                sar =
                    ep;

                ep =
                    l;

                af =
                    step;

            }
            else if (
                h > ep
            ) {

                ep =
                    h;

                af =
                    Math.min(
                        maxStep,
                        af + step
                    );

            }

        }
        else {

            sar =
                Math.max(
                    sar,
                    ph,
                    i > 1
                        ? Number(
                            arr[i - 2].h
                        )
                        : ph
                );


            if (
                h > sar
            ) {

                bull =
                    true;

                sar =
                    ep;

                ep =
                    h;

                af =
                    step;

            }
            else if (
                l < ep
            ) {

                ep =
                    l;

                af =
                    Math.min(
                        maxStep,
                        af + step
                    );

            }

        }


        out[i] =
            sar;

    }


    return out;

}


function superTrendSeries(
    arr,
    length = 10,
    mult = 3
) {

    const atr =
        atrSeries(
            arr,
            length
        );


    const upper = [];
    const lower = [];
    const trend = [];


    const out =
        new Array(
            arr.length
        ).fill(null);


    let prevUpper = null;
    let prevLower = null;

    let dir = 1;


    for (
        let i = 0;
        i < arr.length;
        i++
    ) {

        const hl2 =
            (
                Number(
                    arr[i].h
                ) +
                Number(
                    arr[i].l
                )
            ) / 2;


        const a =
            atr[i];


        if (
            !Number.isFinite(a)
        ) {

            trend[i] =
                dir;

            continue;

        }


        let bu =
            hl2 +
            mult *
            a;


        let bl =
            hl2 -
            mult *
            a;


        if (
            prevUpper !== null &&
            Number(
                arr[i - 1].c
            ) <=
            prevUpper
        ) {

            bu =
                Math.min(
                    bu,
                    prevUpper
                );

        }


        if (
            prevLower !== null &&
            Number(
                arr[i - 1].c
            ) >=
            prevLower
        ) {

            bl =
                Math.max(
                    bl,
                    prevLower
                );

        }


        const c =
            Number(
                arr[i].c
            );


        if (
            c > bu
        ) {

            dir =
                1;

        }
        else if (
            c < bl
        ) {

            dir =
                -1;

        }


        out[i] =
            dir === 1
                ? bl
                : bu;


        prevUpper =
            bu;

        prevLower =
            bl;

        trend[i] =
            dir;

    }


    return {

        value:
            out,

        trend

    };

}


function envelopesSeries(
    values,
    length = 20,
    pct = 2.5
) {

    const mid =
        rollingMean(
            values,
            length
        );


    return {

        mid,

        upper:
            mid.map(
                v =>
                    Number.isFinite(v)
                        ? v *
                        (
                            1 +
                            pct / 100
                        )
                        : null
            ),

        lower:
            mid.map(
                v =>
                    Number.isFinite(v)
                        ? v *
                        (
                            1 -
                            pct / 100
                        )
                        : null
            )

    };

}


function performanceSeries(values) {

    const base =
        Number(
            values.find(
                v =>
                    Number.isFinite(
                        Number(v)
                    )
            )
        );


    return values.map(
        v =>
            base &&
                Number.isFinite(
                    Number(v)
                )
                ? (
                    Number(v) /
                    base -
                    1
                ) *
                100
                : null
    );

}


function pivotLevels(arr) {

    if (
        !Array.isArray(arr) ||
        !arr.length
    ) {

        return {

            pp: null,

            r1: null,

            s1: null,

            r2: null,

            s2: null,

            r3: null,

            s3: null

        };

    }


    const last =
        arr[
        arr.length - 1
        ];


    const high =
        Number(
            last.h
        );


    const low =
        Number(
            last.l
        );


    const close =
        Number(
            last.c
        );


    if (
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
    ) {

        return {

            pp: null,

            r1: null,

            s1: null,

            r2: null,

            s2: null,

            r3: null,

            s3: null

        };

    }


    const pp =
        (
            high +
            low +
            close
        ) / 3;


    const r1 =
        2 * pp -
        low;


    const s1 =
        2 * pp -
        high;


    const r2 =
        pp +
        (
            high -
            low
        );


    const s2 =
        pp -
        (
            high -
            low
        );


    const r3 =
        high +
        2 *
        (
            pp -
            low
        );


    const s3 =
        low -
        2 *
        (
            high -
            pp
        );


    return {

        pp,

        r1,

        s1,

        r2,

        s2,

        r3,

        s3

    };

}

function adxSeries(arr) {

    const period = 14;

    const adxValues =
        new Array(arr.length)
            .fill(null);

    const plusValues =
        new Array(arr.length)
            .fill(null);

    const minusValues =
        new Array(arr.length)
            .fill(null);


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


    for (
        let i = 1;
        i < arr.length;
        i++
    ) {

        const high =
            Number(arr[i].h);

        const low =
            Number(arr[i].l);

        const previousHigh =
            Number(arr[i - 1].h);

        const previousLow =
            Number(arr[i - 1].l);

        const previousClose =
            Number(arr[i - 1].c);


        const upMove =
            high -
            previousHigh;

        const downMove =
            previousLow -
            low;


        tr.push(
            Math.max(
                high - low,
                Math.abs(
                    high -
                    previousClose
                ),
                Math.abs(
                    low -
                    previousClose
                )
            )
        );


        plusDM.push(
            upMove > downMove &&
                upMove > 0
                ? upMove
                : 0
        );


        minusDM.push(
            downMove > upMove &&
                downMove > 0
                ? downMove
                : 0
        );

    }


    let smoothedTR =
        tr
            .slice(
                0,
                period
            )
            .reduce(
                (a, b) =>
                    a + b,
                0
            );


    let smoothedPlus =
        plusDM
            .slice(
                0,
                period
            )
            .reduce(
                (a, b) =>
                    a + b,
                0
            );


    let smoothedMinus =
        minusDM
            .slice(
                0,
                period
            )
            .reduce(
                (a, b) =>
                    a + b,
                0
            );


    const dx = [];


    for (
        let i = period - 1;
        i < tr.length;
        i++
    ) {

        if (
            i >= period
        ) {

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


        if (
            smoothedTR <= 0
        ) {

            continue;

        }


        const plusDI =
            (
                smoothedPlus /
                smoothedTR
            ) *
            100;


        const minusDI =
            (
                smoothedMinus /
                smoothedTR
            ) *
            100;


        const denominator =
            plusDI +
            minusDI;


        if (
            denominator <= 0
        ) {

            continue;

        }


        const dxValue =
            Math.abs(
                plusDI -
                minusDI
            ) /
            denominator *
            100;


        const candleIndex =
            i + 1;


        plusValues[
            candleIndex
        ] =
            plusDI;


        minusValues[
            candleIndex
        ] =
            minusDI;


        dx.push({
            candleIndex,
            value: dxValue
        });

    }


    if (
        dx.length < period
    ) {

        return {
            adx: adxValues,
            plus: plusValues,
            minus: minusValues
        };

    }


    let adx =
        dx
            .slice(
                0,
                period
            )
            .reduce(
                (sum, item) =>
                    sum + item.value,
                0
            ) /
        period;


    adxValues[
        dx[
            period - 1
        ].candleIndex
    ] =
        adx;


    for (
        let i = period;
        i < dx.length;
        i++
    ) {

        adx =
            (
                adx *
                (period - 1) +
                dx[i].value
            ) /
            period;


        adxValues[
            dx[i].candleIndex
        ] =
            adx;

    }


    return {

        adx:
            adxValues,

        plus:
            plusValues,

        minus:
            minusValues

    };

}


/* =========================================================
   SIMPLE MOVING AVERAGE
========================================================= */

function smaSeries(
    arr,
    length = 20
) {

    const result =
        new Array(
            arr.length
        )
            .fill(null);


    if (
        !Array.isArray(arr) ||
        arr.length < length
    ) {

        return result;

    }


    let sum = 0;


    for (
        let i = 0;
        i < arr.length;
        i++
    ) {

        const close =
            Number(
                arr[i].c
            );


        if (
            !Number.isFinite(close)
        ) {

            continue;

        }


        sum +=
            close;


        if (
            i >= length
        ) {

            sum -=
                Number(
                    arr[
                        i - length
                    ].c
                );

        }


        if (
            i >= length - 1
        ) {

            result[i] =
                sum / length;

        }

    }


    return result;

}


/* =========================================================
   MACD
========================================================= */

function macdSeries(arr) {

    const closes =
        arr.map(
            candle =>
                Number(
                    candle.c
                )
        );


    const ema12 =
        emaSeriesGlobal(
            closes,
            12
        );


    const ema26 =
        emaSeriesGlobal(
            closes,
            26
        );


    const macd =
        new Array(
            arr.length
        )
            .fill(null);


    for (
        let i = 0;
        i < arr.length;
        i++
    ) {

        if (
            Number.isFinite(
                ema12[i]
            ) &&
            Number.isFinite(
                ema26[i]
            )
        ) {

            macd[i] =
                ema12[i] -
                ema26[i];

        }

    }


    const signal =
        new Array(
            arr.length
        )
            .fill(null);


    const validMacd = [];


    for (
        let i = 0;
        i < macd.length;
        i++
    ) {

        if (
            Number.isFinite(
                macd[i]
            )
        ) {

            validMacd.push({
                index: i,
                value: macd[i]
            });

        }

    }


    if (
        validMacd.length >= 9
    ) {

        let signalValue =
            validMacd
                .slice(
                    0,
                    9
                )
                .reduce(
                    (sum, item) =>
                        sum + item.value,
                    0
                ) /
            9;


        signal[
            validMacd[8].index
        ] =
            signalValue;


        const k =
            2 /
            (9 + 1);


        for (
            let i = 9;
            i < validMacd.length;
            i++
        ) {

            signalValue =
                validMacd[i].value *
                k +
                signalValue *
                (1 - k);


            signal[
                validMacd[i].index
            ] =
                signalValue;

        }

    }


    return {

        macd,

        signal

    };

}


/* =========================================================
   RSI SERIES
========================================================= */

function rsiSeries(
    arr,
    length = 14
) {

    const result =
        new Array(
            arr.length
        )
            .fill(null);


    if (
        !Array.isArray(arr) ||
        arr.length <= length
    ) {

        return result;

    }


    let gainSum = 0;
    let lossSum = 0;


    for (
        let i = 1;
        i <= length;
        i++
    ) {

        const current =
            Number(
                arr[i].c
            );


        const previous =
            Number(
                arr[i - 1].c
            );


        const diff =
            current -
            previous;


        if (
            diff > 0
        ) {

            gainSum +=
                diff;

        }
        else {

            lossSum +=
                Math.abs(
                    diff
                );

        }

    }


    let avgGain =
        gainSum /
        length;


    let avgLoss =
        lossSum /
        length;


    function calculateRSI() {

        if (
            avgLoss === 0
        ) {

            return 100;

        }


        if (
            avgGain === 0
        ) {

            return 0;

        }


        const rs =
            avgGain /
            avgLoss;


        return (
            100 -
            (
                100 /
                (1 + rs)
            )
        );

    }


    result[length] =
        calculateRSI();


    for (
        let i = length + 1;
        i < arr.length;
        i++
    ) {

        const current =
            Number(
                arr[i].c
            );


        const previous =
            Number(
                arr[i - 1].c
            );


        const diff =
            current -
            previous;


        const gain =
            diff > 0
                ? diff
                : 0;


        const loss =
            diff < 0
                ? Math.abs(diff)
                : 0;


        avgGain =
            (
                avgGain *
                (length - 1) +
                gain
            ) /
            length;


        avgLoss =
            (
                avgLoss *
                (length - 1) +
                loss
            ) /
            length;


        result[i] =
            calculateRSI();

    }


    return result;

}


/* =========================================================
   EXTENDED INDICATOR HELPERS
========================================================= */

function cciSeries(
    arr,
    length = 20
) {

    const tp =
        typicalPriceSeries(
            arr
        );


    const ma =
        rollingMean(
            tp,
            length
        );


    const out =
        new Array(
            arr.length
        )
            .fill(null);


    for (
        let i = length - 1;
        i < arr.length;
        i++
    ) {

        const w =
            tp.slice(
                i -
                length +
                1,
                i + 1
            );


        const m =
            ma[i];


        if (
            !Number.isFinite(m)
        ) {

            continue;

        }


        const md =
            w.reduce(
                (s, v) =>
                    s +
                    Math.abs(
                        Number(v) -
                        m
                    ),
                0
            ) /
            length;


        if (
            md > 0
        ) {

            out[i] =
                (
                    Number(tp[i]) -
                    m
                ) /
                (
                    0.015 *
                    md
                );

        }

    }


    return out;

}


function momentumSeries(
    values,
    length = 10
) {

    return values.map(
        (v, i) =>
            i >= length &&
                Number.isFinite(
                    Number(v)
                ) &&
                Number.isFinite(
                    Number(
                        values[
                        i - length
                        ]
                    )
                )
                ? Number(v) -
                Number(
                    values[
                    i - length
                    ]
                )
                : null
    );

}


function rocSeries(
    values,
    length = 10
) {

    return values.map(
        (v, i) => {

            const p =
                Number(
                    values[
                    i - length
                    ]
                );


            return (
                i >= length &&
                Number.isFinite(
                    Number(v)
                ) &&
                Number.isFinite(p) &&
                p !== 0
            )
                ? (
                    (
                        Number(v) -
                        p
                    ) /
                    p
                ) *
                100
                : null;

        }
    );

}


function tsiSeries(
    values,
    long = 25,
    short = 13
) {

    const mom =
        values.map(
            (v, i) =>
                i
                    ? Number(v) -
                    Number(
                        values[
                        i - 1
                        ]
                    )
                    : 0
        );


    const abs =
        mom.map(
            v =>
                Math.abs(v)
        );


    const e1 =
        emaSeriesGlobal(
            mom,
            long
        );


    const e2 =
        emaSeriesGlobal(
            e1.map(
                v =>
                    Number.isFinite(v)
                        ? v
                        : 0
            ),
            short
        );


    const a1 =
        emaSeriesGlobal(
            abs,
            long
        );


    const a2 =
        emaSeriesGlobal(
            a1.map(
                v =>
                    Number.isFinite(v)
                        ? v
                        : 0
            ),
            short
        );


    return e2.map(
        (v, i) =>
            Number.isFinite(v) &&
                Number.isFinite(a2[i]) &&
                a2[i] !== 0
                ? 100 *
                v /
                a2[i]
                : null
    );

}

/* =========================================================
   EXTENDED INDICATOR
========================================================= */

export function getExtendedIndicator(
    name,
    arr
) {

    const c =
        numSeries(arr);


    const tp =
        typicalPriceSeries(arr);


    switch (name) {

        case "Moving Average":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "MA20",
                        values:
                            rollingMean(
                                c,
                                20
                            )
                    }
                ]
            };


        case "WMA":

        case "Moving Average Weighted":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "WMA20",
                        values:
                            wmaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "HMA":

        case "Hull Moving Average":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "HMA20",
                        values:
                            hmaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "VWMA":

        case "Volume-Weighted Moving Average":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "VWMA20",
                        values:
                            vwmaSeries(
                                arr,
                                20
                            )
                    }
                ]
            };


        case "Double EMA":

        case "DEMA":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "DEMA20",
                        values:
                            demaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Triple EMA":

        case "TEMA":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "TEMA20",
                        values:
                            temaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Moving Average Triple":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "TEMA20",
                        values:
                            temaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Moving Average Double":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "DEMA20",
                        values:
                            demaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Smoothed Moving Average":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "SMMA20",
                        values:
                            rmaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Arnaud Legoux Moving Average":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "ALMA20",
                        values:
                            almaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "McGinley Dynamic":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "McGinley14",
                        values:
                            mcGinleySeries(
                                c,
                                14
                            )
                    }
                ]
            };


        case "Least Squares Moving Average":

        case "Linear Regression Curve":

        case "Linear Regression":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "LinReg20",
                        values:
                            linRegSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Linear Regression Slope":
            return {
                panel: "panel",
                series: [
                    {
                        name: "LinReg Slope",
                        values:
                            linRegSlopeSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Moving Average Adaptive":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "Adaptive MA",
                        values:
                            emaSeriesGlobal(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Moving Average Hamming":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "Hamming MA",
                        values:
                            rollingMean(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Moving Average Multiple":

        case "Guppy Multiple Moving Average":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "MA5",
                        values:
                            emaSeriesGlobal(
                                c,
                                5
                            )
                    },
                    {
                        name: "MA10",
                        values:
                            emaSeriesGlobal(
                                c,
                                10
                            )
                    },
                    {
                        name: "MA15",
                        values:
                            emaSeriesGlobal(
                                c,
                                15
                            )
                    },
                    {
                        name: "MA20",
                        values:
                            emaSeriesGlobal(
                                c,
                                20
                            )
                    },
                    {
                        name: "MA30",
                        values:
                            emaSeriesGlobal(
                                c,
                                30
                            )
                    },
                    {
                        name: "MA40",
                        values:
                            emaSeriesGlobal(
                                c,
                                40
                            )
                    },
                    {
                        name: "MA50",
                        values:
                            emaSeriesGlobal(
                                c,
                                50
                            )
                    }
                ]
            };


        case "Moving Average Channel":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "MA High",
                        values:
                            rollingMean(
                                arr.map(
                                    x =>
                                        Number(x.h)
                                ),
                                20
                            )
                    },
                    {
                        name: "MA Low",
                        values:
                            rollingMean(
                                arr.map(
                                    x =>
                                        Number(x.l)
                                ),
                                20
                            )
                    }
                ]
            };


        case "MA Cross":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "MA20",
                        values:
                            rollingMean(
                                c,
                                20
                            )
                    },
                    {
                        name: "MA50",
                        values:
                            rollingMean(
                                c,
                                50
                            )
                    }
                ]
            };


        case "MA with EMA Cross":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "MA20",
                        values:
                            rollingMean(
                                c,
                                20
                            )
                    },
                    {
                        name: "EMA50",
                        values:
                            emaSeriesGlobal(
                                c,
                                50
                            )
                    }
                ]
            };


        case "EMA Cross":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "EMA20",
                        values:
                            emaSeriesGlobal(
                                c,
                                20
                            )
                    },
                    {
                        name: "EMA50",
                        values:
                            emaSeriesGlobal(
                                c,
                                50
                            )
                    }
                ]
            };


        case "ADX":
            return {
                panel: "panel",
                series: [
                    {
                        name: "ADX",
                        values:
                            adxSeries(
                                arr
                            ).adx
                    }
                ]
            };


        case "Directional Movement": {

            const adx =
                adxSeries(
                    arr
                );


            return {
                panel: "panel",
                series: [
                    {
                        name: "+DI",
                        values:
                            adx.plus
                    },
                    {
                        name: "-DI",
                        values:
                            adx.minus
                    }
                ]
            };

        }


        case "Aroon": {

            const a =
                aroonSeries(
                    arr,
                    14
                );


            return {
                panel: "panel",
                series: [
                    {
                        name: "Aroon Up",
                        values:
                            a.up
                    },
                    {
                        name: "Aroon Down",
                        values:
                            a.down
                    }
                ]
            };

        }


        case "Aroon Oscillator":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Aroon Oscillator",
                        values:
                            aroonSeries(
                                arr,
                                14
                            ).osc
                    }
                ]
            };


        case "Ichimoku Cloud": {

            const i =
                ichimokuSeries(
                    arr
                );


            return {
                panel: "overlay",
                series: [
                    {
                        name: "Conversion",
                        values:
                            i.conversion
                    },
                    {
                        name: "Base",
                        values:
                            i.base
                    },
                    {
                        name: "Span A",
                        values:
                            i.spanA
                    },
                    {
                        name: "Span B",
                        values:
                            i.spanB
                    }
                ]
            };

        }


        case "Parabolic SAR":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "PSAR",
                        values:
                            psarSeries(
                                arr
                            )
                    }
                ]
            };


        case "SuperTrend": {

            const s =
                superTrendSeries(
                    arr
                );


            return {
                panel: "overlay",
                series: [
                    {
                        name: "SuperTrend",
                        values:
                            s.value
                    }
                ]
            };

        }


        case "Trend Strength Index":
            return {
                panel: "panel",
                series: [
                    {
                        name: "TSI",
                        values:
                            tsiSeries(
                                c
                            )
                    }
                ]
            };


        case "RSI":
            return {
                panel: "panel",
                series: [
                    {
                        name: "RSI14",
                        values:
                            rsiSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "Stochastic": {

            const s =
                stochasticSeries(
                    arr,
                    14,
                    3,
                    3
                );


            return {
                panel: "panel",
                series: [
                    {
                        name: "%K",
                        values:
                            s.k
                    },
                    {
                        name: "%D",
                        values:
                            s.d
                    }
                ]
            };

        }


        case "Stochastic RSI": {

            const rsi =
                rsiSeries(
                    arr,
                    14
                );


            const raw =
                rsi.map(
                    (value, i) => {

                        if (
                            i < 13 ||
                            !Number.isFinite(
                                value
                            )
                        ) {

                            return null;

                        }


                        const window =
                            rsi.slice(
                                i - 13,
                                i + 1
                            );


                        const valid =
                            window.filter(
                                Number.isFinite
                            );


                        if (
                            valid.length !== 14
                        ) {

                            return null;

                        }


                        const min =
                            Math.min(
                                ...valid
                            );


                        const max =
                            Math.max(
                                ...valid
                            );


                        return max === min
                            ? 0
                            : (
                                (
                                    value -
                                    min
                                ) /
                                (
                                    max -
                                    min
                                )
                            ) *
                            100;

                    }
                );


            return {
                panel: "panel",
                series: [
                    {
                        name: "Stoch RSI",
                        values:
                            raw
                    }
                ]
            };

        }


        case "CCI":
            return {
                panel: "panel",
                series: [
                    {
                        name: "CCI20",
                        values:
                            cciSeries(
                                arr,
                                20
                            )
                    }
                ]
            };


        case "Momentum":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Momentum",
                        values:
                            momentumSeries(
                                c,
                                10
                            )
                    }
                ]
            };


        case "ROC":
            return {
                panel: "panel",
                series: [
                    {
                        name: "ROC",
                        values:
                            rocSeries(
                                c,
                                12
                            )
                    }
                ]
            };


        case "Williams %R":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Williams %R",
                        values:
                            williamsRSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "Ultimate Oscillator":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Ultimate Oscillator",
                        values:
                            ultimateOscillatorSeries(
                                arr
                            )
                    }
                ]
            };


        case "OBV":

        case "On Balance Volume":
            return {
                panel: "panel",
                series: [
                    {
                        name: "OBV",
                        values:
                            obvSeries(
                                arr
                            )
                    }
                ]
            };


        case "Volume":

        case "Volume Oscillator":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Volume",
                        values:
                            numSeries(
                                arr,
                                "v"
                            )
                    }
                ]
            };


        case "Money Flow Index":

        case "MFI":
            return {
                panel: "panel",
                series: [
                    {
                        name: "MFI14",
                        values:
                            mfiSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "Volume Price Trend":
            return {
                panel: "panel",
                series: [
                    {
                        name: "VPT",
                        values:
                            performanceSeries(
                                c
                            )
                    }
                ]
            };


        case "Volume Weighted Average Price":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "VWAP",
                        values:
                            arr.map(
                                (_, i) =>
                                    calcVWAP(
                                        arr.slice(
                                            0,
                                            i + 1
                                        )
                                    )
                            )
                    }
                ]
            };


        case "Bollinger Bands": {

            const b =
                bollingerSeries(
                    arr
                );


            return {
                panel: "overlay",
                series: [
                    {
                        name: "BB Mid",
                        values:
                            b.mid
                    },
                    {
                        name: "BB Upper",
                        values:
                            b.upper
                    },
                    {
                        name: "BB Lower",
                        values:
                            b.lower
                    }
                ]
            };

        }


        case "Bollinger Bands %B": {

            const b =
                bollingerSeries(
                    arr
                );


            return {
                panel: "panel",
                series: [
                    {
                        name: "BB %B",
                        values:
                            b.percentB
                    }
                ]
            };

        }


        case "Bollinger Bands Width": {

            const b =
                bollingerSeries(
                    arr
                );


            return {
                panel: "panel",
                series: [
                    {
                        name: "BB Width",
                        values:
                            b.width
                    }
                ]
            };

        }


        case "ATR":
        case "Average True Range":
            return {
                panel: "panel",
                series: [
                    {
                        name: "ATR14",
                        values:
                            atrSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "Donchian Channels": {

            const d =
                donchianSeries(
                    arr,
                    20
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Donchian High",
                        values:
                            d.high
                    },
                    {
                        name: "Donchian Middle",
                        values:
                            d.mid
                    },
                    {
                        name: "Donchian Low",
                        values:
                            d.low
                    }
                ]
            };

        }


        case "Keltner Channels": {

            const k =
                keltnerSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Keltner Middle",
                        values:
                            k.mid
                    },
                    {
                        name: "Keltner Upper",
                        values:
                            k.upper
                    },
                    {
                        name: "Keltner Lower",
                        values:
                            k.lower
                    }
                ]
            };

        }


        case "Envelopes": {

            const e =
                envelopesSeries(
                    c,
                    20,
                    0.025
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Envelope Middle",
                        values:
                            e.mid
                    },
                    {
                        name: "Envelope Upper",
                        values:
                            e.upper
                    },
                    {
                        name: "Envelope Lower",
                        values:
                            e.lower
                    }
                ]
            };

        }


        case "Pivot Points Standard": {

            const p =
                pivotLevels(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Pivot",
                        values:
                            p.pivot
                    },
                    {
                        name: "R1",
                        values:
                            p.r1
                    },
                    {
                        name: "R2",
                        values:
                            p.r2
                    },
                    {
                        name: "R3",
                        values:
                            p.r3
                    },
                    {
                        name: "S1",
                        values:
                            p.s1
                    },
                    {
                        name: "S2",
                        values:
                            p.s2
                    },
                    {
                        name: "S3",
                        values:
                            p.s3
                    }
                ]
            };

        }


        case "Support & Resistance": {

            const sr =
                calcSR(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Resistance",
                        values:
                            arr.map(
                                () =>
                                    sr.resistance
                            )
                    },
                    {
                        name: "Support",
                        values:
                            arr.map(
                                () =>
                                    sr.support
                            )
                    }
                ]
            };

        }


        case "Structure": {

            const structureData =
                structure(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Structure High",
                        values:
                            structureData.high
                    },
                    {
                        name: "Structure Low",
                        values:
                            structureData.low
                    }
                ]
            };

        }


        case "Highest High":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "Highest High",
                        values:
                            highestSeries(
                                arr,
                                20
                            )
                    }
                ]
            };


        case "Lowest Low":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "Lowest Low",
                        values:
                            lowestSeries(
                                arr,
                                20
                            )
                    }
                ]
            };


        case "Standard Deviation":
            return {
                panel: "panel",
                series: [
                    {
                        name: "StdDev",
                        values:
                            stdevSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Performance":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Performance",
                        values:
                            performanceSeries(
                                c
                            )
                    }
                ]
            };


        case "Volume Oscillator":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Volume Oscillator",
                        values:
                            volumeOscSeries(
                                arr,
                                5,
                                20
                            )
                    }
                ]
            };


        case "Chande Momentum Oscillator": {

            const momentum =
                momentumSeries(
                    c,
                    14
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "CMO",
                        values:
                            momentum
                    }
                ]
            };

        }


        case "Trend Strength":

        case "Trend Strength Index":
            return {
                panel: "panel",
                series: [
                    {
                        name: "TSI",
                        values:
                            tsiSeries(
                                c
                            )
                    }
                ]
            };


        case "ROC":
            return {
                panel: "panel",
                series: [
                    {
                        name: "ROC",
                        values:
                            rocSeries(
                                c,
                                12
                            )
                    }
                ]
            };


        case "Rate of Change":
            return {
                panel: "panel",
                series: [
                    {
                        name: "ROC",
                        values:
                            rocSeries(
                                c,
                                12
                            )
                    }
                ]
            };


        case "Momentum":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Momentum",
                        values:
                            momentumSeries(
                                c,
                                10
                            )
                    }
                ]
            };


        case "Relative Strength Index":
            return {
                panel: "panel",
                series: [
                    {
                        name: "RSI14",
                        values:
                            rsiSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "Commodity Channel Index":
            return {
                panel: "panel",
                series: [
                    {
                        name: "CCI20",
                        values:
                            cciSeries(
                                arr,
                                20
                            )
                    }
                ]
            };


        case "Money Flow Index":
            return {
                panel: "panel",
                series: [
                    {
                        name: "MFI14",
                        values:
                            mfiSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "Williams %R":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Williams %R",
                        values:
                            williamsRSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "Ultimate Oscillator":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Ultimate Oscillator",
                        values:
                            ultimateOscillatorSeries(
                                arr
                            )
                    }
                ]
            };


        case "Stochastic Oscillator": {

            const s =
                stochasticSeries(
                    arr,
                    14,
                    3,
                    3
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "%K",
                        values:
                            s.k
                    },
                    {
                        name: "%D",
                        values:
                            s.d
                    }
                ]
            };

        }


        case "On Balance Volume":
            return {
                panel: "panel",
                series: [
                    {
                        name: "OBV",
                        values:
                            obvSeries(
                                arr
                            )
                    }
                ]
            };


        case "Parabolic SAR":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "PSAR",
                        values:
                            psarSeries(
                                arr
                            )
                    }
                ]
            };


        case "SuperTrend": {

            const st =
                superTrendSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "SuperTrend",
                        values:
                            st.value
                    }
                ]
            };

        }


        case "Ichimoku": {

            const i =
                ichimokuSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Conversion",
                        values:
                            i.conversion
                    },
                    {
                        name: "Base",
                        values:
                            i.base
                    },
                    {
                        name: "Span A",
                        values:
                            i.spanA
                    },
                    {
                        name: "Span B",
                        values:
                            i.spanB
                    }
                ]
            };

        }


        case "Average Directional Index": {

            const a =
                adxSeries(
                    arr
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "ADX",
                        values:
                            a.adx
                    },
                    {
                        name: "+DI",
                        values:
                            a.plus
                    },
                    {
                        name: "-DI",
                        values:
                            a.minus
                    }
                ]
            };

        }


        case "Aroon Indicator": {

            const a =
                aroonSeries(
                    arr,
                    14
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "Aroon Up",
                        values:
                            a.up
                    },
                    {
                        name: "Aroon Down",
                        values:
                            a.down
                    },
                    {
                        name: "Aroon Oscillator",
                        values:
                            a.osc
                    }
                ]
            };

        }


        case "Bollinger Band Width": {

            const b =
                bollingerSeries(
                    arr
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "BB Width",
                        values:
                            b.width
                    }
                ]
            };

        }


        case "Bollinger %B": {

            const b =
                bollingerSeries(
                    arr
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "BB %B",
                        values:
                            b.percentB
                    }
                ]
            };

        }


        case "Keltner Channel": {

            const k =
                keltnerSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Keltner Middle",
                        values:
                            k.mid
                    },
                    {
                        name: "Keltner Upper",
                        values:
                            k.upper
                    },
                    {
                        name: "Keltner Lower",
                        values:
                            k.lower
                    }
                ]
            };

        }


        case "Donchian Channel": {

            const d =
                donchianSeries(
                    arr,
                    20
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Donchian High",
                        values:
                            d.high
                    },
                    {
                        name: "Donchian Middle",
                        values:
                            d.mid
                    },
                    {
                        name: "Donchian Low",
                        values:
                            d.low
                    }
                ]
            };

        }

        case "VWAP":
case "Volume Weighted Average Price": {
    const vwapValues = [];

    let cumulativePV = 0;
    let cumulativeVolume = 0;
    let currentDate = null;

    for (let i = 0; i < arr.length; i++) {
        const candle = arr[i];

        const timeString = String(candle.time);
        const date = timeString.slice(0, 10);
        const time = timeString.slice(11, 16);

        const high = Number(candle.h);
        const low = Number(candle.l);
        const close = Number(candle.c);
        const volume = Number(candle.v);

        // New trading day → reset VWAP
        if (date !== currentDate) {
            currentDate = date;
            cumulativePV = 0;
            cumulativeVolume = 0;
        }

        // Outside NSE session
        if (
            time < "09:15" ||
            time > "15:30" ||
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close) ||
            !Number.isFinite(volume) ||
            volume <= 0
        ) {
            vwapValues.push(null);
            continue;
        }

        const typicalPrice =
            (high + low + close) / 3;

        cumulativePV +=
            typicalPrice * volume;

        cumulativeVolume += volume;

        const vwap =
            cumulativeVolume > 0
                ? cumulativePV / cumulativeVolume
                : null;

        vwapValues.push(vwap);
    }

    return {
        panel: "overlay",
        series: [
            {
                name: "VWAP",
                values: vwapValues
            }
        ]
    };
}


        case "Volume Profile": {

            const volumes =
                arr.map(
                    x =>
                        Number(x.v) || 0
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "Volume",
                        values:
                            volumes
                    }
                ]
            };

        }


        case "Relative Volume":

        case "Relative Volume at Time": {

            const volumes =
                arr.map(
                    x =>
                        Number(x.v) || 0
                );

            const result =
                volumes.map(
                    (value, i) => {

                        if (i < 19) {
                            return null;
                        }

                        const window =
                            volumes.slice(
                                i - 19,
                                i
                            );

                        const valid =
                            window.filter(
                                Number.isFinite
                            );

                        if (!valid.length) {
                            return null;
                        }

                        const average =
                            valid.reduce(
                                (
                                    sum,
                                    item
                                ) =>
                                    sum + item,
                                0
                            ) /
                            valid.length;

                        if (
                            average === 0
                        ) {
                            return null;
                        }

                        return value /
                            average;
                    }
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "Relative Volume",
                        values:
                            result
                    }
                ]
            };

        }


        case "Accumulation/Distribution": {

            const result = [];

            let cumulative = 0;

            for (
                let i = 0;
                i < arr.length;
                i++
            ) {

                const high =
                    Number(
                        arr[i].h
                    );

                const low =
                    Number(
                        arr[i].l
                    );

                const close =
                    Number(
                        arr[i].c
                    );

                const volume =
                    Number(
                        arr[i].v
                    ) || 0;

                if (
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
                    result.push(
                        null
                    );
                    continue;
                }

                const range =
                    high - low;

                const moneyFlow =
                    range === 0
                        ? 0
                        : (
                            (
                                (
                                    close -
                                    low
                                ) -
                                (
                                    high -
                                    close
                                )
                            ) /
                            range
                        ) *
                        volume;

                cumulative +=
                    moneyFlow;

                result.push(
                    cumulative
                );
            }

            return {
                panel: "panel",
                series: [
                    {
                        name: "A/D",
                        values:
                            result
                    }
                ]
            };

        }


        case "Chaikin Money Flow": {

            const result = [];

            for (
                let i = 0;
                i < arr.length;
                i++
            ) {

                if (i < 19) {
                    result.push(
                        null
                    );
                    continue;
                }

                let moneyVolume = 0;
                let volumeTotal = 0;

                for (
                    let j = i - 19;
                    j <= i;
                    j++
                ) {

                    const high =
                        Number(
                            arr[j].h
                        );

                    const low =
                        Number(
                            arr[j].l
                        );

                    const close =
                        Number(
                            arr[j].c
                        );

                    const volume =
                        Number(
                            arr[j].v
                        ) || 0;

                    const range =
                        high - low;

                    const multiplier =
                        range === 0
                            ? 0
                            : (
                                (
                                    (
                                        close -
                                        low
                                    ) -
                                    (
                                        high -
                                        close
                                    )
                                ) /
                                range
                            );

                    moneyVolume +=
                        multiplier *
                        volume;

                    volumeTotal +=
                        volume;
                }

                result.push(
                    volumeTotal === 0
                        ? null
                        : moneyVolume /
                        volumeTotal
                );
            }

            return {
                panel: "panel",
                series: [
                    {
                        name: "CMF",
                        values:
                            result
                    }
                ]
            };

        }


        case "TRIX": {

            const ema1 =
                emaSeriesGlobal(
                    c,
                    15
                );

            const ema2 =
                emaSeriesGlobal(
                    ema1.map(
                        value =>
                            Number.isFinite(
                                value
                            )
                                ? value
                                : null
                    ),
                    15
                );

            const ema3 =
                emaSeriesGlobal(
                    ema2.map(
                        value =>
                            Number.isFinite(
                                value
                            )
                                ? value
                                : null
                    ),
                    15
                );

            const result =
                ema3.map(
                    (value, i) => {

                        if (
                            i === 0 ||
                            !Number.isFinite(
                                value
                            ) ||
                            !Number.isFinite(
                                ema3[i - 1]
                            ) ||
                            ema3[i - 1] === 0
                        ) {
                            return null;
                        }

                        return (
                            (
                                value -
                                ema3[i - 1]
                            ) /
                            ema3[i - 1]
                        ) *
                            100;
                    }
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "TRIX",
                        values:
                            result
                    }
                ]
            };

        }


        case "Force Index": {

            const result = [];

            for (
                let i = 0;
                i < arr.length;
                i++
            ) {

                if (i === 0) {
                    result.push(
                        null
                    );
                    continue;
                }

                const currentClose =
                    Number(
                        arr[i].c
                    );

                const previousClose =
                    Number(
                        arr[i - 1].c
                    );

                const volume =
                    Number(
                        arr[i].v
                    ) || 0;

                if (
                    !Number.isFinite(
                        currentClose
                    ) ||
                    !Number.isFinite(
                        previousClose
                    )
                ) {
                    result.push(
                        null
                    );
                    continue;
                }

                result.push(
                    (
                        currentClose -
                        previousClose
                    ) *
                    volume
                );
            }

            return {
                panel: "panel",
                series: [
                    {
                        name: "Force Index",
                        values:
                            result
                    }
                ]
            };

        }


        case "Ease of Movement": {

            const result = [];

            for (
                let i = 0;
                i < arr.length;
                i++
            ) {

                if (i === 0) {
                    result.push(
                        null
                    );
                    continue;
                }

                const high =
                    Number(
                        arr[i].h
                    );

                const low =
                    Number(
                        arr[i].l
                    );

                const previousHigh =
                    Number(
                        arr[i - 1].h
                    );

                const previousLow =
                    Number(
                        arr[i - 1].l
                    );

                const volume =
                    Number(
                        arr[i].v
                    ) || 0;

                const distanceMoved =
                    (
                        high +
                        low
                    ) / 2 -
                    (
                        previousHigh +
                        previousLow
                    ) / 2;

                const boxRatio =
                    volume === 0
                        ? 0
                        : volume /
                        (
                            high -
                            low
                            || 1
                        );

                result.push(
                    boxRatio === 0
                        ? null
                        : distanceMoved /
                        boxRatio
                );
            }

            return {
                panel: "panel",
                series: [
                    {
                        name: "EOM",
                        values:
                            result
                    }
                ]
            };

        }


        case "Chaikin Oscillator": {

            const ad = [];

            let cumulative = 0;

            for (
                let i = 0;
                i < arr.length;
                i++
            ) {

                const high =
                    Number(
                        arr[i].h
                    );

                const low =
                    Number(
                        arr[i].l
                    );

                const close =
                    Number(
                        arr[i].c
                    );

                const volume =
                    Number(
                        arr[i].v
                    ) || 0;

                const range =
                    high - low;

                const moneyFlow =
                    range === 0
                        ? 0
                        : (
                            (
                                (
                                    close -
                                    low
                                ) -
                                (
                                    high -
                                    close
                                )
                            ) /
                            range
                        ) *
                        volume;

                cumulative +=
                    moneyFlow;

                ad.push(
                    cumulative
                );
            }

            const fast =
                emaSeriesGlobal(
                    ad,
                    3
                );

            const slow =
                emaSeriesGlobal(
                    ad,
                    10
                );

            const result =
                fast.map(
                    (value, i) => {

                        if (
                            !Number.isFinite(
                                value
                            ) ||
                            !Number.isFinite(
                                slow[i]
                            )
                        ) {
                            return null;
                        }

                        return value -
                            slow[i];
                    }
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "Chaikin",
                        values:
                            result
                    }
                ]
            };

        }


        case "Awesome Oscillator": {

            const median =
                arr.map(
                    x => {

                        const high =
                            Number(
                                x.h
                            );

                        const low =
                            Number(
                                x.l
                            );

                        return (
                            high +
                            low
                        ) / 2;
                    }
                );

            const fast =
                rollingMean(
                    median,
                    5
                );

            const slow =
                rollingMean(
                    median,
                    34
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "AO",
                        values:
                            fast.map(
                                (
                                    value,
                                    i
                                ) => {

                                    if (
                                        !Number.isFinite(
                                            value
                                        ) ||
                                        !Number.isFinite(
                                            slow[i]
                                        )
                                    ) {
                                        return null;
                                    }

                                    return value -
                                        slow[i];
                                }
                            )
                    }
                ]
            };

        }


        case "Stochastic RSI": {

            const baseRSI =
                rsiSeries(
                    arr,
                    14
                );

            const result = [];

            for (
                let i = 0;
                i < baseRSI.length;
                i++
            ) {

                if (i < 13) {
                    result.push(
                        null
                    );
                    continue;
                }

                const window =
                    baseRSI.slice(
                        i - 13,
                        i + 1
                    );

                const valid =
                    window.filter(
                        Number.isFinite
                    );

                if (
                    valid.length !== 14
                ) {
                    result.push(
                        null
                    );
                    continue;
                }

                const minimum =
                    Math.min(
                        ...valid
                    );

                const maximum =
                    Math.max(
                        ...valid
                    );

                result.push(
                    maximum === minimum
                        ? 0
                        : (
                            (
                                baseRSI[i] -
                                minimum
                            ) /
                            (
                                maximum -
                                minimum
                            )
                        ) *
                        100
                );
            }

            return {
                panel: "panel",
                series: [
                    {
                        name: "Stoch RSI",
                        values:
                            result
                    }
                ]
            };

        }


        case "Pivot Points": {

            const p =
                pivotLevels(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Pivot",
                        values:
                            p.pivot
                    },
                    {
                        name: "R1",
                        values:
                            p.r1
                    },
                    {
                        name: "R2",
                        values:
                            p.r2
                    },
                    {
                        name: "R3",
                        values:
                            p.r3
                    },
                    {
                        name: "S1",
                        values:
                            p.s1
                    },
                    {
                        name: "S2",
                        values:
                            p.s2
                    },
                    {
                        name: "S3",
                        values:
                            p.s3
                    }
                ]
            };

        }

        case "Price Rate of Change":
            return {
                panel: "panel",
                series: [
                    {
                        name: "ROC",
                        values:
                            rocSeries(
                                c,
                                12
                            )
                    }
                ]
            };


        case "True Strength Index":
            return {
                panel: "panel",
                series: [
                    {
                        name: "TSI",
                        values:
                            tsiSeries(
                                c
                            )
                    }
                ]
            };


        case "Average True Range":
            return {
                panel: "panel",
                series: [
                    {
                        name: "ATR14",
                        values:
                            atrSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "Standard Deviation":
            return {
                panel: "panel",
                series: [
                    {
                        name: "StdDev",
                        values:
                            stdevSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Highest High Value":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "Highest High",
                        values:
                            highestSeries(
                                arr,
                                20
                            )
                    }
                ]
            };


        case "Lowest Low Value":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "Lowest Low",
                        values:
                            lowestSeries(
                                arr,
                                20
                            )
                    }
                ]
            };


        case "Price Channel": {

            const high =
                highestSeries(
                    arr,
                    20
                );

            const low =
                lowestSeries(
                    arr,
                    20
                );

            const middle =
                high.map(
                    (
                        value,
                        i
                    ) => {

                        if (
                            !Number.isFinite(
                                value
                            ) ||
                            !Number.isFinite(
                                low[i]
                            )
                        ) {
                            return null;
                        }

                        return (
                            value +
                            low[i]
                        ) / 2;
                    }
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Channel High",
                        values:
                            high
                    },
                    {
                        name: "Channel Middle",
                        values:
                            middle
                    },
                    {
                        name: "Channel Low",
                        values:
                            low
                    }
                ]
            };

        }


        case "Donchian Channels":

        case "Donchian Channel": {

            const d =
                donchianSeries(
                    arr,
                    20
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Donchian High",
                        values:
                            d.high
                    },
                    {
                        name: "Donchian Middle",
                        values:
                            d.mid
                    },
                    {
                        name: "Donchian Low",
                        values:
                            d.low
                    }
                ]
            };

        }


        case "Keltner Channels":

        case "Keltner Channel": {

            const k =
                keltnerSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Keltner Middle",
                        values:
                            k.mid
                    },
                    {
                        name: "Keltner Upper",
                        values:
                            k.upper
                    },
                    {
                        name: "Keltner Lower",
                        values:
                            k.lower
                    }
                ]
            };

        }


        case "Envelope":

        case "Moving Average Envelopes": {

            const e =
                envelopesSeries(
                    c,
                    20,
                    0.025
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Envelope Middle",
                        values:
                            e.mid
                    },
                    {
                        name: "Envelope Upper",
                        values:
                            e.upper
                    },
                    {
                        name: "Envelope Lower",
                        values:
                            e.lower
                    }
                ]
            };

        }


        case "Performance":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Performance",
                        values:
                            performanceSeries(
                                c
                            )
                    }
                ]
            };


        case "Volume":

        case "Volume Bars":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Volume",
                        values:
                            arr.map(
                                x =>
                                    Number(
                                        x.v
                                    ) || 0
                            )
                    }
                ]
            };


        case "OBV":

        case "On Balance Volume":
            return {
                panel: "panel",
                series: [
                    {
                        name: "OBV",
                        values:
                            obvSeries(
                                arr
                            )
                    }
                ]
            };


        case "Money Flow Index":

        case "MFI":
            return {
                panel: "panel",
                series: [
                    {
                        name: "MFI",
                        values:
                            mfiSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "Ease of Movement":

        case "EOM": {

            const result = [];

            for (
                let i = 0;
                i < arr.length;
                i++
            ) {

                if (i === 0) {
                    result.push(
                        null
                    );
                    continue;
                }

                const high =
                    Number(
                        arr[i].h
                    );

                const low =
                    Number(
                        arr[i].l
                    );

                const previousHigh =
                    Number(
                        arr[i - 1].h
                    );

                const previousLow =
                    Number(
                        arr[i - 1].l
                    );

                const volume =
                    Number(
                        arr[i].v
                    ) || 0;

                const distance =
                    (
                        high +
                        low
                    ) / 2 -
                    (
                        previousHigh +
                        previousLow
                    ) / 2;

                const range =
                    high -
                    low;

                if (
                    volume === 0 ||
                    range === 0
                ) {
                    result.push(
                        null
                    );
                    continue;
                }

                result.push(
                    distance /
                    (
                        volume /
                        range
                    )
                );
            }

            return {
                panel: "panel",
                series: [
                    {
                        name: "EOM",
                        values:
                            result
                    }
                ]
            };

        }


        case "Force Index": {

            const result = [];

            for (
                let i = 0;
                i < arr.length;
                i++
            ) {

                if (i === 0) {
                    result.push(
                        null
                    );
                    continue;
                }

                const close =
                    Number(
                        arr[i].c
                    );

                const previousClose =
                    Number(
                        arr[i - 1].c
                    );

                const volume =
                    Number(
                        arr[i].v
                    ) || 0;

                if (
                    !Number.isFinite(
                        close
                    ) ||
                    !Number.isFinite(
                        previousClose
                    )
                ) {
                    result.push(
                        null
                    );
                    continue;
                }

                result.push(
                    (
                        close -
                        previousClose
                    ) *
                    volume
                );
            }

            return {
                panel: "panel",
                series: [
                    {
                        name: "Force Index",
                        values:
                            result
                    }
                ]
            };

        }


        case "Accumulation/Distribution":

        case "A/D Line": {

            const result = [];

            let cumulative = 0;

            for (
                let i = 0;
                i < arr.length;
                i++
            ) {

                const high =
                    Number(
                        arr[i].h
                    );

                const low =
                    Number(
                        arr[i].l
                    );

                const close =
                    Number(
                        arr[i].c
                    );

                const volume =
                    Number(
                        arr[i].v
                    ) || 0;

                if (
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
                    result.push(
                        null
                    );
                    continue;
                }

                const range =
                    high -
                    low;

                const multiplier =
                    range === 0
                        ? 0
                        : (
                            (
                                close -
                                low
                            ) -
                            (
                                high -
                                close
                            )
                        ) /
                        range;

                cumulative +=
                    multiplier *
                    volume;

                result.push(
                    cumulative
                );
            }

            return {
                panel: "panel",
                series: [
                    {
                        name: "A/D",
                        values:
                            result
                    }
                ]
            };

        }


        case "Linear Regression":
        case "Linear Regression Curve":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "LinReg20",
                        values:
                            linRegSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Linear Regression Slope":
            return {
                panel: "panel",
                series: [
                    {
                        name: "LinReg Slope",
                        values:
                            linRegSlopeSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Aroon": {

            const a =
                aroonSeries(
                    arr,
                    14
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "Aroon Up",
                        values:
                            a.up
                    },
                    {
                        name: "Aroon Down",
                        values:
                            a.down
                    }
                ]
            };

        }


        case "Aroon Oscillator": {

            const a =
                aroonSeries(
                    arr,
                    14
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "Aroon Oscillator",
                        values:
                            a.osc
                    }
                ]
            };

        }


        case "SuperTrend": {

            const st =
                superTrendSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "SuperTrend",
                        values:
                            st.value
                    }
                ]
            };

        }


        case "Parabolic SAR":

        case "PSAR":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "PSAR",
                        values:
                            psarSeries(
                                arr
                            )
                    }
                ]
            };


        case "Ichimoku Cloud":

        case "Ichimoku": {

            const i =
                ichimokuSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Conversion",
                        values:
                            i.conversion
                    },
                    {
                        name: "Base",
                        values:
                            i.base
                    },
                    {
                        name: "Span A",
                        values:
                            i.spanA
                    },
                    {
                        name: "Span B",
                        values:
                            i.spanB
                    }
                ]
            };

        }

        case "Moving Average":

        case "Simple Moving Average":

        case "SMA":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "SMA20",
                        values:
                            smaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Exponential Moving Average":

        case "EMA":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "EMA20",
                        values:
                            emaSeriesGlobal(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Weighted Moving Average":

        case "WMA":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "WMA20",
                        values:
                            wmaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Hull Moving Average":

        case "HMA":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "HMA20",
                        values:
                            hmaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Double Exponential Moving Average":

        case "DEMA":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "DEMA20",
                        values:
                            demaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Triple Exponential Moving Average":

        case "TEMA":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "TEMA20",
                        values:
                            temaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "Smoothed Moving Average":

        case "RMA":

        case "SMMA":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "RMA20",
                        values:
                            rmaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "ALMA":

        case "Arnaud Legoux Moving Average":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "ALMA20",
                        values:
                            almaSeries(
                                c,
                                20
                            )
                    }
                ]
            };


        case "McGinley Dynamic":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "McGinley",
                        values:
                            mcGinleySeries(
                                c,
                                14
                            )
                    }
                ]
            };


        case "VWMA":

        case "Volume Weighted Moving Average":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "VWMA20",
                        values:
                            vwmaSeries(
                                arr,
                                20
                            )
                    }
                ]
            };


        case "Bollinger Bands":

        case "BB": {

            const b =
                bollingerSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "BB Upper",
                        values:
                            b.upper
                    },
                    {
                        name: "BB Middle",
                        values:
                            b.mid
                    },
                    {
                        name: "BB Lower",
                        values:
                            b.lower
                    }
                ]
            };

        }


        case "Bollinger Bands %B":

        case "BB %B": {

            const b =
                bollingerSeries(
                    arr
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "BB %B",
                        values:
                            b.percentB
                    }
                ]
            };

        }


        case "Bollinger Bands Width":

        case "BB Width": {

            const b =
                bollingerSeries(
                    arr
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "BB Width",
                        values:
                            b.width
                    }
                ]
            };

        }


        case "Stochastic":

        case "Stochastic Oscillator": {

            const s =
                stochasticSeries(
                    arr,
                    14,
                    3,
                    3
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "%K",
                        values:
                            s.k
                    },
                    {
                        name: "%D",
                        values:
                            s.d
                    }
                ]
            };

        }


        case "Williams %R":

        case "Williams R":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Williams %R",
                        values:
                            williamsRSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "Ultimate Oscillator":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Ultimate Oscillator",
                        values:
                            ultimateOscillatorSeries(
                                arr
                            )
                    }
                ]
            };


        case "OBV":

        case "On Balance Volume":
            return {
                panel: "panel",
                series: [
                    {
                        name: "OBV",
                        values:
                            obvSeries(
                                arr
                            )
                    }
                ]
            };


        case "Volume Oscillator":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Volume Oscillator",
                        values:
                            volumeOscSeries(
                                arr,
                                5,
                                20
                            )
                    }
                ]
            };


        case "MFI":

        case "Money Flow Index":
            return {
                panel: "panel",
                series: [
                    {
                        name: "MFI14",
                        values:
                            mfiSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "CCI":

        case "Commodity Channel Index":
            return {
                panel: "panel",
                series: [
                    {
                        name: "CCI20",
                        values:
                            cciSeries(
                                arr,
                                20
                            )
                    }
                ]
            };


        case "Momentum":
            return {
                panel: "panel",
                series: [
                    {
                        name: "Momentum",
                        values:
                            momentumSeries(
                                c,
                                10
                            )
                    }
                ]
            };


        case "ROC":

        case "Rate of Change":
            return {
                panel: "panel",
                series: [
                    {
                        name: "ROC",
                        values:
                            rocSeries(
                                c,
                                12
                            )
                    }
                ]
            };


        case "TSI":

        case "True Strength Index":
            return {
                panel: "panel",
                series: [
                    {
                        name: "TSI",
                        values:
                            tsiSeries(
                                c
                            )
                    }
                ]
            };


        case "ATR":

        case "Average True Range":
            return {
                panel: "panel",
                series: [
                    {
                        name: "ATR14",
                        values:
                            atrSeries(
                                arr,
                                14
                            )
                    }
                ]
            };


        case "ADX":

        case "Average Directional Index": {

            const a =
                adxSeries(
                    arr
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "ADX",
                        values:
                            a.adx
                    },
                    {
                        name: "+DI",
                        values:
                            a.plus
                    },
                    {
                        name: "-DI",
                        values:
                            a.minus
                    }
                ]
            };

        }


        case "Aroon":

        case "Aroon Indicator": {

            const a =
                aroonSeries(
                    arr,
                    14
                );

            return {
                panel: "panel",
                series: [
                    {
                        name: "Aroon Up",
                        values:
                            a.up
                    },
                    {
                        name: "Aroon Down",
                        values:
                            a.down
                    },
                    {
                        name: "Aroon Oscillator",
                        values:
                            a.osc
                    }
                ]
            };

        }


        case "Donchian":

        case "Donchian Channel":

        case "Donchian Channels": {

            const d =
                donchianSeries(
                    arr,
                    20
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Donchian High",
                        values:
                            d.high
                    },
                    {
                        name: "Donchian Middle",
                        values:
                            d.mid
                    },
                    {
                        name: "Donchian Low",
                        values:
                            d.low
                    }
                ]
            };

        }


        case "Keltner":

        case "Keltner Channel":

        case "Keltner Channels": {

            const k =
                keltnerSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Keltner Upper",
                        values:
                            k.upper
                    },
                    {
                        name: "Keltner Middle",
                        values:
                            k.mid
                    },
                    {
                        name: "Keltner Lower",
                        values:
                            k.lower
                    }
                ]
            };

        }


        case "Envelopes":

        case "Moving Average Envelopes": {

            const e =
                envelopesSeries(
                    c,
                    20,
                    0.025
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Envelope Upper",
                        values:
                            e.upper
                    },
                    {
                        name: "Envelope Middle",
                        values:
                            e.mid
                    },
                    {
                        name: "Envelope Lower",
                        values:
                            e.lower
                    }
                ]
            };

        }


        case "Parabolic SAR":

        case "PSAR":
            return {
                panel: "overlay",
                series: [
                    {
                        name: "PSAR",
                        values:
                            psarSeries(
                                arr
                            )
                    }
                ]
            };


        case "SuperTrend": {

            const st =
                superTrendSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "SuperTrend",
                        values:
                            st.value
                    }
                ]
            };

        }


        case "Ichimoku":

        case "Ichimoku Cloud": {

            const i =
                ichimokuSeries(
                    arr
                );

            return {
                panel: "overlay",
                series: [
                    {
                        name: "Conversion",
                        values:
                            i.conversion
                    },
                    {
                        name: "Base",
                        values:
                            i.base
                    },
                    {
                        name: "Span A",
                        values:
                            i.spanA
                    },
                    {
                        name: "Span B",
                        values:
                            i.spanB
                    }
                ]
            };

        }

        default:
            return null;
    }
}


/* =========================================================
   GLOBAL EMA SERIES
========================================================= */

export function emaSeriesGlobal(
    values,
    period
) {

    const result =
        new Array(
            values.length
        ).fill(null);

    if (
        !Array.isArray(values) ||
        values.length === 0 ||
        period <= 0
    ) {
        return result;
    }

    const alpha =
        2 /
        (period + 1);

    let previous = null;

    for (
        let i = 0;
        i < values.length;
        i++
    ) {

        const value =
            Number(
                values[i]
            );

        if (
            !Number.isFinite(
                value
            )
        ) {
            continue;
        }

        if (
            previous === null
        ) {
            previous =
                value;
        } else {

            previous =
                alpha *
                value +
                (
                    1 - alpha
                ) *
                previous;
        }

        result[i] =
            previous;
    }

    return result;
}


/* =========================================================
   MAIN ENGINE
========================================================= */

export function engine(arr) {

    const closes =
        arr.map(
            x => Number(x.c)
        );


    const price =
        closes.at(-1);


    /* =====================================================
       EMA
    ===================================================== */

    const e9 =
        EMA(
            closes,
            9
        );

    const e21 =
        EMA(
            closes,
            21
        );

    const e30 =
        EMA(
            closes,
            30
        );

    const e50 =
        EMA(
            closes,
            50
        );

    const e100 =
        EMA(
            closes,
            100
        );


    /* =====================================================
       VWAP
    ===================================================== */

    const w =
        calcVWAP(
            arr
        );


    /* =====================================================
       RSI
    ===================================================== */

    const r =
        RSI(
            closes,
            14
        );


    /* =====================================================
       ADX
    ===================================================== */

    const adx =
        calcADX(
            arr
        );


    /* =====================================================
       STRUCTURE
    ===================================================== */

    const st =
        structure(
            arr
        );


    /* =====================================================
       SUPPORT / RESISTANCE
    ===================================================== */

    const sr =
        calcSR(
            arr
        );


    /* =====================================================
       RELATIVE VOLUME
    ===================================================== */

    const volumeValues =
        arr
            .slice(
                -21,
                -1
            )
            .map(
                x =>
                    Number(x.v)
            )
            .filter(
                v =>
                    Number.isFinite(v) &&
                    v > 0
            );


    const currentVolume =
        Number(
            arr.at(-1)?.v
        );


    let relativeVolume =
        null;


    if (
        Number.isFinite(
            currentVolume
        ) &&
        currentVolume > 0 &&
        volumeValues.length >= 5
    ) {

        const averageVolume =
            volumeValues.reduce(
                (
                    sum,
                    v
                ) =>
                    sum + v,
                0
            ) /
            volumeValues.length;


        if (
            Number.isFinite(
                averageVolume
            ) &&
            averageVolume > 0
        ) {

            relativeVolume =
                currentVolume /
                averageVolume;

        }

    }


    /* =====================================================
       EMA TREND
    ===================================================== */

    let emaTrend;


    if (
        price > e30 &&
        e30 > e50 &&
        e50 > e100
    ) {

        emaTrend =
            "🟢 BULL";

    }
    else if (
        price < e30 &&
        e30 < e50 &&
        e50 < e100
    ) {

        emaTrend =
            "🔴 BEAR";

    }
    else {

        emaTrend =
            "🟡 MIXED";

    }


    /* =====================================================
       VWAP
    ===================================================== */

    const vwapBull =
        Number.isFinite(w)
            ? price > w
            : null;


    /* =====================================================
       RSI
    ===================================================== */

    const rsiBull =
        r > 55;


    const rsiBear =
        r < 45;


    /* =====================================================
       SENTIMENT
    ===================================================== */

    let sentiment =
        50;


    /* EMA TREND */

    if (
        emaTrend.includes(
            "BULL"
        )
    ) {

        sentiment +=
            18;

    }
    else if (
        emaTrend.includes(
            "BEAR"
        )
    ) {

        sentiment -=
            18;

    }


    /* VWAP */

    if (
        Number.isFinite(w)
    ) {

        if (
            price > w
        ) {

            sentiment +=
                10;

        }
        else if (
            price < w
        ) {

            sentiment -=
                10;

        }

    }


    /* RSI */

    if (
        rsiBull
    ) {

        sentiment +=
            10;

    }
    else if (
        rsiBear
    ) {

        sentiment -=
            10;

    }


    /* ADX DIRECTION */

    if (
        Number.isFinite(
            adx.plus
        ) &&
        Number.isFinite(
            adx.minus
        )
    ) {

        if (
            adx.plus >
            adx.minus
        ) {

            sentiment +=
                12;

        }
        else if (
            adx.minus >
            adx.plus
        ) {

            sentiment -=
                12;

        }

    }


    /* STRUCTURE */

    if (
        st.includes(
            "BULLISH"
        )
    ) {

        sentiment +=
            10;

    }
    else if (
        st.includes(
            "BEARISH"
        )
    ) {

        sentiment -=
            10;

    }


    /* VOLUME */

    if (
        Number.isFinite(
            relativeVolume
        )
    ) {

        if (
            relativeVolume > 1.5
        ) {

            sentiment +=
                5;

        }
        else if (
            relativeVolume < 0.75
        ) {

            sentiment -=
                5;

        }

    }


    /* =====================================================
       LIMIT SENTIMENT
    ===================================================== */

    sentiment =
        Math.max(
            0,
            Math.min(
                100,
                Math.round(
                    sentiment
                )
            )
        );


    /* =====================================================
       STRENGTH
    ===================================================== */

    let strength =
        null;


    if (
        Number.isFinite(
            adx.adx
        ) &&
        Number.isFinite(
            r
        )
    ) {

        strength =
            Math.min(
                100,
                Math.round(
                    adx.adx * 1.5 +
                    Math.abs(
                        r - 50
                    ) * 0.7
                )
            );

    }


    /* =====================================================
       BUY / SELL
    ===================================================== */

    let buy =
        null;

    let sell =
        null;


    if (
        Number.isFinite(
            sentiment
        )
    ) {

        buy =
            Math.max(
                0,
                Math.min(
                    100,
                    Math.round(
                        sentiment
                    )
                )
            );


        sell =
            100 -
            buy;

    }


    /* =====================================================
       SCORE
    ===================================================== */

    let score =
        0;


    /* EMA */

    if (
        price > e30 &&
        e30 > e50 &&
        e50 > e100
    ) {

        score +=
            30;

    }


    if (
        price < e30 &&
        e30 < e50 &&
        e50 < e100
    ) {

        score -=
            30;

    }


    /* VWAP */

    if (
        Number.isFinite(w)
    ) {

        if (
            price > w
        ) {

            score +=
                20;

        }
        else if (
            price < w
        ) {

            score -=
                20;

        }

    }


    /* RSI */

    if (
        r > 55
    ) {

        score +=
            20;

    }


    if (
        r < 45
    ) {

        score -=
            20;

    }


    /* ADX DIRECTION */

    if (
        Number.isFinite(
            adx.plus
        ) &&
        Number.isFinite(
            adx.minus
        )
    ) {

        if (
            adx.plus >
            adx.minus
        ) {

            score +=
                15;

        }
        else if (
            adx.minus >
            adx.plus
        ) {

            score -=
                15;

        }

    }


    /* STRUCTURE */

    if (
        st.includes(
            "BULLISH"
        )
    ) {

        score +=
            15;

    }


    if (
        st.includes(
            "BEARISH"
        )
    ) {

        score -=
            15;

    }


    /* =====================================================
       CONFIDENCE
    ===================================================== */

    const confidence =
        Math.max(
            0,
            Math.min(
                100,
                Math.round(
                    50 +
                    score / 2
                )
            )
        );


    /* =====================================================
       FINAL
    ===================================================== */

    let final;


    if (
        confidence >= 70
    ) {

        final =
            "🟢 BUY";

    }
    else if (
        confidence <= 30
    ) {

        final =
            "🔴 SELL";

    }
    else {

        final =
            "🟡 WAIT";

    }


    /* =====================================================
       RETURN — ORIGINAL DASHBOARD STRUCTURE
    ===================================================== */

    return {

        p: price,

        /* New EMAs */
        e9: e9,
        e21: e21,

        /* Existing EMAs */
        e30: e30,
        e50: e50,
        e100: e100,

        w:
            w,

        R:
            r,

        D: {

            A:
                adx.adx,

            P:
                adx.plus,

            N:
                adx.minus

        },

        S:
            st,

        Z:
            sr,

        rel:
            relativeVolume,

        sentiment:
            sentiment,

        strength:
            strength,

        buy:
            buy,

        sell:
            sell,

        conf:
            confidence,

        final:
            final,

        emaTrend:
            emaTrend

    };

}


/* =========================================================
   CALCULATE STOCK
========================================================= */

export function calcFor(
    arr
) {

    return engine(
        arr
    );

}

