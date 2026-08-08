import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { InlineErrorComponent } from '../../../shared/ui/inline-error.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton.component';
import { StrategiesApiService, StrategySummary } from '../data/strategies-api.service';

@Component({
  selector: 'app-strategy-list-page',
  imports: [RouterLink, SkeletonComponent, InlineErrorComponent, EmptyStateComponent],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Strategy Lab</p>
        <h1>Your strategies</h1>
      </div>
      <a class="button primary" routerLink="/strategies/new">Create strategy</a>
    </section>

    @switch (state()) {
      @case ('loading') {
        <app-skeleton height="12rem" />
      }
      @case ('error') {
        <app-inline-error [message]="error()" (retry)="load()" />
      }
      @case ('empty') {
        <app-empty-state
          title="Create your first strategy"
          message="Define indicators, entry/exit rules, and risk before running a backtest."
          ctaLabel="Create strategy"
          ctaLink="/strategies/new"
        />
      }
      @case ('ready') {
        <div class="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Asset</th>
                <th>Timeframe</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr class="clickable" [routerLink]="['/strategies', item.id]">
                  <td>{{ item.name }}</td>
                  <td>{{ item.asset_type }}</td>
                  <td>{{ item.timeframe }}</td>
                  <td>{{ item.updated_at }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
  styles: `
    .clickable {
      cursor: pointer;
    }
    .clickable:hover {
      background: var(--surface-2);
    }
    .panel {
      padding: 0.5rem 1rem 1rem;
    }
  `,
})
export class StrategyListPage implements OnInit {
  protected readonly items = signal<StrategySummary[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  protected readonly error = signal('Failed to load strategies.');
  private readonly api = inject(StrategiesApiService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .list(50, 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.items.set(response.items);
          this.state.set(response.items.length ? 'ready' : 'empty');
        },
        error: (error: Error) => {
          this.error.set(error.message);
          this.state.set('error');
        },
      });
  }
}
