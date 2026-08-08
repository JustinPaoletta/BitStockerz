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
});
