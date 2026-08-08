import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-empty-state',
  imports: [RouterLink],
  template: `
    <div class="empty panel">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
      <p class="lede">{{ message }}</p>
      @if (ctaLabel && ctaLink) {
        <a class="button primary" [routerLink]="ctaLink">{{ ctaLabel }}</a>
      }
    </div>
  `,
  styles: `
    .empty {
      padding: 1.5rem;
    }
    h2 {
      margin: 0.35rem 0 0.75rem;
    }
  `,
})
export class EmptyStateComponent {
  @Input() eyebrow = 'Getting started';
  @Input({ required: true }) title!: string;
  @Input({ required: true }) message!: string;
  @Input() ctaLabel?: string;
  @Input() ctaLink?: string | string[];
}
