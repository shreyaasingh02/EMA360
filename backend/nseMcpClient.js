const NSE_MCP_LIVE_URL = "https://mcp.nseindia.in/cmmkt/mcp";
const NSE_MCP_BHAVCOPY_URL = "https://mcp.nseindia.in/bhavcopy/cm/mcp";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseSse(text) {
  const messages = [];
  let event = "message";
  let data = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    else if (line === "" && data.length) {
      messages.push({ event, data: data.join("\n") });
      event = "message";
      data = [];
    }
  }
  if (data.length) messages.push({ event, data: data.join("\n") });
  for (const item of messages.reverse()) {
    try { return JSON.parse(item.data); } catch (_) {}
  }
  return null;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  if (type.includes("text/event-stream")) return parseSse(text);
  try { return JSON.parse(text); } catch (_) { return parseSse(text); }
}

class NseMcpConnection {
  constructor(url) {
    this.url = url;
    this.sessionId = null;
    this.nextId = 1;
    this.initialized = false;
    this.tools = null;
    this.queue = Promise.resolve();
  }

  runSerialized(fn) {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async initialize() {
    if (this.initialized) return;
    await this.runSerialized(async () => {
      if (this.initialized) return;
      const result = await this.rawRequest("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "EMA360", version: "1.0.0" }
      });
      if (result?.error) throw new Error(result.error.message || "NSE MCP initialize failed");
      this.initialized = true;
      await this.rawNotification("notifications/initialized", {});
    });
  }

