import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { PageGuideComponent } from '../../../shared/ui/page-guide.component';
import { InlineErrorComponent } from '../../../shared/ui/inline-error.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton.component';
import { StrategiesApiService, StrategySummary } from '../data/strategies-api.service';

@Component({
  selector: 'app-strategy-list-page',
  imports: [
    RouterLink,
    SkeletonComponent,
    InlineErrorComponent,
    EmptyStateComponent,
    PageGuideComponent,
  ],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Strategy Lab</p>
        <h1>Get Strategic</h1>
        <app-page-guide
          description="A strategy is a set of rules that says when to enter and exit trades using an indicator."
          [steps]="[
            'Create strategy and fill in indicator, entry, exit, and risk fields.',
            'Validate, then save.',
            'Open the strategy and choose Run backtest to test it on history.',
          ]"
        />
      </div>
      <a class="button primary" routerLink="/strategies/new">Create strategy</a>
    </section>

    @if (error()) {
      <app-inline-error [message]="error()" (retry)="load()" />
    }
    <div [attr.aria-busy]="loading()">
      @if (loading() && items().length === 0) {
        <app-skeleton height="12rem" />
      } @else if (!loading() && !error() && items().length === 0) {
        <app-empty-state
          [title]="offset() === 0 ? 'Create your first strategy' : 'No strategies on this page'"
          [message]="
            offset() === 0
              ? 'Use Create strategy above, then run a backtest from its detail page.'
              : 'Use Previous to return to your strategies.'
          "
        />
      } @else if (items().length > 0) {
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
                <tr>
                  <td>
                    <a class="strategy-link" [routerLink]="['/strategies', item.id]">
                      {{ item.name }}
                    </a>
                  </td>
                  <td>{{ item.asset_type }}</td>
                  <td>{{ item.timeframe }}</td>
                  <td>{{ item.updated_at }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
    @if (items().length > 0 || offset() > 0) {
      <nav class="pagination" aria-label="Strategy pages">
        <button
          class="button secondary"
          type="button"
          [disabled]="loading() || offset() === 0"
          (click)="previousPage()"
        >
          Previous
        </button>
        <span role="status">
          @if (loading()) {
            Loading page {{ requestedOffset / pageSize + 1 }}…
          } @else {
            Page {{ offset() / pageSize + 1 }}
          }
        </span>
        <button
          class="button secondary"
          type="button"
          [disabled]="loading() || !hasMore()"
          (click)="nextPage()"
        >
          Next
        </button>
      </nav>
    }
  `,
  styles: `
    .strategy-link {
      color: var(--accent);
      display: inline-block;
      font-weight: 600;
      padding-block: 0.4rem;
      text-underline-offset: 0.2em;
    }
    .strategy-link:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 4px;
    }
    .panel {
      padding: 0.5rem 1rem 1rem;
    }
    .pagination {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      justify-content: space-between;
      margin-top: 1rem;
    }
    .pagination span {
      color: var(--muted);
    }
    app-inline-error {
      display: block;
      margin-bottom: 1rem;
    }
  `,
})
export class StrategyListPage implements OnInit {
  protected readonly items = signal<StrategySummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly offset = signal(0);
  protected readonly hasMore = signal(false);
  protected readonly pageSize = 50;
  protected requestedOffset = 0;
  private readonly api = inject(StrategiesApiService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.load();
  }

  protected previousPage(): void {
    if (!this.loading() && this.offset() > 0) this.load(this.offset() - this.pageSize);
  }

  protected nextPage(): void {
    if (!this.loading() && this.hasMore()) this.load(this.offset() + this.pageSize);
  }

  protected load(offset = this.requestedOffset): void {
    this.requestedOffset = offset;
    this.loading.set(true);
    this.error.set('');
    this.api
      .list(this.pageSize, offset)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.items.set(response.items);
          this.offset.set(offset);
          this.hasMore.set(response.has_more);
          this.loading.set(false);
        },
        error: (error: Error) => {
          this.error.set(`Could not load page ${offset / this.pageSize + 1}. ${error.message}`);
          this.loading.set(false);
        },
      });
  }
}
