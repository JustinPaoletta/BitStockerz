import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-inline-error',
  template: `
    <div class="inline-error" role="alert">
      <p>{{ message }}</p>
      @if (retryable) {
        <button class="button ghost small" type="button" (click)="retry.emit()">Retry</button>
      }
    </div>
  `,
  styles: `
    .inline-error {
      align-items: center;
      background: var(--danger-bg);
      border: 1px solid var(--negative-border);
      border-radius: 0.75rem;
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
      padding: 0.85rem 1rem;
    }
    p {
      color: var(--error-text);
      margin: 0;
    }
  `,
})
export class InlineErrorComponent {
  @Input({ required: true }) message!: string;
  @Input() retryable = true;
  @Output() readonly retry = new EventEmitter<void>();
}
