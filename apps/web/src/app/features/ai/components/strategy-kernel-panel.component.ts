import { Component, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AiApiService,
  type AiExplainStrategyResponse,
  type AiValidateStrategyResponse,
} from '../data/ai-api.service';

@Component({
  selector: 'app-strategy-kernel-panel',
  template: `
    <section class="panel kernel-panel" aria-label="Kernel AI">
      <div class="section-title">
        <div>
          <p class="eyebrow">Kernel</p>
          <h2>Strategy insights</h2>
        </div>
        <div class="actions">
          <button
            class="button secondary"
            type="button"
            [disabled]="busy()"
            (click)="explain()"
          >
            {{ busy() === 'explain' ? 'Explaining…' : 'Explain' }}
          </button>
          <button
            class="button secondary"
            type="button"
            [disabled]="busy()"
            (click)="validate()"
          >
            {{ busy() === 'validate' ? 'Checking…' : 'Check for issues' }}
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
      }

      @if (validation(); as result) {
        <p class="disclaimer">{{ result.disclaimer }}</p>
        <p class="confidence">Confidence: {{ result.confidence }}</p>
        @if (result.warnings.length === 0) {
          <p class="body">No logical issues detected.</p>
        } @else {
          <ul>
            @for (warning of result.warnings; track warning.code + warning.message) {
              <li>
                <strong>{{ warning.severity }}</strong> · {{ warning.code }} —
                {{ warning.message }}
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: `
    .kernel-panel {
      display: grid;
      gap: 0.85rem;
      margin-top: 1.25rem;
      padding: 1.25rem;
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
    .confidence {
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
export class StrategyKernelPanelComponent {
  readonly strategyId = input.required<string>();
  private readonly api = inject(AiApiService);
  protected readonly busy = signal<'explain' | 'validate' | null>(null);
  protected readonly error = signal('');
  protected readonly explanation = signal<AiExplainStrategyResponse | null>(null);
  protected readonly validation = signal<AiValidateStrategyResponse | null>(null);

  protected async explain(): Promise<void> {
    if (this.busy()) return;
    this.busy.set('explain');
    this.error.set('');
    try {
      const result = await firstValueFrom(this.api.explainStrategy(this.strategyId()));
      this.explanation.set(result);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Explain failed.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async validate(): Promise<void> {
    if (this.busy()) return;
    this.busy.set('validate');
    this.error.set('');
    try {
      const result = await firstValueFrom(this.api.validateStrategy(this.strategyId()));
      this.validation.set(result);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Validation failed.');
    } finally {
      this.busy.set(null);
    }
  }
}
