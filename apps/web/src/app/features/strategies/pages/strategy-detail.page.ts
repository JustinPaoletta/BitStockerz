import { JsonPipe } from '@angular/common';
import { BsDateTimePipe } from '../../../shared/format/display.pipes';
import {
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { InlineErrorComponent } from '../../../shared/ui/inline-error.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton.component';
import { PageGuideComponent } from '../../../shared/ui/page-guide.component';
import { StrategyKernelPanelComponent } from '../../ai/components/strategy-kernel-panel.component';
import { StrategiesApiService, StrategyDetail } from '../data/strategies-api.service';

@Component({
  selector: 'app-strategy-detail-page',
  imports: [
    RouterLink,
    SkeletonComponent,
    InlineErrorComponent,
    JsonPipe,
    BsDateTimePipe,
    StrategyKernelPanelComponent,
    PageGuideComponent,
  ],
  template: `
    @switch (state()) {
      @case ('loading') {
        <app-skeleton height="16rem" />
      }
      @case ('error') {
        <app-inline-error [message]="error()" (retry)="load()" />
      }
      @case ('ready') {
        @if (strategy(); as item) {
          <section class="page-heading">
            <div>
              <p class="eyebrow">Strategy · v{{ item.version_number }}</p>
              <h1>{{ item.name }}</h1>
              <p class="lede">{{ item.description || 'No description' }}</p>
              @if (item.is_latest === false) {
                <p class="hint">
                  Historical version — read only. Choose the latest version to edit or run a
                  backtest.
                </p>
              } @else {
                <app-page-guide
                  description="This is the rule set the backtester uses. Edit to change rules; Run backtest to see how it performs on history."
                />
              }
            </div>
            <div class="actions">
              @if (item.is_latest !== false) {
                <a class="button secondary" [routerLink]="['/strategies', item.id, 'edit']">Edit</a>
                <a
                  class="button primary"
                  [routerLink]="['/backtests/new']"
                  [queryParams]="{ strategy_id: item.id }"
                  >Run backtest</a
                >
                <button class="button secondary" type="button" (click)="duplicate()">
                  Duplicate
                </button>
                <button class="button ghost" type="button" (click)="remove()">Delete</button>
              }
            </div>
          </section>

          <div class="panel meta-panel">
            <label for="version">Version</label>
            <select id="version" [value]="item.version_number" (change)="onVersion($event)">
              @for (version of versions(); track version) {
                <option [value]="version">v{{ version }}</option>
              }
            </select>
            <dl>
              <div>
                <dt>Asset</dt>
                <dd>{{ item.asset_type }}</dd>
              </div>
              <div>
                <dt>Timeframe</dt>
                <dd>{{ item.timeframe }}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{{ item.updated_at | bsDateTime }}</dd>
              </div>
            </dl>
            @if (item.summary) {
              <p class="lede">{{ item.summary }}</p>
            }
            <details>
              <summary>View rule definition</summary>
              <pre>{{ item.definition | json }}</pre>
            </details>
          </div>

          <app-strategy-kernel-panel [strategyId]="item.id" />
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .meta-panel {
      display: grid;
      gap: 1rem;
      padding: 1.25rem;
    }
    dl {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin: 0;
    }
    dt {
      color: var(--muted);
      font-size: 0.75rem;
    }
    dd {
      margin: 0.2rem 0 0;
    }
    dd {
      overflow-wrap: anywhere;
    }
    summary {
      cursor: pointer;
      padding-block: 0.5rem;
    }
    pre {
      background: var(--surface-inset);
      border-radius: 0.75rem;
      overflow: auto;
      padding: 1rem;
      white-space: pre-wrap;
    }
  `,
})
export class StrategyDetailPage implements OnInit {
  protected readonly strategy = signal<StrategyDetail | null>(null);
  protected readonly versions = signal<number[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly error = signal('Failed to load strategy.');
  private latestVersion = 1;
  private readonly api = inject(StrategiesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.load();
  }

  protected async duplicate(): Promise<void> {
    const item = this.strategy();
    if (!item) return;
    try {
      const copy = await firstValueFrom(
        this.api.create({
          name: `${item.name.slice(0, 100)} copy ${Date.now().toString(36)}`,
          description: item.description ?? undefined,
          asset_type: item.asset_type,
          timeframe: item.timeframe,
          definition: structuredClone(item.definition),
        }),
      );
      await this.router.navigate(['/strategies', copy.id, 'edit']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to duplicate strategy.');
      this.state.set('error');
    }
  }

  protected load(version?: number): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.state.set('loading');
    this.api
      .get(id, version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (item) => {
          if (item.is_latest !== false) {
            this.latestVersion = item.version_number;
          }
          this.strategy.set(item);
          this.versions.set(
            Array.from({ length: this.latestVersion }, (_, i) => this.latestVersion - i),
          );
          this.state.set('ready');
        },
        error: (error: Error) => {
          this.error.set(error.message);
          this.state.set('error');
        },
      });
  }

  protected onVersion(event: Event): void {
    const version = Number((event.target as HTMLSelectElement).value);
    this.load(version);
  }

  protected async remove(): Promise<void> {
    const item = this.strategy();
    if (!item) return;
    if (!confirm(`Delete strategy “${item.name}”?`)) return;
    try {
      await firstValueFrom(this.api.delete(item.id));
      await this.router.navigate(['/strategies']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Delete failed.');
      this.state.set('error');
    }
  }
}
