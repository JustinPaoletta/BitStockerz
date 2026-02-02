# BitStockerz MVP – 7) Dashboard / UI (Stories)

This document defines the epics and user stories for the **Dashboard / UI** layer of the BitStockerz MVP.

Scope:
- Central landing dashboard after login
- Portfolio and paper account summary
- Active strategies overview
- Recent trades and backtests
- Lightweight navigation across core modules

This is a **read-focused surface** that pulls together data from prior modules.
No heavy analytics logic lives here.

Dependencies:
- #1 User & Account
- #3 Paper Trading
- #4 Strategy Lab
- #5 Backtesting

---

## Epic 7.1 – Dashboard Shell & Navigation

### Story 7.1.1 – Authenticated app shell

**As a** user  
**I want** a consistent app layout after login  
**So that** navigation feels predictable

**Acceptance criteria**
- Global layout includes:
  - Top nav (logo, app name)
  - Primary nav items:
    - Dashboard
    - Trade
    - Strategies
    - Backtests
  - User menu (profile, logout)
- All routes require authentication.
- Mobile responsiveness is acceptable but not perfect (MVP).

---

### Story 7.1.2 – Dashboard landing route

**As a** user  
**I want** a single landing page after login  
**So that** I can quickly see my account state

**Acceptance criteria**
- Route: `/dashboard`
- Loads without blocking on non-critical widgets.
- Shows skeleton loaders while data fetches.

---

## Epic 7.2 – Portfolio Summary Widgets

### Story 7.2.1 – Account summary card

**As a** user  
**I want** to see my portfolio snapshot  
**So that** I understand my current exposure

**Acceptance criteria**
- Card displays:
  - Cash balance
  - Total equity
  - Unrealized P&L
- Data sourced from Paper Trading APIs.
- Numbers formatted consistently (currency, +/- coloring).

---

### Story 7.2.2 – Positions preview

**As a** user  
**I want** a quick view of my open positions  
**So that** I know what I’m holding

**Acceptance criteria**
- Table shows:
  - Symbol
  - Quantity
  - Avg cost
- Limited to top N positions (e.g. 5).
- Link to full trading/positions view.

---

## Epic 7.3 – Strategy Overview

### Story 7.3.1 – Active strategies list

**As a** user  
**I want** to see my saved strategies  
**So that** I can quickly manage or run them

**Acceptance criteria**
- Table shows:
  - Strategy name
  - Asset type
  - Timeframe
  - Last updated
- Clicking a row navigates to Strategy Lab editor.
- Inactive (deleted) strategies are hidden.

---

### Story 7.3.2 – Strategy quick actions

**As a** user  
**I want** shortcuts from the dashboard  
**So that** common actions are faster

**Acceptance criteria**
- Actions per strategy:
  - Edit
  - Run backtest
- Backtest action routes to pre-filled backtest form.

---

## Epic 7.4 – Backtest & Trade Activity

### Story 7.4.1 – Recent backtests widget

**As a** user  
**I want** to see my recent backtests  
**So that** I can revisit results quickly

**Acceptance criteria**
- List shows:
  - Strategy name
  - Symbol
  - Timeframe
  - Status
  - Created date
- Limited to last N runs (e.g. 5).
- Clicking navigates to backtest detail view.

---

### Story 7.4.2 – Recent trades widget

**As a** user  
**I want** to see my latest trades  
**So that** I can confirm activity at a glance

**Acceptance criteria**
- Table shows:
  - Time
  - Symbol
  - Side
  - Quantity
  - Price
- Limited to last N trades.
- Data sourced from paper trading executions.

---

## Epic 7.5 – Data Loading & Resilience

### Story 7.5.1 – Independent widget loading

**As a** user  
**I want** the dashboard to partially load  
**So that** one failing API doesn’t break everything

**Acceptance criteria**
- Each widget fetches data independently.
- Failure in one widget shows an inline error state.
- Other widgets still render normally.

---

### Story 7.5.2 – Empty and first-run states

**As a** new user  
**I want** clear empty states  
**So that** I know what to do next

**Acceptance criteria**
- If no trades:
  - Show “No trades yet” with link to Trade page.
- If no strategies:
  - Show “Create your first strategy” CTA.
- If no backtests:
  - Show “Run a backtest” CTA.

---

## Epic 7.6 – Visual Consistency & UX Basics

### Story 7.6.1 – Consistent formatting & components

**As a** platform  
**I want** consistent UI patterns  
**So that** the app feels cohesive

**Acceptance criteria**
- Shared components for:
  - Tables
  - Cards
  - Empty states
- Consistent formatting for:
  - Currency
  - Percentages
  - Dates/times

---

### Story 7.6.2 – Minimal performance optimization

**As a** user  
**I want** the dashboard to feel fast  
**So that** it doesn’t feel sluggish

**Acceptance criteria**
- Avoid over-fetching (limit results).
- No polling; refresh only on navigation or user action.
- Acceptable load time with mock production data.

---

## Explicitly Out of Scope (MVP)

- Custom dashboard layouts
- Drag-and-drop widgets
- Real-time streaming updates
- Advanced analytics panels

