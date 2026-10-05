import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-help-page',
  imports: [RouterLink],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Help and data</p>
        <h1>Using BitStockerz</h1>
        <p class="lede">A strategy research and paper-trading workspace.</p>
      </div>
    </section>
    <section class="panel block">
      <h2>Your first research result</h2>
      <ol>
        <li>
          Open <a routerLink="/strategies/new">Strategy Lab</a>, select a starter template, and read
          its indicators and entry/exit rules. A moving average smooths prices; RSI measures recent
          upward and downward changes.
        </li>
        <li>Customize the rules and risk thresholds, validate, and save a version.</li>
        <li>
          Run a <a routerLink="/backtests/new">backtest</a> on a matching symbol and date range.
          Choose cash allocation, costs, and fill timing.
        </li>
        <li>
          Review return, drawdown (the largest peak-to-trough loss), trade count, and the
          buy-and-hold benchmark. Sparse samples are weak evidence.
        </li>
        <li>
          Duplicate or edit the strategy, compare runs with the same assumptions, then test a
          separate date range you did not use for tuning.
        </li>
        <li>
          Use a <a routerLink="/automations">paper runner</a> to forward test with fresh data once
          ingestion is configured. Paper results are simulations and do not establish live returns.
        </li>
      </ol>
    </section>
    <section class="panel block">
      <h2>Market data and fills</h2>
      <p>
        Charts show OHLCV candles and optional saved-strategy indicators. Timestamps use UTC. The
        latest candle time is visible; historical chart data is not a current quote. Seed mode uses
        synthetic demonstration data. Production database mode never falls back to seed prices.
      </p>
      <p>
        Paper orders fill at an eligible latest close. Runners check stops and targets at the close.
        Historical backtests model long positions, adverse slippage, per-side fees, stop-first
        intrabar risk exits, and final-bar liquidation. Overnight gaps, liquidity, spread, taxes,
        dividends, and live execution are not fully modeled.
      </p>
    </section>
    <section class="panel block">
      <h2>Account data policy</h2>
      <p>
        The application stores your profile, sign-in methods, sessions, strategies, backtests,
        watchlist, paper ledger, runner activity, and operational usage/audit metadata. It uses
        authentication provider information to sign you in and link accounts. Optional Kernel AI
        sends bounded strategy/backtest context to its configured provider; it does not execute
        changes or trades.
      </p>
      <p>
        You can download a personal-data export from <a routerLink="/account/data">Account data</a>.
        It excludes bearer tokens, OAuth secrets, and passkey public keys. CSV exports are available
        on results and trading pages.
      </p>
      <p>
        A paper-account reset archives the previous ledger, restores the original balance, and stops
        runners. The archive remains in your account until account deletion. Archived order IDs
        cannot be reused.
      </p>
      <p>
        Deletion requires a sign-in within five minutes and your account email. After pending jobs
        finish, deletion removes owned data and sign-in credentials from the active application
        database and revokes sessions. Shared market data remains. Host logs and backups have
        separate retention; the operator must publish those periods and contact details before
        public launch. A restored backup must reapply deletion requests before it serves traffic.
      </p>
    </section>
    <section class="panel block">
      <h2>Support and feedback</h2>
      <p>
        This is a prelaunch product. Repository members can
        <a
          href="https://github.com/JustinPaoletta/BitStockerz/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          >report an issue</a
        >. A public support contact is pending operator configuration.
      </p>
      <p>
        Include the page, expected behavior, UTC time, reproduction steps, and the request ID shown
        with an API error. Share sanitized screenshots when helpful. Never include passwords, API
        keys, tokens, OAuth callback links, or exported personal data in an issue.
      </p>
    </section>
  `,
  styles: `
    .block {
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    li {
      margin-bottom: 0.6rem;
    }
  `,
})
export class HelpPage {}
