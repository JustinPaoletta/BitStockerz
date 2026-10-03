import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-page-guide',
  template: `
    @if (description) {
      <p class="lede">{{ description }}</p>
    }
    @if (steps.length) {
      <ol class="page-guide-steps">
        @for (step of steps; track $index) {
          <li>{{ step }}</li>
        }
      </ol>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .page-guide-steps {
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.55;
      margin: 0.65rem 0 0;
      max-width: 62ch;
      padding-left: 1.35rem;
    }
    .page-guide-steps li + li {
      margin-top: 0.35rem;
    }
  `,
})
export class PageGuideComponent {
  @Input() description = '';
  @Input() steps: string[] = [];
}
