import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SymbolSearchComponent } from './symbol-search.component';

describe('SymbolSearchComponent', () => {
  let fixture: ComponentFixture<SymbolSearchComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SymbolSearchComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(SymbolSearchComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('debounces search requests and renders results', async () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'AA';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 280));
    const req = http.expectOne((request) => request.url === '/api/symbols/search');
    expect(req.request.params.get('q')).toBe('AA');
    req.flush([{ symbol: 'AAPL', name: 'Apple', asset_type: 'EQUITY' }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('AAPL');
  });

  it('uses custom ARIA ids and does not select hidden options after Escape', async () => {
    fixture.componentRef.setInput('inputId', 'trade-symbol');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const selected = vi.spyOn(fixture.componentInstance.selected, 'emit');
    input.value = 'AA';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 280));
    http
      .expectOne((request) => request.url === '/api/symbols/search')
      .flush({ items: [{ symbol: 'AAPL' }] });
    fixture.detectChanges();
    expect(input.getAttribute('aria-controls')).toBe('trade-symbol-listbox');
    expect(input.getAttribute('aria-activedescendant')).toBe('trade-symbol-option-0');
    expect(fixture.nativeElement.querySelector('#trade-symbol-listbox')).not.toBeNull();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(selected).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
  });

  it('cancels an obsolete response immediately and only selects current results', async () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const selected = vi.spyOn(fixture.componentInstance.selected, 'emit');
    input.value = 'AA';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 280));
    const old = http.expectOne((request) => request.params.get('q') === 'AA');
    input.value = 'BTC';
    input.dispatchEvent(new Event('input'));
    expect(old.cancelled).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(selected).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 280));
    http
      .expectOne((request) => request.params.get('q') === 'BTC')
      .flush({ items: [{ symbol: 'BTC-USD' }] });
    fixture.detectChanges();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(selected).toHaveBeenCalledWith({ symbol: 'BTC-USD' });
    expect(input.value).toBe('BTC-USD');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('cancels a pending search on blur instead of reopening the popup', async () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'AA';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 280));
    const request = http.expectOne((req) => req.url === '/api/symbols/search');
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(request.cancelled).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
  });
});
