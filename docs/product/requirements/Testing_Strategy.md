# BitStockerz – Testing Strategy

This document defines how correctness is validated for the BitStockerz MVP.

## 1. Testing Levels

### 1.1 Unit Tests
Focus: deterministic logic, no I/O.

Covered areas:
- Indicator calculations (SMA, EMA, RSI, etc.)
- Strategy rule evaluation (entry/exit conditions)
- Backtest P&L math (trade P&L, equity curve updates)
- Position math (avg cost, quantity updates)

Rules:
- No database access
- No external APIs
- Fixed input → fixed output

### 1.2 Integration Tests
Focus: API + database working together.

Covered areas:
- Strategy CRUD
- Backtest creation & persistence
- Order placement → execution → position update
- Auth-scoped access (user isolation)

Rules:
- Real database (test instance)
- Migrations applied before tests
- Deterministic fixtures for OHLCV data

### 1.3 End-to-End (E2E)
Focus: user-visible flows.

Happy paths:
- Register → create strategy → run backtest → view results
- Place paper trade → view position & P&L

Failure paths:
- Invalid strategy definition
- Backtest failure due to missing data

## 2. Test Data
- Small OHLCV fixtures (10–100 candles)
- Predefined strategy JSON fixtures
- Deterministic timestamps

## 3. CI Enforcement
- Unit + integration tests required before merge
- E2E optional for MVP, mandatory before public release
