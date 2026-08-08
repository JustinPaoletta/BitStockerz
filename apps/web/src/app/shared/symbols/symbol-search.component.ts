import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  EventEmitter,
  forwardRef,
  inject,
  Input,
  Output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  Subject,
  switchMap,
} from 'rxjs';

export interface SymbolSearchResult {
  symbol: string;
  name?: string;
  asset_type?: string;
}

@Component({
  selector: 'app-symbol-search',
  imports: [ReactiveFormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SymbolSearchComponent),
      multi: true,
    },
  ],
  template: `
    <div class="symbol-search">
      <label [attr.for]="inputId">{{ label }}</label>
      <input
        [id]="inputId"
        type="text"
        role="combobox"
        autocomplete="off"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listboxId"
        [attr.aria-activedescendant]="activeDescendant()"
        [value]="query()"
        [disabled]="disabled"
        [placeholder]="placeholder"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (blur)="onBlur()"
        (focus)="onFocus()"
      />
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (open() && results().length > 0) {
        <ul [id]="listboxId" role="listbox" class="results">
          @for (item of results(); track item.symbol; let i = $index) {
            <li
              [id]="optionId(i)"
              role="option"
              [attr.aria-selected]="i === activeIndex()"
              [class.active]="i === activeIndex()"
              (mousedown)="select(item)"
            >
              <strong>{{ item.symbol }}</strong>
              <span>{{ item.name || item.asset_type || '' }}</span>
            </li>
          }
        </ul>
      } @else if (open() && query().trim() && !loading() && !error()) {
        <p class="hint empty">No symbols found.</p>
      }
    </div>
  `,
  styles: `
    .symbol-search {
      position: relative;
    }
    .results {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      left: 0;
      list-style: none;
      margin: 0.35rem 0 0;
      max-height: 16rem;
      overflow: auto;
      padding: 0.35rem;
      position: absolute;
      right: 0;
      z-index: 20;
    }
    li {
      border-radius: 0.55rem;
      cursor: pointer;
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
      padding: 0.65rem 0.75rem;
    }
    li.active,
    li:hover {
      background: var(--surface-2);
    }
    .empty {
      margin-top: 0.5rem;
    }
  `,
})
export class SymbolSearchComponent implements ControlValueAccessor {
  @Input() label = 'Symbol';
  @Input() placeholder = 'Search AAPL, BTC-USD…';
  @Input() assetType?: 'EQUITY' | 'CRYPTO' | '';
  @Input() inputId = 'symbol-search';
  @Output() readonly selected = new EventEmitter<SymbolSearchResult>();

  protected readonly query = signal('');
  protected readonly results = signal<SymbolSearchResult[]>([]);
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly activeIndex = signal(-1);
  protected disabled = false;
  protected readonly listboxId = `${this.inputId}-listbox`;

  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly queries = new Subject<string>();
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    this.queries
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const trimmed = q.trim();
          if (!trimmed) {
            this.results.set([]);
            this.loading.set(false);
            this.error.set('');
            return of([] as SymbolSearchResult[]);
          }
          this.loading.set(true);
          this.error.set('');
          let params = new HttpParams().set('q', trimmed).set('limit', '8');
          if (this.assetType) {
            params = params.set('asset_type', this.assetType);
          }
          return this.http.get<{ items?: SymbolSearchResult[]; symbols?: SymbolSearchResult[] }>(
            '/api/symbols/search',
            { params },
          ).pipe(
            catchError(() => {
              this.error.set('Symbol search failed.');
              return of({ items: [] });
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        const items = Array.isArray(response)
          ? (response as SymbolSearchResult[])
          : (((response as { items?: SymbolSearchResult[] }).items) ?? []);
        this.results.set(items);
        this.activeIndex.set(items.length ? 0 : -1);
        this.loading.set(false);
        this.open.set(true);
      });
  }

  writeValue(value: string | null): void {
    this.query.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.onChange(value);
    this.queries.next(value);
  }

  protected onFocus(): void {
    if (this.results().length) this.open.set(true);
  }

  protected onBlur(): void {
    this.onTouched();
    setTimeout(() => this.open.set(false), 120);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const items = this.results();
    if (!items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((i) => Math.min(i + 1, items.length - 1));
      this.open.set(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      const item = items[this.activeIndex()];
      if (item) {
        event.preventDefault();
        this.select(item);
      }
    } else if (event.key === 'Escape') {
      this.open.set(false);
    }
  }

  protected select(item: SymbolSearchResult): void {
    this.query.set(item.symbol);
    this.onChange(item.symbol);
    this.selected.emit(item);
    this.open.set(false);
  }

  protected optionId(index: number): string {
    return `${this.inputId}-option-${index}`;
  }

  protected activeDescendant(): string | null {
    const index = this.activeIndex();
    return index >= 0 ? this.optionId(index) : null;
  }
}