  async rawRequest(method, params) {
    const id = this.nextId++;
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    const response = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
    });
    const sid = response.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    const payload = await readResponse(response);
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `NSE MCP HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload;
  }

  async rawNotification(method, params) {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    const response = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method, params })
    });
    if (!response.ok && response.status !== 202) {
      const text = await response.text();
      throw new Error(`NSE MCP notification failed: ${response.status} ${text.slice(0, 200)}`);
    }
  }

  async listTools() {
    await this.initialize();
    if (this.tools) return this.tools;
    return this.runSerialized(async () => {
      if (this.tools) return this.tools;
      const result = await this.rawRequest("tools/list", {});
      if (result?.error) throw new Error(result.error.message || "NSE MCP tools/list failed");
      this.tools = result?.result?.tools || [];
      return this.tools;
    });
  }

  async callTool(name, args = {}, urlOverride = null) {
    const connection = urlOverride ? new NseMcpConnection(urlOverride) : this;
    if (urlOverride) await connection.initialize();
    else await this.initialize();
    return connection.runSerialized(async () => {
      const result = await connection.rawRequest("tools/call", { name, arguments: args });
      if (result?.error) throw new Error(result.error.message || `NSE MCP tool ${name} failed`);
      const content = result?.result?.content || [];
      const texts = content.filter(x => x?.type === "text").map(x => x.text);
      for (const text of texts) {
        try { return JSON.parse(text); } catch (_) {}
      }
      return result?.result;
    });
  }
}

function firstObject(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstObject(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value.data) || Array.isArray(value.rows) || Array.isArray(value.stocks)) return value;
    for (const item of Object.values(value)) {
      const found = firstObject(item);
      if (found) return found;
    }
  }
  return null;
}

function extractRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["data", "rows", "stocks", "equities", "results", "items", "quotes", "constituents"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  const found = firstObject(value);
  if (found) return extractRows(found);
  return [];
}

function extractToolText(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (Array.isArray(value.content)) {
      for (const c of value.content) {
        if (typeof c?.text === "string") return c.text;
      }
    }
  }
  return null;
}

class NseMcpClient {
  constructor() {
    this.live = new NseMcpConnection(NSE_MCP_LIVE_URL);
    this.history = new NseMcpConnection(NSE_MCP_BHAVCOPY_URL);
    this.stockCache = { at: 0, symbols: [] };
    this.snapshotStore = new Map();
  }

  async getAllStockSymbols() {
    if (this.stockCache.symbols.length && Date.now() - this.stockCache.at < 5 * 60 * 1000) return this.stockCache.symbols;
    const data = await this.live.callTool("cm_get_equity_stocks", {});
    const rows = extractRows(data);
    const symbols = [...new Set(rows.map(row => String(row?.symbol || row?.identifier || row?.securitySymbol || "").trim().toUpperCase()).filter(Boolean))];
    this.stockCache = { at: Date.now(), symbols };
    return symbols;
  }

  async getEquityDetails(symbol) {
    const data = await this.live.callTool("cm_get_stock_quote", { symbol: String(symbol).toUpperCase() });
    const row = Array.isArray(data) ? data[0] : (data?.data?.[0] || data?.quote || data);
    this.recordSnapshot(symbol, row);
    return {
      info: { companyName: row?.companyName || row?.company || symbol },
      priceInfo: {
        lastPrice: row?.lastPrice ?? row?.ltp ?? row?.last ?? row?.close,
        previousClose: row?.previousClose ?? row?.prevClose,
        pChange: row?.pChange ?? row?.percentChange,
        open: row?.open,
        vwap: row?.vwap,
        intraDayHighLow: { max: row?.dayHigh ?? row?.high, min: row?.dayLow ?? row?.low }
      },
      raw: row
    };
  }


  recordSnapshot(symbol, row) {
    const key = String(symbol).trim().toUpperCase();
    const price = Number(row?.lastPrice ?? row?.ltp ?? row?.last ?? row?.close);
    if (!Number.isFinite(price) || price <= 0) return;
    const timestamp = Date.now();
    const list = this.snapshotStore.get(key) || [];
    list.push({
      time: timestamp,
      o: price,
      h: price,
      l: price,
      c: price,
      v: Number(row?.totalTradedVolume ?? row?.volume ?? row?.tradedVolume ?? 0) || 0
    });
    const cutoff = timestamp - 7 * 24 * 60 * 60 * 1000;
    const trimmed = list.filter(x => x.time >= cutoff).slice(-10000);
    this.snapshotStore.set(key, trimmed);
  }

  async getIntradayCandles(symbol, timeframe = "5m") {
    const key = String(symbol).trim().toUpperCase();
    // Capture one fresh NSE snapshot whenever the chart endpoint is called.
    await this.getEquityDetails(key);
    const minutes = {"1m":1,"3m":3,"5m":5,"15m":15,"30m":30,"1h":60}[timeframe];
    if (!minutes) throw new Error(`Unsupported NSE intraday timeframe: ${timeframe}`);
    const snapshots = this.snapshotStore.get(key) || [];
    const buckets = new Map();
    for (const point of snapshots) {
      const bucket = Math.floor(point.time / (minutes * 60000)) * (minutes * 60000);
      let candle = buckets.get(bucket);
      if (!candle) {
        candle = { time: new Date(bucket).toISOString(), o: point.c, h: point.c, l: point.c, c: point.c, v: 0 };
        buckets.set(bucket, candle);
      } else {
        candle.h = Math.max(candle.h, point.c);
        candle.l = Math.min(candle.l, point.c);
        candle.c = point.c;
      }
      candle.v = Math.max(candle.v, point.v || 0);
    }
    return Array.from(buckets.values()).sort((a,b) => new Date(a.time)-new Date(b.time));
  }

  async getEquityTradeInfo(symbol) {
    const details = await this.getEquityDetails(symbol);
    const row = details.raw || {};
    return { marketDeptOrderBook: { tradeInfo: { totalTradedVolume: row?.totalTradedVolume ?? row?.volume ?? row?.tradedVolume } } };
  }

  async getEquityStockIndices(indexName) {
    const data = await this.callLiveMarket(indexName);
    const rows = extractRows(data);
    return { data: rows };
  }

  async getAllIndices() {
    const names = [
      "NIFTY 50",
      "NIFTY BANK",
      "NIFTY FIN SERVICE",
      "NIFTY IT",
      "NIFTY MIDCAP 100",
      "NIFTY NEXT 50",
      "NIFTY PHARMA",
      "NIFTY SMLCAP 100"
    ];
    const rows = [];
    for (const name of names) {
      try {
        const data = await this.callLiveMarket(name);
        const found = extractRows(data);
        if (found.length) {
          const indexRow = found.find(row => {
            const n = String(row?.index || row?.indexSymbol || row?.name || "").toUpperCase();
            return n.includes(name.toUpperCase()) || name.toUpperCase().includes(n);
          });
          if (indexRow) rows.push(indexRow);
        }
      } catch (_) {}
    }
    return { data: rows };
  }

  async callLiveMarket(indexName) {
    const tools = await this.live.listTools();
    const tool = tools.find(t => t.name === "cm_get_live_market_data");
    const schema = tool?.inputSchema || tool?.parameters || {};
    const props = schema.properties || {};
    const args = {};
    const names = Object.keys(props);
    if (names.length) {
      const preferred = names.find(k => /index|symbol|variation|segment|name/i.test(k)) || names[0];
      args[preferred] = indexName;
    }
    return this.live.callTool("cm_get_live_market_data", args);
  }

  async getEquityHistoricalData(symbol, { start, end }) {
    const data = await this.history.callTool("get_stock_history", {
      symbol: String(symbol).toUpperCase(),
      startDate: start instanceof Date ? start.toISOString().slice(0, 10) : String(start),
      endDate: end instanceof Date ? end.toISOString().slice(0, 10) : String(end)
    });
    const rows = extractRows(data);
    return [{ data: rows }];
  }

  async getEquitySymbolInfo(symbol) {
    const symbols = await this.getAllStockSymbols();
    const normalized = String(symbol).trim().toUpperCase();
    if (!symbols.includes(normalized)) return null;
    return { scripcode: normalized, symbol: normalized };
  }

  async getIndexHistoricalData(symbol, { start, end }) {
    const data = await this.history.callTool("get_stock_history", {
      symbol: String(symbol).toUpperCase(),
      startDate: start instanceof Date ? start.toISOString().slice(0, 10) : String(start),
      endDate: end instanceof Date ? end.toISOString().slice(0, 10) : String(end)
    });
    return [{ data: extractRows(data) }];
  }

  async getEquityChartHistoricalData() {
    throw new Error("NSE MCP does not provide intraday OHLC candles. EMA360 builds new intraday candles from the live NSE snapshot instead.");
  }

  async getIndexIntradayData(symbol) {
    const quote = await this.live.callTool("cm_get_stock_quote", { symbol: String(symbol).toUpperCase() });
    const row = Array.isArray(quote) ? quote[0] : (quote?.data?.[0] || quote?.quote || quote);
    const price = Number(row?.lastPrice ?? row?.ltp ?? row?.last ?? row?.close);
    const now = Math.floor(Date.now() / 1000);
    return { grapthData: Number.isFinite(price) ? [[now, price]] : [] };
  }
}

module.exports = { NseMcpClient };
