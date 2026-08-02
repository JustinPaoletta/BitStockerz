import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-strategies-placeholder-page',
  imports: [RouterLink],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Strategy Lab</p>
        <h1>Strategies</h1>
      </div>
    </section>
    <section class="panel state">
      <h2>The visual strategy builder arrives in Milestone 5.</h2>
      <p>
        For this Milestone 3 shell, create a strategy through the API and paste its ID into the run
        form.
      </p>
      <a class="button primary" routerLink="/backtests/new">Run a backtest</a>
    </section>
  `,
})
export class StrategiesPlaceholderPage {}
