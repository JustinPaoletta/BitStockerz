import { Component, inject, OnInit, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, CanDeactivateFn, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { InlineErrorComponent } from '../../../shared/ui/inline-error.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton.component';
import {
  StrategiesApiService,
  StrategyDefinition,
  StrategyDetail,
} from '../data/strategies-api.service';
import {
  buildStrategyDefinition,
  definitionsEqual,
  editorValuesFromDetail,
  type StrategyEditorValues,
} from '../data/strategy-form.mapper';

type EditorForm = FormGroup<{
  name: FormControl<string>;
  description: FormControl<string>;
  asset_type: FormControl<'EQUITY' | 'CRYPTO'>;
  timeframe: FormControl<'1d' | '1h'>;
  indicator_id: FormControl<string>;
  indicator_type: FormControl<string>;
  period: FormControl<number>;
  entry_op: FormControl<string>;
  entry_literal: FormControl<number>;
  exit_op: FormControl<string>;
  exit_literal: FormControl<number>;
  stop_loss: FormControl<number>;
  take_profit: FormControl<number>;
}>;

@Component({
  selector: 'app-strategy-editor-page',
  imports: [ReactiveFormsModule, RouterLink, SkeletonComponent, InlineErrorComponent],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">{{ isNew() ? 'Create' : 'Edit' }} strategy</p>
        <h1>{{ isNew() ? 'New strategy' : 'Edit strategy' }}</h1>
      </div>
      <a class="text-link" routerLink="/strategies">Back to list</a>
    </section>

    @if (bootError()) {
      <app-inline-error [message]="bootError()" [retryable]="false" />
    } @else if (booting()) {
      <app-skeleton height="18rem" />
    } @else {
      <form class="panel form-panel" [formGroup]="form" (ngSubmit)="save()">
        <div class="field">
          <label for="name">Name</label>
          <input id="name" formControlName="name" />
        </div>
        <div class="field">
          <label for="asset">Asset type</label>
          <select id="asset" formControlName="asset_type" (change)="onAssetChange()">
            <option value="EQUITY">EQUITY</option>
            <option value="CRYPTO">CRYPTO</option>
          </select>
        </div>
        <div class="field full">
          <label for="description">Description</label>
          <input id="description" formControlName="description" />
        </div>
        <div class="field">
          <label for="timeframe">Timeframe</label>
          <select id="timeframe" formControlName="timeframe">
            <option value="1d">1d</option>
            @if (form.controls.asset_type.value === 'CRYPTO') {
              <option value="1h">1h</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="indicatorType">Indicator</label>
          <select id="indicatorType" formControlName="indicator_type">
            @for (item of indicatorTypes(); track item) {
              <option [value]="item">{{ item }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="indicatorId">Indicator id</label>
          <input id="indicatorId" formControlName="indicator_id" />
        </div>
        <div class="field">
          <label for="period">Period</label>
          <input id="period" type="number" formControlName="period" />
        </div>
        <div class="field">
          <label for="entryOp">Entry operator</label>
          <select id="entryOp" formControlName="entry_op">
            <option value="gt">gt</option>
            <option value="gte">gte</option>
            <option value="lt">lt</option>
            <option value="lte">lte</option>
            <option value="eq">eq</option>
          </select>
        </div>
        <div class="field">
          <label for="entryLiteral">Entry literal</label>
          <input id="entryLiteral" type="number" formControlName="entry_literal" />
        </div>
        <div class="field">
          <label for="exitOp">Exit operator</label>
          <select id="exitOp" formControlName="exit_op">
            <option value="gt">gt</option>
            <option value="gte">gte</option>
            <option value="lt">lt</option>
            <option value="lte">lte</option>
            <option value="eq">eq</option>
          </select>
        </div>
        <div class="field">
          <label for="exitLiteral">Exit literal</label>
          <input id="exitLiteral" type="number" formControlName="exit_literal" />
        </div>
        <div class="field">
          <label for="sl">Stop loss %</label>
          <input id="sl" type="number" formControlName="stop_loss" />
        </div>
        <div class="field">
          <label for="tp">Take profit %</label>
          <input id="tp" type="number" formControlName="take_profit" />
        </div>

        @if (message()) {
          <p class="hint full" [class.error]="!valid()">{{ message() }}</p>
        }
        @if (summary()) {
          <pre class="full">{{ summary() }}</pre>
        }

        <div class="actions full">
          <button class="button secondary" type="button" [disabled]="busy()" (click)="validateOnly()">
            Validate
          </button>
          <button class="button primary" type="submit" [disabled]="busy() || form.invalid">
            {{ busy() ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    }
  `,
  styles: `
    .form-panel {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding: 1.5rem;
    }
    .full {
      grid-column: 1 / -1;
    }
    pre {
      background: #0b1626;
      border-radius: 0.75rem;
      padding: 1rem;
      white-space: pre-wrap;
    }
    @media (max-width: 700px) {
      .form-panel {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class StrategyEditorPage implements OnInit {
  protected readonly form: EditorForm = new FormGroup({
    name: new FormControl('My SMA strategy', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl('', { nonNullable: true }),
    asset_type: new FormControl<'EQUITY' | 'CRYPTO'>('EQUITY', { nonNullable: true }),
    timeframe: new FormControl<'1d' | '1h'>('1d', { nonNullable: true }),
    indicator_id: new FormControl('sma', { nonNullable: true, validators: [Validators.required] }),
    indicator_type: new FormControl('SMA', { nonNullable: true }),
    period: new FormControl(20, { nonNullable: true, validators: [Validators.min(2)] }),
    entry_op: new FormControl('gt', { nonNullable: true }),
    entry_literal: new FormControl(100, { nonNullable: true }),
    exit_op: new FormControl('lt', { nonNullable: true }),
    exit_literal: new FormControl(90, { nonNullable: true }),
    stop_loss: new FormControl(2, { nonNullable: true, validators: [Validators.min(0.01)] }),
    take_profit: new FormControl(5, { nonNullable: true, validators: [Validators.min(0.01)] }),
  });

  protected readonly isNew = signal(true);
  protected readonly booting = signal(true);
  protected readonly bootError = signal('');
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly summary = signal('');
  protected readonly valid = signal(false);
  protected readonly indicatorTypes = signal<string[]>(['SMA', 'EMA', 'RSI']);
  private existing: StrategyDetail | null = null;
  private readonly api = inject(StrategiesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.boot();
  }

  isDirty(): boolean {
    return this.form.dirty;
  }

  protected onAssetChange(): void {
    if (this.form.controls.asset_type.value === 'EQUITY') {
      this.form.controls.timeframe.setValue('1d');
    }
  }

  protected async validateOnly(): Promise<void> {
    this.busy.set(true);
    this.message.set('');
    try {
      const result = await firstValueFrom(this.api.validate(this.toDefinition()));
      this.valid.set(result.is_valid);
      this.summary.set(result.summary ?? JSON.stringify(result, null, 2));
      this.message.set(result.is_valid ? 'Definition is valid.' : 'Definition has validation errors.');
    } catch (error) {
      this.valid.set(false);
      this.message.set(error instanceof Error ? error.message : 'Validation failed.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    try {
      const definition = this.toDefinition();
      const validation = await firstValueFrom(this.api.validate(definition));
      if (!validation.is_valid) {
        this.valid.set(false);
        this.message.set('Fix validation errors before saving.');
        this.summary.set(JSON.stringify(validation.errors ?? validation, null, 2));
        return;
      }
      const values = this.form.getRawValue();
      if (this.isNew()) {
        const created = await firstValueFrom(
          this.api.create({
            name: values.name,
            description: values.description || undefined,
            asset_type: values.asset_type,
            timeframe: values.timeframe,
            definition,
          }),
        );
        this.form.markAsPristine();
        await this.router.navigate(['/strategies', created.id]);
        return;
      }
      const id = this.existing!.id;
      const body: Record<string, unknown> = {
        name: values.name,
        description: values.description,
        asset_type: values.asset_type,
        timeframe: values.timeframe,
      };
      if (this.definitionChanged(definition)) {
        body['definition'] = definition;
      }
      const updated = await firstValueFrom(this.api.update(id, body));
      this.form.markAsPristine();
      await this.router.navigate(['/strategies', updated.id]);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      this.busy.set(false);
    }
  }

  private async boot(): Promise<void> {
    try {
      const catalog = await firstValueFrom(this.api.indicators());
      const types = catalog.indicators.map((item) => item.key);
      if (types.length) this.indicatorTypes.set(types);

      const id = this.route.snapshot.paramMap.get('id');
      const creating = !id || id === 'new';
      this.isNew.set(creating);
      if (!creating && id) {
        const detail = await firstValueFrom(this.api.get(id));
        this.existing = detail;
        this.patchFromDetail(detail);
      }
      this.booting.set(false);
    } catch (error) {
      this.bootError.set(error instanceof Error ? error.message : 'Failed to open editor.');
      this.booting.set(false);
    }
  }

  private patchFromDetail(detail: StrategyDetail): void {
    this.form.patchValue(editorValuesFromDetail(detail));
    this.form.markAsPristine();
  }

  private toDefinition(): StrategyDefinition {
    return buildStrategyDefinition(this.form.getRawValue() as StrategyEditorValues);
  }

  private definitionChanged(next: StrategyDefinition): boolean {
    if (!this.existing) return true;
    return !definitionsEqual(this.existing.definition, next);
  }
}

export const strategyEditorCanDeactivate: CanDeactivateFn<StrategyEditorPage> = (component) => {
  if (!component.isDirty()) return true;
  return confirm('You have unsaved changes. Leave this page?');
};
