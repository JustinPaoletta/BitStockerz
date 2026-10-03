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
import { catchError, EMPTY, of, Subject, switchMap, timer } from 'rxjs';

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
        aria-autocomplete="list"
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
  protected get listboxId(): string {
    return `${this.inputId}-listbox`;
  }

  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly queries = new Subject<string | null>();
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    this.queries
      .pipe(
        switchMap((q) => {
          if (!q) return EMPTY;
          let params = new HttpParams().set('q', q).set('limit', '8');
          if (this.assetType) {
            params = params.set('asset_type', this.assetType);
          }
          // Cancel both the debounce and any in-flight request as soon as the query changes.
          return timer(250).pipe(
            switchMap(() =>
              this.http.get<
                | SymbolSearchResult[]
                | { items?: SymbolSearchResult[]; symbols?: SymbolSearchResult[] }
              >('/api/symbols/search', { params }),
            ),
            catchError(() => {
              this.error.set('Symbol search failed.');
              return of([] as SymbolSearchResult[]);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        const items = Array.isArray(response)
          ? response
          : (response.items ?? response.symbols ?? []);
        this.results.set(items);
        this.activeIndex.set(items.length ? 0 : -1);
        this.loading.set(false);
        this.open.set(true);
      });
  }

  writeValue(value: string | null): void {
    this.dismiss();
    this.results.set([]);
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
    if (isDisabled) this.dismiss();
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.onChange(value);
    this.search(value);
  }

  protected onFocus(): void {
    if (this.results().length) {
      this.activeIndex.set(0);
      this.open.set(true);
    } else {
      this.search(this.query());
    }
  }

  protected onBlur(): void {
    this.onTouched();
    this.dismiss();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.dismiss();
      return;
    }
    const items = this.results();
    if (!items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((i) => Math.min(i + 1, items.length - 1));
      this.open.set(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((i) => Math.max(i - 1, 0));
      this.open.set(true);
    } else if (event.key === 'Enter' && this.open()) {
      const item = items[this.activeIndex()];
      if (item) {
        event.preventDefault();
        this.select(item);
      }
    }
  }

  protected select(item: SymbolSearchResult): void {
    if (!this.open() || !this.results().includes(item)) return;
    this.dismiss();
    this.results.set([]);
    this.query.set(item.symbol);
    this.onChange(item.symbol);
    this.selected.emit(item);
  }

  private search(value: string): void {
    const query = value.trim();
    this.results.set([]);
    this.activeIndex.set(-1);
    this.error.set('');
    this.loading.set(!!query);
    this.open.set(!!query);
    this.queries.next(query || null);
  }

  private dismiss(): void {
    this.queries.next(null);
    this.loading.set(false);
    this.open.set(false);
    this.activeIndex.set(-1);
  }

  protected optionId(index: number): string {
    return `${this.inputId}-option-${index}`;
  }

  protected activeDescendant(): string | null {
    const index = this.activeIndex();
    return this.open() && index >= 0 && index < this.results().length ? this.optionId(index) : null;
  }
}
