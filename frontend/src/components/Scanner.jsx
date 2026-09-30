import React, {
  useEffect,
  useRef,
  useState
} from "react";


/* =========================================================
   STOCKS FOR FIRST TEST
========================================================= */




/* =========================================================
   MINI CHART
========================================================= */

function MiniChart({ candles }) {

  if (
    !Array.isArray(candles) ||
    candles.length < 2
  ) {
    return (
      <div className="miniChartEmpty">
        No chart data
      </div>
    );
  }

  const recent =
    candles.slice(-40);

  const values =
    recent.map(
      candle =>
        Number(candle.close)
    );

  const min =
    Math.min(...values);

  const max =
    Math.max(...values);

  const range =
    max - min || 1;

  const points =
    values
      .map((value, index) => {

        const x =
          (index /
            (values.length - 1)) *
          100;

        const y =
          90 -
          ((value - min) /
            range) *
          75;

        return `${x},${y}`;

      })
      .join(" ");

  return (
    <div className="miniChart">

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >

        <polyline
          points={points}
          fill="none"
          stroke="#22c55e"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />

      </svg>

      <div className="miniChartPrice">
        ₹
        {values[
          values.length - 1
        ].toFixed(2)}
      </div>

    </div>
  );
}


/* =========================================================
   INDICATOR HELPERS
========================================================= */

function sma(values, period) {

  if (
    values.length <
    period
  ) {
    return null;
  }

  const recent =
    values.slice(
      values.length - period
    );

  return (
    recent.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / period
  );
}


function ema(values, period) {

  if (!Array.isArray(values) || values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);

  /*
   * EMA is calculated over the COMPLETE chronological NSE history
   * returned by the backend. The backend now fetches a large warm-up
   * window so the first 20 candles are not the effective history start.
   */
  let result =
    values
      .slice(0, period)
      .reduce((sum, value) => sum + Number(value), 0) / period;

  for (let i = period; i < values.length; i++) {
    const value = Number(values[i]);

    if (!Number.isFinite(value)) {
      return null;
    }

    result = ((value - result) * multiplier) + result;
  }

  return result;
}


/* =========================================================
   CANDLE NORMALIZATION
   Keep the scanner calculation strictly chronological and remove
   duplicate timestamps before calculating EMA/conditions.
========================================================= */

function prepareCandles(candles) {

  if (!Array.isArray(candles)) {
    return [];
  }

  const sorted = [...candles]
    .filter(candle => candle && Number.isFinite(Number(candle.close)))
    .sort((a, b) => {
      const aTime = new Date(a.time).getTime();
      const bTime = new Date(b.time).getTime();
      return aTime - bTime;
    });

  const unique = [];
  const seen = new Set();

  for (const candle of sorted) {
    const timestamp = new Date(candle.time).getTime();

    // If the API has no usable timestamp, keep the candle rather than
    // accidentally dropping it.
    if (!Number.isFinite(timestamp)) {
      unique.push(candle);
      continue;
    }

    if (seen.has(timestamp)) {
      continue;
    }

    seen.add(timestamp);
    unique.push(candle);
  }

  return unique;
}


function getEmaDiagnostics(candles, period = 20) {

  const closes = candles.map(candle => Number(candle.close));
  const emaValue = ema(closes, period);
  const latest = candles[candles.length - 1];

  return {
    candleCount: candles.length,
    latestTime: latest?.time ?? null,
    latestOpen: Number(latest?.open),
    latestHigh: Number(latest?.high),
    latestLow: Number(latest?.low),
    latestClose: Number(latest?.close),
    ema20: emaValue,
    passes: emaValue !== null && Number(latest?.close) > emaValue,
    previousTime: candles[candles.length - 2]?.time ?? null,
    previousClose: Number(candles[candles.length - 2]?.close),
  };
}


/* =========================================================
   CONDITION CHECK
========================================================= */

function checkCondition(condition, candles, latestChange = null) {

  if (!candles || candles.length === 0) {
    return false;
  }

  const closes = candles.map(
    candle => Number(candle.close)
  );

  const volumes = candles.map(
    candle => Number(candle.volume)
  );

  const latestClose =
    closes[closes.length - 1];

  const latestVolume =
    volumes[volumes.length - 1];


  /* =====================================================
     CLOSE > EMA 20
  ===================================================== */

  if (
    condition.type === "close_above_ema20" ||
    condition.type === "close_above_ema"
  ) {

    const period = Number(condition.period || 20);
    const emaValue = ema(closes, period);

    if (emaValue === null) {
      return false;
    }

    return latestClose > emaValue;
  }


  /* =====================================================
     CLOSE < EMA
  ===================================================== */

  if (
    condition.type === "close_below_ema20" ||
    condition.type === "close_below_ema"
  ) {

    const period = Number(condition.period || 20);
    const emaValue = ema(closes, period);

    if (emaValue === null) {
      return false;
    }

    return latestClose < emaValue;
  }


  /* =====================================================
     5M VOLUME > 2 × SMA(10)
  ===================================================== */

  if (condition.type === "volume_2x_sma10") {

    if (volumes.length < 10) {
      return false;
    }

    const volumeSma10 = sma(volumes, 10);

    if (volumeSma10 === null) {
      return false;
    }

    return latestVolume > (2 * volumeSma10);
  }


  /* =====================================================
     VOLUME > MULTIPLE × SMA(VOLUME, PERIOD)
  ===================================================== */

  if (condition.type === "volume_multiple_sma") {

    const period = Number(condition.period || 10);
    const multiplier = Number(condition.multiplier || 2);

    if (volumes.length < period) {
      return false;
    }

    const volumeSma = sma(volumes, period);

    if (volumeSma === null) {
      return false;
    }

    return latestVolume > (multiplier * volumeSma);
  }


  /* =====================================================
     VOLUME > SMA(VOLUME, PERIOD)
  ===================================================== */

  if (condition.type === "volume_above_sma") {

    const period = Number(condition.period || 10);

    if (volumes.length < period) {
      return false;
    }

    const volumeSma = sma(volumes, period);

    if (volumeSma === null) {
      return false;
    }

    return latestVolume > volumeSma;
  }


  /* =====================================================
     5 CONSECUTIVE GREEN 5M CANDLES
  ===================================================== */

  if (condition.type === "five_green") {

    if (candles.length < 5) {
      return false;
    }

    const lastFive =
      candles.slice(-5);

    return lastFive.every(
      candle =>
        Number(candle.close) >
        Number(candle.open)
    );
  }


  /* =====================================================
     PRICE ABOVE
  ===================================================== */

  if (condition.type === "price_above") {

    if (
      condition.value === undefined ||
      condition.value === ""
    ) {
      return false;
    }

    return (
      latestClose >
      Number(condition.value)
    );
  }


  /* =====================================================
     PRICE BELOW
  ===================================================== */

  if (condition.type === "price_below") {

    if (
      condition.value === undefined ||
      condition.value === ""
    ) {
      return false;
    }

    return (
      latestClose <
      Number(condition.value)
    );
  }


  /* =====================================================
     DAILY % CHANGE
  ===================================================== */

  if (condition.type === "change_above") {
    if (!Number.isFinite(Number(latestChange))) {
      return false;
    }

    return Number(latestChange) > Number(condition.value);
  }


  if (condition.type === "change_below") {
    if (!Number.isFinite(Number(latestChange))) {
      return false;
    }

    return Number(latestChange) < Number(condition.value);
  }


  return false;
}


