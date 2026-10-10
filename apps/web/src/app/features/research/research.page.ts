import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { StrategiesApiService } from '../strategies/data/strategies-api.service';
import { STRATEGY_TEMPLATES } from '../strategies/data/strategy-templates';

@Component({
  selector: 'app-research-page',
  imports: [RouterLink],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Research prototype</p>
        <h1>From chart to backtest</h1>
        <p class="lede">Explore a price series, test a rule, then inspect its results.</p>
      </div>
    </section>
    <section class="panel">
      <h2>1. Explore the chart</h2>
      <p>
        Start with AAPL daily candles. Pan and zoom, inspect individual bars, or open the accessible
        data table.
      </p>
      <a class="button primary" routerLink="/market" [queryParams]="{ symbol: 'AAPL' }"
        >Open chart</a
      >
    </section>
    <section class="panel">
      <h2>2. Test a moving average crossover</h2>
      <p>
        Create a saved strategy using the 10-bar and 30-bar moving averages, a 2% stop loss, and a
        5% take profit.
      </p>
      <p>
        Next, choose the date range, starting capital, allocation, commissions, slippage, and
        execution timing. Run the backtest to see its status, equity curve, benchmark, metrics, and
        individual trades.
      </p>
      <button class="button primary" type="button" [disabled]="busy()" (click)="start()">
        {{ busy() ? 'Preparing…' : 'Set up a backtest' }}
      </button>
      @if (error()) {
        <p role="alert" class="error">{{ error() }}</p>
      }
    </section>
    <section class="panel">
      <h2>3. Review and repeat</h2>
      <p>
        Return to a saved run, inspect its settings, or run another test. Local prototype accounts
        and runs last only while the prototype API is running.
      </p>
      <a class="button secondary" routerLink="/backtests">View backtest history</a>
    </section>
  `,
  styles: `
    .panel {
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    p {
      line-height: 1.6;
    }
  `,
})
export class ResearchPage {
  private readonly strategies = inject(StrategiesApiService);
  private readonly router = inject(Router);
  private strategyId?: string;
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async start(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (!this.strategyId) {
        const template = STRATEGY_TEMPLATES[0];
        const strategy = await firstValueFrom(
          this.strategies.create({
            name: 'Research crossover',
            description: template.description,
            asset_type: 'EQUITY',
            timeframe: '1d',
            definition: structuredClone(template.definition),
          }),
        );
        this.strategyId = strategy.id;
      }
      await this.router.navigate(['/backtests/new'], {
        queryParams: { strategy_id: this.strategyId },
      });
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Unable to prepare the strategy. Try again.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
