import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { AiSuggestImprovementsResponse } from '../data/ai-api.service';
import { BacktestKernelPanelComponent } from './backtest-kernel-panel.component';

describe('Kernel parameter preview', () => {
  it('shows before/after and rationale without making mutation or order requests', async () => {
    await TestBed.configureTestingModule({
      imports: [BacktestKernelPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(BacktestKernelPanelComponent);
    fixture.componentRef.setInput('strategyId', 'strategy');
    fixture.componentRef.setInput('backtestRunId', 'run');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const button = [...host.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Suggest improvements'),
    )!;
    button.click();
    const http = TestBed.inject(HttpTestingController);
    const call = http.expectOne('/api/ai/suggest-improvements');
    expect(call.request.body).toEqual({ strategy_id: 'strategy', backtest_run_id: 'run' });
    const response: AiSuggestImprovementsResponse = {
      disclaimer: 'Advisory only',
      confidence: 'LOW',
      ai_request_id: 'preview',
      suggestions: [],
      diff: {
        summary: 'Proposed parameter tweaks',
        changes: [{ path: 'risk.stop_loss.value', from: 2, to: 3, rationale: 'Compare drawdown.' }],
      },
    };
    call.flush(response);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.textContent).toContain('2 → 3');
    expect(host.textContent).toContain('Compare drawdown.');
    expect(host.textContent).toContain('do not modify your strategy');
    http.verify();
  });
});
