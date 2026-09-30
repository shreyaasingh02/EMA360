⭐ EMA360 — Intelligent Trading & Market Analysis Dashboard

EMA360 is a full-stack web-based trading and market analysis dashboard designed to provide a centralized interface for monitoring the Indian stock market, analyzing market data, visualizing price movements, and managing trading-related information.

The project combines a modern React frontend with a Node.js/Express backend and integrates real-time market data through Angel One SmartAPI.

> ⚠️ Disclaimer: EMA360 is a software/educational project for market-data visualization and trading workflow experimentation. It does not provide financial advice or guarantee trading profits.

 

🚀 Project Overview

EMA360 is built to bring multiple parts of a trader's workflow into a single dashboard.

Instead of switching between different interfaces for market prices, charts, indicators, trade inputs, and trade history, EMA360 provides a unified workspace.

The application focuses on:

- 📊 Live market data
- 📈 Price and chart visualization
- 📉 Technical analysis
- 🔄 Dynamic stock selection
- 💹 Trading workflow management
- 🧮 Market and trade calculations
- 🗂️ Active and historical trade tracking
- 🔐 Secure API credential management
- ⚡ Full-stack real-time data flow

 

✨ Key Features

📊 Market Data Dashboard

EMA360 displays dynamically updated market information for selected instruments.

The market dashboard is designed to provide information such as:

- Instrument name
- Current price
- Price movement
- Market status
- Market-related statistics
- Selected stock/index information

The dashboard is designed around NSE market data while using Angel One SmartAPI as the market-data source when authenticated.

 

📈 Dynamic Stock Selection

Users can select different supported stocks/instruments from the dashboard.

When the selected instrument changes, the relevant:

- Market card
- Main instrument heading
- Price information
- Chart
- Trading information

are updated accordingly.

The architecture separates the **currently selected dashboard instrument** from manually selected instruments used in different trading/input sections.

 

📉 Trading Chart

EMA360 includes a TradingView-inspired market chart interface.

The chart is designed to display:

- Candlestick data
- Historical price movement
- Multiple time intervals
- Dynamic stock selection
- Price visualization
- Technical-analysis related information

The project is structured so that market candle data can be received from the backend rather than relying on manually created/fake market values.

 

📐 Technical Analysis

EMA360 includes technical-analysis functionality used for understanding price behaviour.

The dashboard can work with market-derived values such as:

- EMA
- VWAP
- Price levels
- Target levels
- Stop-loss levels
- Profit/Loss calculations

These calculations are integrated into the trading workflow rather than being isolated calculations.

 

💰 Trade Management

The application includes an active trade management interface.

The workflow supports concepts such as:

- Buy
- Sell
- Entry price
- Exit price
- Target levels
- Stop-loss
- Profit/Loss
- Trade status
- Editing trade information
- Exiting trades

The dashboard separates currently active trades from historical trades so that the current trading state remains easy to monitor.

 
 
📋 Active Trade Table

EMA360 maintains an active-trade section where currently relevant trades can be displayed.

The interface is designed around a limited active-trade workflow, with trades moving into historical records when they are completed or displaced according to the dashboard's trade-management logic.

 

🗃️ Trade History

Completed trades can be moved into a historical table.

The history section provides a way to review previously completed trading activity without mixing it with currently active trades.

The interface also supports managing a larger history through a compact table/view system.

 

🔄 Dynamic Dashboard State

One of the important design goals of EMA360 is keeping different parts of the dashboard synchronized without unintentionally changing unrelated selections.

For example:

- The main dashboard stock can change independently.
- The input/trading stock can be selected independently.
- Changing an input selection should not unexpectedly overwrite the dashboard selection.
- Market cards should reflect the appropriate selected instrument.
- Chart data should correspond to the instrument being displayed.

This state-management separation is an important part of the frontend architecture.

