/* =========================================================
   TRADING ENGINE
========================================================= */

import {
    EMA,
    RSI,
    calcVWAP,
    calcADX
} from "./indicators";


/* =========================================================
   STRUCTURE
========================================================= */

function structure(arr) {

    const n =
        arr.length;

    if (
        n < 8
    ) {
        return "🟡 Mixed";
    }

    const recent =
        arr.slice(
            n - 8
        );

    const highs =
        recent.map(
            x => Number(x.h)
        );

    const lows =
        recent.map(
            x => Number(x.l)
        );

    const mid =
        Math.floor(
            highs.length / 2
        );

    const oldHigh =
        Math.max(
            ...highs.slice(
                0,
                mid
            )
        );

    const newHigh =
        Math.max(
            ...highs.slice(
                mid
            )
        );

    const oldLow =
        Math.min(
            ...lows.slice(
                0,
                mid
            )
        );

    const newLow =
        Math.min(
            ...lows.slice(
                mid
            )
        );

    if (
        newHigh > oldHigh &&
        newLow > oldLow
    ) {

        return "🟢 BULLISH HH/HL";

    }

    if (
        newHigh < oldHigh &&
        newLow < oldLow
    ) {

        return "🔴 BEARISH LH/LL";

    }

    return "🟡 Mixed";
}


/* =========================================================
   SUPPORT / RESISTANCE
========================================================= */

function calcSR(arr) {

    if (
        !Array.isArray(arr) ||
        arr.length < 5
    ) {

        return {
            resistance: null,
            support: null,
            signal: "🟡 N/A"
        };

    }


    const candles =
        arr;


    const swingHighs = [];
    const swingLows = [];


    /*
     * Find local swing highs / lows.
     */

    for (
        let i = 2;
        i < candles.length - 2;
        i++
    ) {

        const high =
            Number(
                candles[i].h
            );

        const low =
            Number(
                candles[i].l
            );


        if (
            !Number.isFinite(high) ||
            !Number.isFinite(low)
        ) {
            continue;
        }


        if (
            high >
            Number(candles[i - 1].h) &&

            high >
            Number(candles[i - 2].h) &&

            high >
            Number(candles[i + 1].h) &&

            high >
            Number(candles[i + 2].h)
        ) {

            swingHighs.push(
                high
            );

        }


        if (
            low <
            Number(candles[i - 1].l) &&

            low <
            Number(candles[i - 2].l) &&

            low <
            Number(candles[i + 1].l) &&

            low <
            Number(candles[i + 2].l)
        ) {

            swingLows.push(
                low
            );

        }

    }


    const price =
        Number(
            arr.at(-1).c
        );


    if (
        !Number.isFinite(price)
    ) {

        return {
            resistance: null,
            support: null,
            signal: "🟡 N/A"
        };

    }


    /*
     * Resistance = nearest swing high above price.
     * Support = nearest swing low below price.
     */

    const resistanceCandidates =
        swingHighs
            .filter(
                level =>
                    level > price
            )
            .sort(
                (a, b) =>
                    a - b
            );


    const supportCandidates =
        swingLows
            .filter(
                level =>
                    level < price
            )
            .sort(
                (a, b) =>
                    b - a
            );


    const resistance =
        resistanceCandidates.length
            ? resistanceCandidates[0]
            : null;


    const support =
        supportCandidates.length
            ? supportCandidates[0]
            : null;


    /*
     * Determine S/R state.
     */

    let signal =
        "🟡 Range";


    if (
        resistance !== null &&
        price > resistance
    ) {

        signal =
            "🟢 Breakout";

    }
    else if (
        support !== null &&
        price < support
    ) {

        signal =
            "🔴 Breakdown";

    }
    else if (
        resistance !== null &&
        Math.abs(
            price - resistance
        ) /
        resistance < 0.002
    ) {

        signal =
            "🟠 Near Resistance";

    }
    else if (
        support !== null &&
        Math.abs(
            price - support
        ) /
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


/* =========================================================
   MAIN ENGINE
========================================================= */

export function engine(arr) {

    if (
        !Array.isArray(arr) ||
        !arr.length
    ) {

        return {

            p: null,

            e30: null,
            e50: null,
            e100: null,

            w: null,
            R: null,

            D: {
                A: null,
                P: null,
                N: null
            },

            S: "🟡 N/A",

            Z: {
                resistance: null,
                support: null,
                signal: "🟡 N/A"
            },

            rel: null,

            sentiment: null,
            strength: null,

            buy: null,
            sell: null,

            conf: 0,

            final: "🟡 WAIT",

            emaTrend: "🟡 MIXED"

        };

    }


    const closes =
        arr.map(
            x => Number(x.c)
        );


    const price =
        closes.at(-1);


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


    const w =
        calcVWAP(
            arr
        );


    const r =
        RSI(
            closes,
            14
        );


    const adx =
        calcADX(
            arr
        );


    const st =
        structure(
            arr
        );


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

        sentiment += 18;

    }
    else if (
        emaTrend.includes(
            "BEAR"
        )
    ) {

        sentiment -= 18;

    }


    /* VWAP */

    if (
        Number.isFinite(w)
    ) {

        if (
            price > w
        ) {

            sentiment += 10;

        }
        else if (
            price < w
        ) {

            sentiment -= 10;

        }

    }


    /* RSI */

    if (
        rsiBull
    ) {

        sentiment += 10;

    }
    else if (
        rsiBear
    ) {

        sentiment -= 10;

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

            sentiment += 5;

        }
        else if (
            adx.minus >
            adx.plus
        ) {

            sentiment -= 5;

        }

    }


    /* LIMIT */

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

        score += 30;

    }


    if (
        price < e30 &&
        e30 < e50 &&
        e50 < e100
    ) {

        score -= 30;

    }


    /* VWAP */

    if (
        Number.isFinite(w)
    ) {

        if (
            price > w
        ) {

            score += 20;

        }
        else if (
            price < w
        ) {

            score -= 20;

        }

    }


    /* RSI */

    if (
        r > 55
    ) {

        score += 20;

    }


    if (
        r < 45
    ) {

        score -= 20;

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

            score += 15;

        }
        else if (
            adx.minus >
            adx.plus
        ) {

            score -= 15;

        }

    }


    /* STRUCTURE */

    if (
        st.includes(
            "BULLISH"
        )
    ) {

        score += 15;

    }


    if (
        st.includes(
            "BEARISH"
        )
    ) {

        score -= 15;

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
       RETURN
    ===================================================== */

    return {

        p: price,

        e30: e30,

        e50: e50,

        e100: e100,

        w: w,

        R: r,

        D: {

            A: adx.adx,

            P: adx.plus,

            N: adx.minus

        },

        S: st,

        Z: sr,

        rel: relativeVolume,

        sentiment: sentiment,

        strength: strength,

        buy: buy,

        sell: sell,

        conf: confidence,

        final: final,

        emaTrend: emaTrend

    };

}


/* =========================================================
   CALCULATE STOCK
========================================================= */

export function calcFor(arr) {

    return engine(
        arr
    );

}