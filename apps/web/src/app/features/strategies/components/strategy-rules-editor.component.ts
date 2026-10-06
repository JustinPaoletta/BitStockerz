import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { StrategyDefinition } from '../data/strategies-api.service';

type Condition = StrategyDefinition['entry']['conditions'][number];
type Operand = Condition['left'];

@Component({
  selector: 'app-strategy-rules-editor',
  imports: [FormsModule],
  template: `
    <h2>Indicators</h2>
    @for (item of definition.indicators; track $index; let i = $index) {
      <fieldset>
        <legend>Indicator {{ i + 1 }}</legend>
        <label
          >Name
          <input
            [ngModel]="item.id"
            [ngModelOptions]="standalone"
            (ngModelChange)="updateIndicator(i, 'id', $event)"
        /></label>
        <label
          >Type
          <select
            [ngModel]="item.type"
            [ngModelOptions]="standalone"
            (ngModelChange)="updateIndicator(i, 'type', $event)"
          >
            <option>SMA</option>
            <option>EMA</option>
            <option>RSI</option>
          </select></label
        >
        <label
          >Period
          <input
            type="number"
            min="2"
            [max]="item.type === 'RSI' ? 100 : 200"
            [ngModel]="item.params['period']"
            [ngModelOptions]="standalone"
            (ngModelChange)="updateIndicator(i, 'period', $event)"
        /></label>
        <label
          >Price source
          <select
            [ngModel]="item.source"
            [ngModelOptions]="standalone"
            (ngModelChange)="updateIndicator(i, 'source', $event)"
          >
            @for (source of item.type === 'RSI' ? ['close'] : prices; track source) {
              <option [value]="source">{{ source }}</option>
            }
          </select></label
        >
        <button class="button secondary" type="button" (click)="removeIndicator(i)">
          Remove indicator
        </button>
      </fieldset>
    }
    <button
      class="button secondary"
      type="button"
      [disabled]="definition.indicators.length >= 20"
      (click)="addIndicator()"
    >
      Add indicator
    </button>
    @for (group of groups; track group) {
      <h2>{{ group === 'entry' ? 'Buy when' : 'Sell when' }}</h2>
      <p class="hint">
        All conditions must be true. Crossovers compare this bar with the previous bar.
      </p>
      @for (condition of definition[group].conditions; track $index; let i = $index) {
        <fieldset>
          <legend>Condition {{ i + 1 }}</legend>
          @for (side of sides; track side) {
            <label
              >{{ side === 'left' ? 'Compare' : 'With' }}
              <select
                [ngModel]="operandKey(condition[side])"
                [ngModelOptions]="standalone"
                (ngModelChange)="setOperand(group, i, side, $event)"
              >
                <option value="literal">Number</option>
                @for (price of prices; track price) {
                  <option [value]="'price:' + price">{{ price }} price</option>
                }
                @for (indicator of definition.indicators; track $index) {
                  <option [value]="'indicator:' + indicator.id">
                    {{ indicator.id }} ({{ indicator.type }} {{ indicator.params['period'] }})
                  </option>
                }
              </select>
            </label>
            @if (operandKey(condition[side]) === 'literal') {
              <label
                >{{ side === 'left' ? 'Left number' : 'Right number' }}
                <input
                  type="number"
                  [ngModel]="literal(condition[side])"
                  [ngModelOptions]="standalone"
                  (ngModelChange)="setLiteral(group, i, side, $event)"
              /></label>
            }
          }
          <label
            >Relationship
            <select
              [ngModel]="condition.op"
              [ngModelOptions]="standalone"
              (ngModelChange)="setOperator(group, i, $event)"
            >
              @for (operator of operators; track operator.value) {
                <option [value]="operator.value">{{ operator.label }}</option>
              }
            </select></label
          >
          <button
            class="button secondary"
            type="button"
            [disabled]="definition[group].conditions.length <= 1"
            (click)="removeCondition(group, i)"
          >
            Remove condition
          </button>
        </fieldset>
      }
      <button
        class="button secondary"
        type="button"
        [disabled]="definition[group].conditions.length >= 10"
        (click)="addCondition(group)"
      >
        Add {{ group }} condition
      </button>
    }
    <p class="hint">
      Removing an indicator changes its referenced operands to close price. Review and validate the
      resulting rules.
    </p>
    <h2>Risk exits</h2>
    <div class="risk">
      <label
        >Stop loss %
        <input
          type="number"
          min="0.01"
          max="50"
          [ngModel]="definition.risk.stop_loss.value"
          [ngModelOptions]="standalone"
          (ngModelChange)="setRisk('stop_loss', $event)"
      /></label>
      <label
        >Take profit %
        <input
          type="number"
          min="0.01"
          max="500"
          [ngModel]="definition.risk.take_profit.value"
          [ngModelOptions]="standalone"
          (ngModelChange)="setRisk('take_profit', $event)"
      /></label>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    fieldset,
    .risk {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin: 1rem 0;
      padding: 1rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
    }
    label {
      display: grid;
      gap: 0.4rem;
      flex: 1;
      min-width: 130px;
    }
    h2 {
      margin-top: 1.5rem;
    }
  `,
})
export class StrategyRulesEditorComponent {
  @Input({ required: true }) definition!: StrategyDefinition;
  @Output() definitionChange = new EventEmitter<StrategyDefinition>();
  readonly standalone = { standalone: true };
  readonly prices = ['open', 'high', 'low', 'close'];
  readonly groups = ['entry', 'exit'] as const;
  readonly sides = ['left', 'right'] as const;
  readonly operators = [
    { value: 'gt', label: 'is greater than' },
    { value: 'gte', label: 'is at least' },
    { value: 'lt', label: 'is less than' },
    { value: 'lte', label: 'is at most' },
    { value: 'eq', label: 'equals' },
    { value: 'crosses_above', label: 'crosses above' },
    { value: 'crosses_below', label: 'crosses below' },
  ];

