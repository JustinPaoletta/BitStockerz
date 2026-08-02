import { afterNextRender, Component, ElementRef, input, OnDestroy, viewChild } from '@angular/core';
import { ColorType, createChart, LineSeries, type IChartApi, type Time } from 'lightweight-charts';
import { toChartPoints } from '../backtest.mapper';
import type { EquityPoint } from '../models/backtest.models';

@Component({
  selector: 'app-equity-curve-chart',
  template: `
    @if (points().length === 0) {
      <p class="empty">No equity points are available for this run.</p>
    } @else {
      <div #host class="chart" role="img" aria-label="Backtest equity curve"></div>
    }
  `,
  styles: `
    .chart {
      height: 320px;
      width: 100%;
    }
  `,
})
export class EquityCurveChartComponent implements OnDestroy {
  readonly points = input.required<EquityPoint[]>();
  readonly timeframe = input.required<'1d' | '1h'>();
  private readonly host = viewChild<ElementRef<HTMLDivElement>>('host');
  private chart?: IChartApi;
  private observer?: ResizeObserver;

  constructor() {
    afterNextRender(() => this.render());
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.chart?.remove();
  }

  private render(): void {
    const element = this.host()?.nativeElement;
    if (!element) return;
    this.chart = createChart(element, {
      width: element.clientWidth,
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: '#111d30' },
        textColor: '#a8b4c7',
      },
      grid: {
        vertLines: { color: '#1d2a3e' },
        horzLines: { color: '#1d2a3e' },
      },
      rightPriceScale: { borderColor: '#2b3a51' },
      timeScale: { borderColor: '#2b3a51', timeVisible: this.timeframe() === '1h' },
    });
    const series = this.chart.addSeries(LineSeries, {
      color: '#5ee6b0',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    series.setData(
      toChartPoints(this.points(), this.timeframe()).map((point) => ({
        time: point.time as Time,
        value: point.value,
      })),
    );
    this.chart.timeScale().fitContent();
    this.observer = new ResizeObserver(([entry]) => {
      if (entry) this.chart?.applyOptions({ width: entry.contentRect.width });
    });
    this.observer.observe(element);
  }
}
