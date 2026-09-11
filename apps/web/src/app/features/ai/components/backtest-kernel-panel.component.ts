import { Component, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AiApiService,
  type AiExplainBacktestResponse,
  type AiSuggestImprovementsResponse,
} from '../data/ai-api.service';

@Component({
  selector: 'app-backtest-kernel-panel',
  template: `
    <section class="panel kernel-panel" aria-label="Kernel AI">
      <div class="section-title">
        <div>
          <p class="eyebrow">Kernel</p>
          <h2>Result insights</h2>
        </div>
        <div class="actions">
          <button
            class="button secondary"
            type="button"
            [disabled]="busy()"
            (click)="explain()"
          >
            {{ busy() === 'explain' ? 'Explaining…' : 'Explain results' }}
          </button>
          <button
            class="button secondary"
            type="button"
            [disabled]="busy()"
            (click)="suggest()"
          >
            {{ busy() === 'suggest' ? 'Suggesting…' : 'Suggest improvements' }}
          </button>
        </div>
      </div>

      @if (error()) {
        <p class="kernel-error" role="alert">{{ error() }}</p>
      }

      @if (explanation(); as result) {
        <p class="disclaimer">{{ result.disclaimer }}</p>
        <p class="confidence">Confidence: {{ result.confidence }}</p>
        <p class="body">{{ result.explanation }}</p>
        @if (result.issues.length) {
          <ul>
            @for (issue of result.issues; track issue.code + issue.message) {
              <li>
                <strong>{{ issue.severity }}</strong> · {{ issue.code }} — {{ issue.message }}
              </li>
            }
          </ul>
        }
      }

      @if (suggestions(); as result) {
        <p class="disclaimer">{{ result.disclaimer }}</p>
        <p class="confidence">Confidence: {{ result.confidence }}</p>
        <ul>
          @for (item of result.suggestions; track item.code) {
            <li>
              <strong>{{ item.title }}</strong> — {{ item.description }}
            </li>
          }
        </ul>
        <p class="hint">Suggestions are advisory only. There is no Apply action.</p>
      }
    </section>
  `,
  styles: `
    .kernel-panel {
      display: grid;
      gap: 0.85rem;
      margin-top: 1.25rem;
      padding: clamp(1.1rem, 3vw, 2rem);
    }
    .section-title {
      align-items: start;
      display: flex;
      gap: 1rem;
      justify-content: space-between;
    }
    .section-title h2 {
      margin: 0.15rem 0 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .disclaimer,
    .confidence,
    .hint {
      color: var(--muted);
      font-size: 0.85rem;
      margin: 0;
    }
    .body {
      margin: 0;
      white-space: pre-wrap;
    }
    .kernel-error {
      color: #b42318;
      margin: 0;
    }
    ul {
      margin: 0;
      padding-left: 1.1rem;
    }
  `,
})
export class BacktestKernelPanelComponent {
  readonly strategyId = input.required<string>();
  readonly backtestRunId = input.required<string>();
  private readonly api = inject(AiApiService);
  protected readonly busy = signal<'explain' | 'suggest' | null>(null);
  protected readonly error = signal('');
  protected readonly explanation = signal<AiExplainBacktestResponse | null>(null);
  protected readonly suggestions = signal<AiSuggestImprovementsResponse | null>(null);

  protected async explain(): Promise<void> {
    if (this.busy()) return;
    this.busy.set('explain');
    this.error.set('');
    try {
      const result = await firstValueFrom(this.api.explainBacktest(this.backtestRunId()));
      this.explanation.set(result);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Explain failed.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async suggest(): Promise<void> {
    if (this.busy()) return;
    this.busy.set('suggest');
    this.error.set('');
    try {
      const result = await firstValueFrom(
        this.api.suggestImprovements(this.strategyId(), this.backtestRunId()),
      );
      this.suggestions.set(result);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Suggestions failed.');
    } finally {
      this.busy.set(null);
    }
  }
}