  private change(edit: (next: StrategyDefinition) => void): void {
    const next = structuredClone(this.definition);
    edit(next);
    this.definitionChange.emit(next);
  }
  operandKey(value: Operand): string {
    return 'indicator' in value
      ? `indicator:${value.indicator}`
      : 'price' in value
        ? `price:${value.price}`
        : 'literal';
  }
  literal(value: Operand): number {
    return 'literal' in value ? value.literal : 0;
  }
  setOperand(group: 'entry' | 'exit', index: number, side: 'left' | 'right', key: string): void {
    this.change((next) => {
      next[group].conditions[index][side] = key.startsWith('indicator:')
        ? { indicator: key.slice(10) }
        : key.startsWith('price:')
          ? { price: key.slice(6) }
          : { literal: 0 };
    });
  }
  setLiteral(group: 'entry' | 'exit', index: number, side: 'left' | 'right', value: number): void {
    this.change((next) => {
      next[group].conditions[index][side] = { literal: value };
    });
  }
  setOperator(group: 'entry' | 'exit', index: number, value: string): void {
    this.change((next) => {
      next[group].conditions[index].op = value;
    });
  }
  addCondition(group: 'entry' | 'exit'): void {
    this.change((next) => {
      next[group].conditions.push({ left: { price: 'close' }, op: 'gt', right: { literal: 100 } });
    });
  }
  removeCondition(group: 'entry' | 'exit', index: number): void {
    this.change((next) => {
      next[group].conditions.splice(index, 1);
    });
  }
  addIndicator(): void {
    this.change((next) => {
      let index = next.indicators.length + 1;
      while (next.indicators.some((item) => item.id === `indicator${index}`)) index++;
      next.indicators.push({
        id: `indicator${index}`,
        type: 'SMA',
        params: { period: 20 },
        source: 'close',
      });
    });
  }
  removeIndicator(index: number): void {
    this.change((next) => {
      const id = next.indicators[index].id;
      next.indicators.splice(index, 1);
      for (const group of this.groups)
        for (const condition of next[group].conditions)
          for (const side of this.sides)
            if ('indicator' in condition[side] && condition[side].indicator === id)
              condition[side] = { price: 'close' };
    });
  }
  updateIndicator(index: number, field: string, value: string | number): void {
    this.change((next) => {
      const indicator = next.indicators[index];
      if (field === 'period') indicator.params['period'] = Number(value);
      else if (field === 'id') {
        const old = indicator.id;
        indicator.id = String(value);
        for (const group of this.groups)
          for (const condition of next[group].conditions)
            for (const side of this.sides) {
              if ('indicator' in condition[side] && condition[side].indicator === old)
                condition[side] = { indicator: indicator.id };
            }
      } else if (field === 'type') {
        indicator.type = String(value);
        if (indicator.type === 'RSI') indicator.source = 'close';
      } else indicator.source = String(value);
    });
  }
  setRisk(field: 'stop_loss' | 'take_profit', value: number): void {
    this.change((next) => {
      next.risk[field].value = value;
    });
  }
}