/* =========================================================
   INDICATOR TOGGLE
   Compact ON/OFF switch used by every scanner condition.
========================================================= */

function IndicatorToggle({ enabled, onChange }) {
  const isOn = enabled !== false;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={isOn ? "Disable indicator" : "Enable indicator"}
      onClick={() => onChange(!isOn)}
      style={{
        position: "relative",
        width: "42px",
        height: "22px",
        minWidth: "42px",
        padding: 0,
        border: "1px solid #29496e",
        borderRadius: "999px",
        background: isOn ? "#1464c5" : "#263247",
        cursor: "pointer",
        transition: "background 0.18s ease",
        flexShrink: 0
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "2px",
          left: isOn ? "21px" : "2px",
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
          transition: "left 0.18s ease"
        }}
      />
    </button>
  );
}

/* =========================================================
   MAIN SCANNER
========================================================= */

function Scanner() {


  const [scannerStocks, setScannerStocks] = useState([]);

  // Prevent the first persistence effect from overwriting the state that is
  // being restored from localStorage during the initial page load.
  const restoredScannerStateRef = useRef(false);

  useEffect(() => {
    loadScannerStocks();

    try {
      const stored = JSON.parse(
        localStorage.getItem("ema360_saved_scans") || "[]"
      );

      if (Array.isArray(stored)) {
        setSavedScans(stored);
      }

      // Restore the complete screener state so a refresh does not clear the
      // active indicators, timeframe, search, page, or matched stocks.
      const scannerState = JSON.parse(
        localStorage.getItem("ema360_scanner_state") || "null"
      );

      if (scannerState && typeof scannerState === "object") {
        if (Array.isArray(scannerState.conditions)) {
          setConditions(
            scannerState.conditions.map(condition => ({
              ...condition,
              enabled: condition.enabled !== false
            }))
          );
        }

        if (scannerState.timeframe) {
          setTimeframe(scannerState.timeframe);
        }

        if (typeof scannerState.generatedText === "string") {
          setGeneratedText(scannerState.generatedText);
        }

        if (Array.isArray(scannerState.results)) {
          setResults(scannerState.results);
        }

        if (typeof scannerState.stockSearch === "string") {
          setStockSearch(scannerState.stockSearch);
        }

        if (Number.isFinite(Number(scannerState.currentPage))) {
          setCurrentPage(Math.max(1, Number(scannerState.currentPage)));
        }
      }
    } catch (error) {
      console.warn("Could not restore scanner state:", error);
    } finally {
      restoredScannerStateRef.current = true;
    }
  }, []);

  async function loadScannerStocks() {
    try {
      const response = await fetch(
        "http://localhost:3000/api/scanner/nse/stocks"
      );

      const data = await response.json();

      if (data.success) {
        setScannerStocks(data.stocks);

        console.log(
          "NSE stocks loaded:",
          data.stocks.length
        );
      }
    } catch (error) {
      console.error(
        "Failed to load NSE stocks:",
        error
      );
    }
  }

  const [
    conditions,
    setConditions
  ] = useState([
    {
      type: "close_above_ema20",
      enabled: true
    }
  ]);

  // Timeframe used by every condition in the current scan.
  const [
    timeframe,
    setTimeframe
  ] = useState("5m");


  const [
    results,
    setResults
  ] = useState([]);


  const [
    loading,
    setLoading
  ] = useState(false);


  const [
    hoveredStock,
    setHoveredStock
  ] = useState(null);


  const [
    generatedText,
    setGeneratedText
  ] = useState(
    ""
  );

  // Magic Filter mode: Append keeps existing conditions, Replace clears them.
  const [magicMode, setMagicMode] = useState("append");
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicMessage, setMagicMessage] = useState("");
  const magicAbortRef = useRef(null);

  // Saved scans live in the browser so they survive page refreshes without
  // adding another database just for scanner presets.
  const [savedScans, setSavedScans] = useState([]);
  const [showSavedScans, setShowSavedScans] = useState(false);

  // Backtest results are fetched from the NSE backend.
  const [backtestBusy, setBacktestBusy] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null);
  const [showBacktest, setShowBacktest] = useState(false);

  // Alert configuration is stored in the backend while the server is running.
  const [alertBusy, setAlertBusy] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

  // Search only the stocks currently returned by the scanner.
  // This does not change the NSE scan logic or conditions.
  const [
    stockSearch,
    setStockSearch
  ] = useState("");

  // Pagination for the result table.
  const [
    currentPage,
    setCurrentPage
  ] = useState(1);

  const stocksPerPage = 20;

  // Persist the active scanner so a browser refresh restores the same
  // indicators and matched stocks instead of returning to the defaults.
  useEffect(() => {
    if (!restoredScannerStateRef.current) return;

    try {
      // Keep enough candles for the hover chart while avoiding a huge
      // localStorage payload. The stock result itself remains fully intact.
      const compactResults = results.slice(0, 100).map(stock => ({
        ...stock,
        candles: Array.isArray(stock.candles)
          ? stock.candles.slice(-60)
          : []
      }));

      localStorage.setItem(
        "ema360_scanner_state",
        JSON.stringify({
          conditions,
          timeframe,
          generatedText,
          results: compactResults,
          stockSearch,
          currentPage,
          savedAt: new Date().toISOString()
        })
      );
    } catch (error) {
      // If the browser storage quota is exceeded, keep the scanner usable.
      // Save the stocks without candle history as a smaller fallback.
      try {
        localStorage.setItem(
          "ema360_scanner_state",
          JSON.stringify({
            conditions,
            timeframe,
            generatedText,
            results: results.slice(0, 100).map(({ candles, ...stock }) => stock),
            stockSearch,
            currentPage,
            savedAt: new Date().toISOString()
          })
        );
      } catch (fallbackError) {
        console.warn("Could not persist scanner state:", fallbackError);
      }
    }
  }, [conditions, timeframe, generatedText, results, stockSearch, currentPage]);

  const filteredResults =
    results.filter(stock => {
      const query =
        stockSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return true;
      }

      return (
        String(stock.companyName || "")
          .toLowerCase()
          .includes(query) ||
        String(stock.symbol || "")
          .toLowerCase()
          .includes(query)
      );
    });

  // Highest percentage change first.
  const sortedResults = [
    ...filteredResults
  ].sort((a, b) => {
    const changeA = Number(a.change);
    const changeB = Number(b.change);

    return changeB - changeA;
  });

  // Show only 20 stocks on each table page.
  const totalPages = Math.max(
    1,
    Math.ceil(
      sortedResults.length / stocksPerPage
    )
  );

  const pageStart =
    (currentPage - 1) *
    stocksPerPage;

  const paginatedResults =
    sortedResults.slice(
      pageStart,
      pageStart + stocksPerPage
    );


  /* =====================================================
     ADD CONDITION
  =====================================================*/

  function addCondition() {

    setConditions(
      previous => [
        ...previous,
        {
          type: "volume_2x_sma10",
          enabled: true
        }
      ]
    );
  }


  /* =====================================================
     REMOVE CONDITION
  ===================================================== */

  function removeCondition(
    index
  ) {

    setConditions(
      previous =>
        previous.filter(
          (_, i) =>
            i !== index
        )
    );
  }


  function toggleCondition(index, enabled) {
    setConditions(previous =>
      previous.map((condition, i) =>
        i === index
          ? { ...condition, enabled }
          : condition
      )
    );
  }


  /* =====================================================
     CHANGE CONDITION
  ===================================================== */

  function updateCondition(
    index,
    type
  ) {

    setConditions(
      previous =>
        previous.map(
          (condition, i) =>
            i === index
              ? {
                ...condition,
                type
              }
              : condition
        )
    );
  }


  async function runWithConcurrency(items, worker, limit = 25) {
    const results = [];

    let index = 0;

    async function workerLoop() {
      while (true) {
        const currentIndex = index++;

        if (currentIndex >= items.length) {
          return;
        }

        try {
          const result = await worker(items[currentIndex]);

          results.push(result);
        } catch (error) {
          console.error("Scanner worker error:", error);
        }
      }
    }

    const workers = Array.from(
      {
        length: Math.min(limit, items.length),
      },
      () => workerLoop()
    );

    await Promise.all(workers);

    return results;
  }

  /* =====================================================
     RUN SCAN
  ===================================================== */

  async function runScan(conditionsToUse = conditions) {

    const allScanConditions = Array.isArray(conditionsToUse)
      ? conditionsToUse
      : conditions;

    // OFF indicators stay visible in the UI but are excluded from scanning.
    const scanConditions = allScanConditions.filter(
      condition => condition && condition.enabled !== false
    );

    // ---------------------------------------------------------
    // NO ACTIVE FILTER = DO NOT SCAN
    // ---------------------------------------------------------
    if (!scanConditions || scanConditions.length === 0) {
      setResults([]);
      setLoading(false);
      alert("Please turn on at least one filter before running the scan.");
      return;
    }

    if (!scannerStocks || scannerStocks.length === 0) {
      alert("NSE stock list is still loading. Please try again.");
      return;
    }

    setResults([]);
    setCurrentPage(1);
    setLoading(true);

    let matched = 0;
    let scanned = 0;
    let priorityCount = 0;
    let priorityLoaded = false;

    // Keep all matches here so the first page can be filled immediately,
    // while the remaining NSE universe continues in the background.
    const liveMatches = [];
    const seenSymbols = new Set();

    function publishResults() {
      const sorted = [...liveMatches].sort(
        (a, b) => Number(b.change) - Number(a.change)
      );
      setResults(sorted);
    }

    async function scanOne(symbol) {
      try {
        const response = await fetch(
          `http://localhost:3000/api/scanner/nse/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
        );

        if (!response.ok) return null;

        const data = await response.json();

        if (
          !data.success ||
          !Array.isArray(data.candles) ||
          data.candles.length === 0
        ) {
          return null;
        }

        const candles = prepareCandles(data.candles);

        if (candles.length === 0) return null;

        const passes = scanConditions.every(condition =>
          checkCondition(condition, candles, data.change ?? data.dailyChange)
        );

        if (!passes) return null;

        const latest = candles[candles.length - 1];

        const price = Number(data.price ?? latest.close);
        const change = Number(data.change ?? data.dailyChange);
        const volume = Number(data.volume ?? data.dailyVolume);

        if (
          !Number.isFinite(price) ||
          !Number.isFinite(change) ||
          !Number.isFinite(volume)
        ) {
          return null;
        }

        return {
          symbol,
          companyName: data.companyName || symbol,
          price,
          change,
          volume,
          open: Number(latest.open),
          high: Number(latest.high),
          low: Number(latest.low),
          candles,
          timeframe
        };
      } catch (error) {
        console.error(`NSE scan failed for ${symbol}:`, error.message);
        return null;
      }
    }

    // Small concurrency helper. The backend already protects NSE requests,
    // so this keeps the browser from opening hundreds of requests at once.
    async function runBatch(items, limit = 5) {
      let cursor = 0;

      async function worker() {
        while (true) {
          const index = cursor++;

          if (index >= items.length) return;

          const symbol = items[index];
          const result = await scanOne(symbol);

          scanned++;

          if (result && !seenSymbols.has(result.symbol)) {
            seenSymbols.add(result.symbol);
            liveMatches.push(result);
            matched++;

            // Update immediately for the first few matches, then periodically.
            if (
              liveMatches.length <= 20 ||
              liveMatches.length % 10 === 0
            ) {
              publishResults();
            }
          }

          if (
            scanned % 100 === 0 ||
            scanned === scannerStocks.length
          ) {
            console.log(
              `NSE Scanner Progress: ${scanned}/${scannerStocks.length} | ` +
              `Matches: ${matched} | Priority stocks: ${priorityCount}`
            );
          }
        }
      }

      const workers = Array.from(
        { length: Math.min(limit, items.length) },
        () => worker()
      );

      await Promise.all(workers);
    }

    try {
      /*
       * ---------------------------------------------------------
       * PHASE 1: GET STOCKS ORDERED BY CURRENT % CHANGE
       * ---------------------------------------------------------
       *
       * This is the important change.
       *
       * The backend first creates a lightweight NSE daily snapshot
       * containing the current/last trading-day % change for the
       * whole NSE universe.
       *
       * We then scan the highest-change stocks FIRST.
       */
      let priorityStocks = [];

      try {
        const priorityResponse = await fetch(
          `http://localhost:3000/api/scanner/nse/priority?timeframe=${encodeURIComponent(timeframe)}`
        );

        if (priorityResponse.ok) {
          const priorityData = await priorityResponse.json();

          if (
            priorityData.success &&
            Array.isArray(priorityData.stocks)
          ) {
            const scannerSet = new Set(
              scannerStocks.map(symbol =>
                String(symbol).toUpperCase()
              )
            );

            priorityStocks = priorityData.stocks
              .filter(
                item =>
                  item &&
                  item.symbol &&
                  scannerSet.has(
                    String(item.symbol).toUpperCase()
                  )
              )
              .sort(
                (a, b) =>
                  Number(b.change) - Number(a.change)
              )
              .map(item =>
                String(item.symbol).toUpperCase()
              );

            priorityCount = priorityStocks.length;
            priorityLoaded = priorityStocks.length > 0;
          }
        }
      } catch (error) {
        console.warn(
          "Priority NSE snapshot unavailable. Falling back to normal NSE order.",
          error.message
        );
      }

      /*
       * PHASE 1 scan order:
       * highest % change first.
       *
       * Any stock not returned by the priority endpoint is appended
       * afterwards, so NO NSE stock is permanently skipped.
       */
      const prioritySet = new Set(priorityStocks);

      const remainingStocks = scannerStocks.filter(
        symbol => !prioritySet.has(String(symbol).toUpperCase())
      );

      const orderedStocks = priorityLoaded
        ? [...priorityStocks, ...remainingStocks]
        : [...scannerStocks];

      /*
       * Scan the highest-change stocks first.
       *
       * As soon as 20 matches exist, the first page is populated.
       * We then continue scanning the remaining universe.
       */
      await runBatch(orderedStocks, 5);

      // Final sort guarantees highest % change is always on top.
      publishResults();
      setCurrentPage(1);

    } catch (error) {
      console.error("NSE Scanner Error:", error);
    } finally {
      setLoading(false);

      console.log(
        `NSE Scan Finished: ${scanned}/${scannerStocks.length} scanned, ` +
        `${matched} matched, priority mode: ${priorityLoaded}`
      );
    }
  }


  /* =====================================================
     MAGIC FILTER / SAVE / BACKTEST / ALERT ACTIONS
  ===================================================== */

  function conditionToText(condition) {
    const period = Number(condition.period || 10);
    const multiplier = Number(condition.multiplier || 2);

    const names = {
      close_above_ema20: "Close > EMA 20",
      close_below_ema20: "Close < EMA 20",
      close_above_ema: `Close > EMA ${condition.period || 20}`,
      close_below_ema: `Close < EMA ${condition.period || 20}`,
      volume_2x_sma10: "Volume > 2 × SMA(Volume,10)",
      volume_multiple_sma: `Volume > ${multiplier} × SMA(Volume,${period})`,
      volume_above_sma: `Volume > SMA(Volume,${period})`,
      five_green: "5 consecutive green candles",
      price_above: `Price > ${condition.value}`,
      price_below: `Price < ${condition.value}`,
      change_above: `% Change > ${condition.value}%`,
      change_below: `% Change < ${condition.value}%`
    };

    return names[condition.type] || condition.type;
  }

  function generateConditionTextFromConditions(nextConditions = conditions) {
    return nextConditions
      .map(conditionToText)
      .join(" AND ");
  }

  async function handleMagicGenerate() {
    const prompt = generatedText.trim();

    if (!prompt) {
      setMagicMessage("Write a condition first — English or Hinglish is okay.");
      return;
    }

    // A new Generate action gets its own controller so the user can cancel
    // the natural-language interpretation without changing existing filters.
    const controller = new AbortController();
    magicAbortRef.current = controller;

    setMagicBusy(true);
    setMagicMessage("Understanding your condition...");

    try {
      const response = await fetch(
        "http://localhost:3000/api/scanner/magic-filter",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ prompt }),
          signal: controller.signal
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "I could not understand that condition."
        );
      }

      const parsedConditions = Array.isArray(data.conditions)
        ? data.conditions
            .filter(Boolean)
            .map(condition => ({
              ...condition,
              // Magic-generated conditions are DISPLAY ONLY.
              // Manual conditions remain editable below.
              locked: true,
              source: "magic",
              enabled: true
            }))
        : [];

      if (parsedConditions.length === 0) {
        throw new Error("I could not find a usable condition in that sentence.");
      }

      const nextConditions = magicMode === "replace"
        ? parsedConditions
        : [...conditions, ...parsedConditions];

      setConditions(nextConditions);

      if (data.timeframe) {
        setTimeframe(data.timeframe);
      }

      const readable = generateConditionTextFromConditions(
        parsedConditions
      );

      // Generation is finished here. The Cancel button is only for the
      // understanding/generation request, not for the scanner itself.
      setMagicBusy(false);
      magicAbortRef.current = null;
      setMagicMessage(
        `Understood: ${readable}${data.timeframe ? ` • ${data.timeframe}` : ""}`
      );

      // Keep the existing scanner behavior: once the sentence has been
      // understood, scan using the NEW condition array.
      await runScan(nextConditions);
    } catch (error) {
      if (error?.name === "AbortError") {
        setMagicMessage("Generation cancelled. You can enter another condition.");
        return;
      }

      console.error("Magic Filter error:", error);
      setMagicMessage(error.message);
    } finally {
      if (magicAbortRef.current === controller) {
        magicAbortRef.current = null;
        setMagicBusy(false);
      }
    }
  }

  function cancelMagicGenerate() {
    if (magicAbortRef.current) {
      magicAbortRef.current.abort();
    } else {
      setMagicBusy(false);
      setMagicMessage("Generation cancelled. You can enter another condition.");
    }
  }

  function saveCurrentScan() {
    const defaultName =
      generatedText.trim() ||
      generateConditionTextFromConditions(conditions) ||
      "My NSE Scan";

    const name = window.prompt("Name this scan:", defaultName);

    if (!name || !name.trim()) return;

    const scan = {
      id: `scan_${Date.now()}`,
      name: name.trim(),
      conditions,
      timeframe,
      prompt: generatedText,
      createdAt: new Date().toISOString()
    };

    const next = [scan, ...savedScans.filter(item => item.name !== scan.name)];
    setSavedScans(next);
    localStorage.setItem("ema360_saved_scans", JSON.stringify(next));
    setMagicMessage(`Saved scan: ${scan.name}`);
    setShowSavedScans(true);
  }

  function loadSavedScan(scan) {
    if (!scan) return;

    setConditions(
      Array.isArray(scan.conditions)
        ? scan.conditions.map(condition => ({
            ...condition,
            enabled: condition.enabled !== false
          }))
        : []
    );
    setTimeframe(scan.timeframe || "5m");
    setGeneratedText(scan.prompt || "");
    setResults([]);
    setCurrentPage(1);
    setShowSavedScans(false);
    setMagicMessage(`Loaded scan: ${scan.name}`);
  }

  function deleteSavedScan(id) {
    const next = savedScans.filter(scan => scan.id !== id);
    setSavedScans(next);
    localStorage.setItem("ema360_saved_scans", JSON.stringify(next));
  }

  async function handleBacktest() {
    const activeConditions = conditions.filter(
      condition => condition && condition.enabled !== false
    );

    if (!activeConditions.length) {
      setMagicMessage("Turn on at least one filter before backtesting.");
      return;
    }

    setBacktestBusy(true);
    setShowBacktest(true);
    setBacktestResult(null);

    try {
      const response = await fetch(
        "http://localhost:3000/api/scanner/nse/backtest",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            conditions: activeConditions,
            timeframe,
            days: 30,
            maxStocks: 30
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Backtest failed.");
      }

      setBacktestResult(data);
    } catch (error) {
      console.error("Backtest error:", error);
      setBacktestResult({
        success: false,
        message: error.message
      });
    } finally {
      setBacktestBusy(false);
    }
  }

  async function handleCreateAlert() {
    const activeConditions = conditions.filter(
      condition => condition && condition.enabled !== false
    );

    if (!activeConditions.length) {
      setMagicMessage("Turn on at least one filter before creating an alert.");
      return;
    }

    const defaultName =
      generateConditionTextFromConditions(activeConditions) ||
      "My NSE Scanner Alert";

    const name = window.prompt("Name this alert:", defaultName);
    if (!name || !name.trim()) return;

    setAlertBusy(true);
    setAlertMessage("");

    try {
      const response = await fetch(
        "http://localhost:3000/api/scanner/alerts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: name.trim(),
            conditions: activeConditions,
            timeframe
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not create alert.");
      }

      setAlertMessage(
        `Alert created: ${data.alert.name}. It is saved on the NSE scanner backend.`
      );
    } catch (error) {
      console.error("Create alert error:", error);
      setAlertMessage(error.message);
    } finally {
      setAlertBusy(false);
    }
  }




  return (

    <div className="scannerPage">

      {/* =================================================
                TITLE
            ================================================= */}

      <div className="scannerTitle">
        STOCK SCREENER
      </div>


      {/* =================================================
                MAGIC FILTERS
            ================================================= */}

      <section className="scannerPanel">

        <div className="magicTitle">
          ✨ MAGIC FILTERS
        </div>


        <div className="scannerInputRow">

          <div className="modeButtons">

            <button
              className={magicMode === "append" ? "modeActive" : ""}
              onClick={() => setMagicMode("append")}
              type="button"
            >
              Append
            </button>

            <button
              className={magicMode === "replace" ? "modeActive" : ""}
              onClick={() => setMagicMode("replace")}
              type="button"
            >
              Replace
            </button>

            <button
              type="button"
              onClick={() => {
                setMagicMessage("Draw mode: use the condition builder below to build the scan manually.");
                document.querySelector(".conditionArea")?.scrollIntoView({
                  behavior: "smooth",
                  block: "center"
                });
              }}
              title="Build the scan manually using the condition builder"
            >
              ✏️ Draw
            </button>

          </div>


          <input
            value={generatedText}
            onChange={event => setGeneratedText(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleMagicGenerate();
              }
            }}
            placeholder="Try: '5 min ka volume SMA 10 se double ho aur price 20 EMA ke upar ho'"
            aria-label="Magic Filter natural language input"
          />


          {magicBusy ? (
            <>
              <button
                className="generateButton"
                disabled
                type="button"
                style={{ opacity: 0.75, cursor: "wait" }}
              >
                ⏳ Understanding...
              </button>

              <button
                type="button"
                onClick={cancelMagicGenerate}
                style={{
                  height: "36px",
                  padding: "0 16px",
                  borderRadius: "8px",
                  border: "1px solid #ef4444",
                  background: "#35141a",
                  color: "#fecaca",
                  cursor: "pointer",
                  fontWeight: 600,
                  whiteSpace: "nowrap"
                }}
              >
                ✕ Cancel
              </button>
            </>
          ) : (
            <button
              className="generateButton"
              onClick={handleMagicGenerate}
              type="button"
            >
              ⟳ Generate
            </button>
          )}

        </div>

        {(magicMessage || alertMessage) && (
          <div
            style={{
              marginTop: "10px",
              padding: "9px 12px",
              borderRadius: "8px",
              background: "#101d32",
              border: "1px solid #243b5c",
              color: "#bcd2ef",
              fontSize: "13px"
            }}
          >
            {magicMessage || alertMessage}
          </div>
        )}


        {/* CONDITION TAGS */}

        <div className="filterTags">

          <button
            onClick={() =>
              setConditions([
                ...conditions,
                {
                  type: "five_green",
                  enabled: true
                }
              ])
            }
          >
            5 consecutive green candles ↗
          </button>

          <button
            onClick={() =>
              setConditions([
                ...conditions,
                {
                  type: "volume_2x_sma10",
                  enabled: true
                }
              ])
            }
          >
            5-minute volume &gt; 2 × SMA volume(10) ↗
          </button>

          <button
            onClick={() =>
              setConditions([
                ...conditions,
                {
                  type: "close_above_ema20",
                  enabled: true
                }
              ])
            }
          >
            Close above EMA 20 ↗
          </button>

        </div>


        <button
          className="addTag"
          onClick={
            addCondition
          }
        >
          ＋ Add condition
        </button>


        {/* =================================================
                    CONDITIONS
                ================================================= */}

        <div className="conditionArea">

          <div
            className="conditionHeading"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap"
            }}
          >
            <span>
              Stock passes all of the below filters
            </span>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px"
              }}
            >
              <span>Timeframe:</span>

              <select
                value={timeframe}
                onChange={event => {
                  setTimeframe(event.target.value);
                  setResults([]);
                  setCurrentPage(1);
                }}
              >
                <option value="1m">1 Minute</option>
                <option value="3m">3 Minutes</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="30m">30 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="1d">Daily</option>
              </select>
            </label>
          </div>


          {conditions.map(
            (
              condition,
              index
            ) => {

              // Conditions created by Magic Filters are intentionally
              // read-only. Manual conditions remain fully editable.
              if (condition.locked || condition.source === "magic") {
                return (
                  <div
                    className="conditionRow"
                    key={index}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "fit-content",
                      maxWidth: "100%",
                      minHeight: "36px",
                      boxSizing: "border-box",
                      padding: "6px 10px",
                      marginBottom: "8px",
                      border: "1px solid #243b5c",
                      borderRadius: "7px",
                      background: condition.enabled === false ? "#0b1220" : "#101d32",
                      color: condition.enabled === false ? "#687890" : "#dbeafe",
                      gap: "10px",
                      opacity: condition.enabled === false ? 0.68 : 1,
                      transition: "opacity 0.18s ease, background 0.18s ease"
                    }}
                  >
                    <IndicatorToggle
                      enabled={condition.enabled !== false}
                      onChange={enabled => toggleCondition(index, enabled)}
                    />

                    <span style={{ fontSize: "13px", whiteSpace: "nowrap" }}>
                      {conditionToText(condition)}
                    </span>

                    <span
                      style={{
                        fontSize: "11px",
                        color: "#8fb8e8",
                        padding: "3px 7px",
                        borderRadius: "5px",
                        border: "1px solid #29496e",
                        background: "#0c1729",
                        whiteSpace: "nowrap"
                      }}
                    >
                      ✨ Generated
                    </span>

                    <button
                      className="removeCondition"
                      onClick={() => removeCondition(index)}
                      type="button"
                      aria-label="Remove condition"
                    >
                      ×
                    </button>
                  </div>
                );
              }

              return (
                <div
                  className="conditionRow"
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "fit-content",
                    maxWidth: "100%",
                    minHeight: "36px",
                    boxSizing: "border-box",
                    padding: "4px 8px",
                    marginBottom: "8px",
                    gap: "8px",
                    opacity: condition.enabled === false ? 0.62 : 1,
                    transition: "opacity 0.18s ease"
                  }}
                >

                  <IndicatorToggle
                    enabled={condition.enabled !== false}
                    onChange={enabled => toggleCondition(index, enabled)}
                  />

                  <select
                    value={
                      condition.type
                    }
                    style={{
                      width: "auto",
                      minWidth: "250px",
                      maxWidth: "320px"
                    }}
                    onChange={event =>
                      updateCondition(
                        index,
                        event.target.value
                      )
                    }
                  >

                    <option value="close_above_ema20">
                      Close &gt; EMA 20
                    </option>

                    <option value="close_below_ema20">
                      Close &lt; EMA 20
                    </option>

                    <option value="close_above_ema">
                      Close &gt; EMA (custom period)
                    </option>

                    <option value="close_below_ema">
                      Close &lt; EMA (custom period)
                    </option>

                    <option value="volume_2x_sma10">
                      Volume &gt; 2 × SMA(Volume,10)
                    </option>

                    <option value="volume_multiple_sma">
                      Volume &gt; N × SMA(Volume,N)
                    </option>

                    <option value="volume_above_sma">
                      Volume &gt; SMA(Volume,N)
                    </option>

                    <option value="five_green">
                      5 consecutive green candles
                    </option>

                    <option value="price_above">
                      Price above value
                    </option>

                    <option value="price_below">
                      Price below value
                    </option>

                    <option value="change_above">
                      % Change above value
                    </option>

                    <option value="change_below">
                      % Change below value
                    </option>

                  </select>


                  {(
                    condition.type === "price_above" ||
                    condition.type === "price_below" ||
                    condition.type === "change_above" ||
                    condition.type === "change_below"
                  ) && (
                    <input
                      type="number"
                      style={{ width: "150px", minWidth: "120px" }}
                      placeholder={
                        condition.type.startsWith("change")
                          ? "%"
                          : "Value"
                      }
                      value={condition.value ?? ""}
                      onChange={event =>
                        setConditions(previous =>
                          previous.map((item, i) =>
                            i === index
                              ? { ...item, value: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                  )}

                  {(
                    condition.type === "close_above_ema" ||
                    condition.type === "close_below_ema" ||
                    condition.type === "volume_multiple_sma" ||
                    condition.type === "volume_above_sma"
                  ) && (
                    <input
                      type="number"
                      min="1"
                      style={{ width: "120px", minWidth: "100px" }}
                      placeholder="Period"
                      value={
                        condition.period ??
                        (condition.type.includes("ema") ? "20" : "10")
                      }
                      onChange={event =>
                        setConditions(previous =>
                          previous.map((item, i) =>
                            i === index
                              ? { ...item, period: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                  )}

                  {condition.type === "volume_multiple_sma" && (
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      style={{ width: "120px", minWidth: "100px" }}
                      placeholder="Multiplier"
                      value={condition.multiplier ?? "2"}
                      onChange={event =>
                        setConditions(previous =>
                          previous.map((item, i) =>
                            i === index
                              ? { ...item, multiplier: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                  )}


                  <button
                    className="removeCondition"
                    onClick={() =>
                      removeCondition(
                        index
                      )
                    }
                    type="button"
                  >
                    ×
                  </button>

                </div>
              );
            }
          )}

        </div>


        {/* =================================================
                    RUN BUTTONS
                ================================================= */}

        <div className="scannerActions">

          <button
            className="runScan"
            onClick={
              runScan
            }
          >
            ▶ Run Scan
          </button>


          <button
            className="saveScan"
            onClick={saveCurrentScan}
            type="button"
          >
            💾 Save Scan
          </button>


          <button
            className="backtest"
            onClick={handleBacktest}
            disabled={backtestBusy}
            type="button"
          >
            {backtestBusy ? "⏳ Backtesting..." : "↻ Backtest Results"}
          </button>


          <button
            className="alertButton"
            onClick={handleCreateAlert}
            disabled={alertBusy}
            type="button"
          >
            {alertBusy ? "⏳ Saving..." : "🔔 Create Alert"}
          </button>

          <button
            type="button"
            onClick={() => setShowSavedScans(previous => !previous)}
            style={{
              border: "1px solid #29415f",
              background: "#101a2e",
              color: "#c8d7eb",
              borderRadius: "7px",
              padding: "8px 12px",
              cursor: "pointer"
            }}
          >
            📂 Open Saved Scan
          </button>

        </div>


        {showSavedScans && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              borderRadius: "9px",
              border: "1px solid #243b5c",
              background: "#0c1627"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px"
              }}
            >
              <strong>Saved Scans</strong>
              <button
                type="button"
                onClick={() => setShowSavedScans(false)}
              >
                ×
              </button>
            </div>

            {savedScans.length === 0 ? (
              <div style={{ color: "#8190a8", fontSize: "13px" }}>
                No saved scans yet.
              </div>
            ) : (
              savedScans.map(scan => (
                <div
                  key={scan.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: "8px 0",
                    borderBottom: "1px solid #1c2a40"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{scan.name}</div>
                    <div style={{ color: "#7f91ad", fontSize: "12px" }}>
                      {scan.timeframe} • {scan.conditions?.length || 0} conditions
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => loadSavedScan(scan)}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedScan(scan.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {showBacktest && (
          <div
            style={{
              marginTop: "12px",
              padding: "14px",
              borderRadius: "9px",
              border: "1px solid #3c2b63",
              background: "#120d20"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px"
              }}
            >
              <strong>↻ NSE Backtest — last 30 days</strong>
              <button type="button" onClick={() => setShowBacktest(false)}>
                ×
              </button>
            </div>

            {backtestBusy && (
              <div style={{ color: "#b7c7dc", fontSize: "13px" }}>
                Testing the current conditions on the top 30 NSE priority stocks. This can take a little time because historical NSE candles are being fetched.
              </div>
            )}

            {!backtestBusy && backtestResult && !backtestResult.success && (
              <div style={{ color: "#ff9a9a", fontSize: "13px" }}>
                {backtestResult.message}
              </div>
            )}

            {!backtestBusy && backtestResult?.success && (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: "18px",
                    flexWrap: "wrap",
                    marginBottom: "12px",
                    color: "#dbe7f5",
                    fontSize: "13px"
                  }}
                >
                  <span><strong>{backtestResult.signalCount}</strong> signals</span>
                  <span><strong>{backtestResult.stocksCompleted}</strong> stocks tested</span>
                  <span>{backtestResult.elapsedMs} ms</span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "7px" }}>Stock</th>
                        <th style={{ textAlign: "left", padding: "7px" }}>Date</th>
                        <th style={{ textAlign: "right", padding: "7px" }}>Price</th>
                        <th style={{ textAlign: "right", padding: "7px" }}>% Change</th>
                        <th style={{ textAlign: "right", padding: "7px" }}>Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(backtestResult.signals || []).slice(0, 100).map((signal, index) => (
                        <tr key={`${signal.symbol}-${signal.time}-${index}`}>
                          <td style={{ padding: "7px" }}>{signal.symbol}</td>
                          <td style={{ padding: "7px" }}>{signal.date}</td>
                          <td style={{ padding: "7px", textAlign: "right" }}>
                            ₹{Number(signal.price).toFixed(2)}
                          </td>
                          <td style={{ padding: "7px", textAlign: "right" }}>
                            {Number.isFinite(Number(signal.change))
                              ? `${Number(signal.change) >= 0 ? "+" : ""}${Number(signal.change).toFixed(2)}%`
                              : "—"}
                          </td>
                          <td style={{ padding: "7px", textAlign: "right" }}>
                            {Number(signal.volume).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        <div className="delayNote">
          Note: NSE scanner is using{" "}
          {timeframe === "1m"
            ? "1-minute"
            : timeframe === "3m"
              ? "3-minute"
              : timeframe === "5m"
                ? "5-minute"
                : timeframe === "15m"
                  ? "15-minute"
                  : timeframe === "30m"
                    ? "30-minute"
                    : timeframe === "1h"
                      ? "1-hour"
                      : "daily"}{" "}
          candle data from the NSE scanner backend.
        </div>

      </section>


      {/* =================================================
                RESULTS
            ================================================= */}

      <section className="resultsSection">

        <div
          className="resultsHeader"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap"
          }}
        >

          <div>
            STOCKS
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginLeft: "auto"
            }}
          >

            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center"
              }}
            >

              <input
                type="text"
                value={stockSearch}
                onChange={event => {
                  setStockSearch(
                    event.target.value
                  );
                  setCurrentPage(1);
                }}
                placeholder="Search stocks"
                aria-label="Search stocks"
                style={{
                  width: "180px",
                  height: "32px",
                  padding: "0 34px 0 14px",
                  borderRadius: "8px",
                  border: "1px solid #24304a",
                  background: "#0d1629",
                  color: "#e5e7eb",
                  outline: "none",
                  fontSize: "13px",
                  boxSizing: "border-box"
                }}
              />

              <span
                style={{
                  position: "absolute",
                  right: "11px",
                  fontSize: "14px",
                  color: "#71809b",
                  pointerEvents: "none"
                }}
              >
                🔍
              </span>

            </div>

            <div className="resultCount">
              {stockSearch.trim()
                ? `${filteredResults.length} of ${results.length} stocks`
                : `${results.length} stocks matched`}
            </div>

          </div>

        </div>


        <div className="resultsTable">

          <div className="resultHead">

            <span>Sr.</span>

            <span>Stock Name</span>

            <span>Symbol</span>

            <span>Price</span>

            <span>% Change</span>

            <span>Volume</span>

          </div>


          {paginatedResults.map(
            (
              stock,
              index
            ) => (

              <div
                className="resultRow"
                key={
                  stock.symbol
                }
                onMouseEnter={() =>
                  setHoveredStock(
                    stock.symbol
                  )
                }
                onMouseLeave={() =>
                  setHoveredStock(
                    null
                  )
                }
              >

                <span>
                  {pageStart + index + 1}
                </span>


                <span className="stockName">

                  {stock.companyName || stock.symbol}

                </span>


                <span className="stockSymbol">

                  {stock.symbol}

                </span>


                <span>

                  ₹
                  {stock.price.toFixed(
                    2
                  )}

                </span>


                <span
                  className={
                    stock.change >=
                      0
                      ? "positive"
                      : "negative"
                  }
                >

                  {stock.change >=
                    0
                    ? "+"
                    : ""}

                  {stock.change.toFixed(
                    2
                  )}
                  %

                </span>


                <span>

                  {stock.volume.toLocaleString()}

                </span>


                {/* =================================================
                                    HOVER CHART
                                ================================================= */}

                {hoveredStock ===
                  stock.symbol && (

                    <div
                      className="hoverChart"
                      onMouseEnter={() =>
                        setHoveredStock(
                          stock.symbol
                        )
                      }
                    >

                      <div className="hoverChartHeader">

                        <strong>
                          {
                            stock.symbol
                          }
                        </strong>

                        <span>
                          {stock.timeframe === "1m"
                            ? "1M"
                            : stock.timeframe === "3m"
                              ? "3M"
                              : stock.timeframe === "5m"
                                ? "5M"
                                : stock.timeframe === "15m"
                                  ? "15M"
                                  : stock.timeframe === "30m"
                                    ? "30M"
                                    : stock.timeframe === "1h"
                                      ? "1H"
                                      : "1D"}
                        </span>

                      </div>

                      <MiniChart
                        candles={
                          stock.candles
                        }
                      />

                    </div>

                  )}

              </div>

            )
          )}


          {!loading &&
            results.length ===
            0 && (

              <div className="noResults">

                No stocks currently satisfy
                all selected conditions.

              </div>

            )}


          {loading && (

            <div className="noResults">

              Scanning highest-change NSE stocks first... Matching stocks will appear automatically.

            </div>

          )}



        </div>

        {sortedResults.length > 0 && (

          <div
            className="scannerPagination"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "14px 16px",
              borderTop: "1px solid #202b43",
              flexWrap: "wrap"
            }}
          >

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <span
                style={{
                  color: "#8b98b3",
                  fontSize: "13px",
                  marginRight: "4px"
                }}
              >
                Per Page
              </span>

              <button
                type="button"
                disabled
                style={{
                  minWidth: "42px",
                  height: "32px",
                  borderRadius: "7px",
                  border: "1px solid #263451",
                  background: "#101a2e",
                  color: "#8b98b3",
                  fontSize: "13px",
                  cursor: "default"
                }}
              >
                20
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginLeft: "auto"
              }}
            >

              <button
                type="button"
                onClick={() =>
                  setCurrentPage(
                    previous =>
                      Math.max(1, previous - 1)
                  )
                }
                disabled={currentPage === 1}
                style={{
                  minWidth: "40px",
                  height: "32px",
                  borderRadius: "7px",
                  border: "1px solid #263451",
                  background: currentPage === 1 ? "#101a2e" : "#14213a",
                  color: currentPage === 1 ? "#4f5d78" : "#dbe5f5",
                  cursor: currentPage === 1 ? "not-allowed" : "pointer"
                }}
              >
                «
              </button>

              {Array.from(
                { length: Math.min(totalPages, 5) },
                (_, index) => {
                  let pageNumber;

                  if (totalPages <= 5) {
                    pageNumber = index + 1;
                  } else if (currentPage <= 3) {
                    pageNumber = index + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNumber = totalPages - 4 + index;
                  } else {
                    pageNumber = currentPage - 2 + index;
                  }

                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() =>
                        setCurrentPage(pageNumber)
                      }
                      style={{
                        minWidth: "32px",
                        height: "32px",
                        borderRadius: "7px",
                        border: "1px solid #263451",
                        background:
                          currentPage === pageNumber
                            ? "#1464c5"
                            : "#101a2e",
                        color:
                          currentPage === pageNumber
                            ? "#ffffff"
                            : "#aebbd0",
                        cursor: "pointer",
                        fontSize: "13px"
                      }}
                    >
                      {pageNumber}
                    </button>
                  );
                }
              )}

              {totalPages > 5 && currentPage < totalPages - 2 && (
                <>
                  <span
                    style={{
                      color: "#71809b",
                      padding: "0 2px"
                    }}
                  >
                    ...
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage(totalPages)
                    }
                    style={{
                      minWidth: "32px",
                      height: "32px",
                      borderRadius: "7px",
                      border: "1px solid #263451",
                      background: "#101a2e",
                      color: "#aebbd0",
                      cursor: "pointer",
                      fontSize: "13px"
                    }}
                  >
                    {totalPages}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() =>
                  setCurrentPage(
                    previous =>
                      Math.min(totalPages, previous + 1)
                  )
                }
                disabled={currentPage === totalPages}
                style={{
                  minWidth: "52px",
                  height: "32px",
                  borderRadius: "7px",
                  border: "1px solid #263451",
                  background:
                    currentPage === totalPages
                      ? "#101a2e"
                      : "#14213a",
                  color:
                    currentPage === totalPages
                      ? "#4f5d78"
                      : "#dbe5f5",
                  cursor:
                    currentPage === totalPages
                      ? "not-allowed"
                      : "pointer",
                  fontSize: "13px"
                }}
              >
                Next »
              </button>

            </div>

          </div>

        )}

      </section>

    </div>
  );
}


export default Scanner;