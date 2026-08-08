import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-bs-card',
  template: `
    <section class="card panel">
      <header>
        <div>
          <p class="eyebrow">{{ eyebrow }}</p>
          <h2>{{ title }}</h2>
        </div>
        <ng-content select="[cardActions]" />
      </header>
      <div class="body">
        <ng-content />
      </div>
    </section>
  `,
  styles: `
    .card {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      padding: 1.15rem 1.25rem 1.25rem;
    }
    header {
      align-items: start;
      display: flex;
      gap: 1rem;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    h2 {
      font-size: 1.15rem;
      margin: 0.2rem 0 0;
    }
  `,
})
export class BsCardComponent {
  @Input() eyebrow = 'Widget';
  @Input({ required: true }) title!: string;
}
