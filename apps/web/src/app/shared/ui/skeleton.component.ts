import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  template: `<div class="skeleton" [style.minHeight]="height" [attr.aria-busy]="true"></div>`,
  styles: `
    .skeleton {
      animation: pulse 1.2s ease-in-out infinite;
      background: linear-gradient(90deg, var(--surface-2), #1c2c44, var(--surface-2));
      background-size: 200% 100%;
      border-radius: 0.75rem;
      min-height: 4.5rem;
    }
    @keyframes pulse {
      0% {
        background-position: 100% 0;
      }
      100% {
        background-position: -100% 0;
      }
    }
  `,
})
export class SkeletonComponent {
  @Input() height = '4.5rem';
}
