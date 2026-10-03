import {
  afterRenderEffect,
  Component,
  ElementRef,
  input,
  OnDestroy,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from 'lightweight-charts';
import { toChartPoints, toTradeMarkers } from '../backtest.mapper';
import type { BacktestTrade, EquityPoint } from '../models/backtest.models';

@Component({
  selector: 'app-equity-curve-chart',
  template: `
    @if (points().length === 0) {
      <p class="empty">No equity points are available for this run.</p>
    } @else {
      <div
        #host
        class="chart"
        role="img"
        aria-label="Backtest equity curve with trade entry and exit markers"
      ></div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
  readonly trades = input<BacktestTrade[]>([]);
  private readonly host = viewChild<ElementRef<HTMLDivElement>>('host');
  private chart?: IChartApi;
  private observer?: ResizeObserver;
  private series?: ISeriesApi<'Line'>;
  private markers?: ISeriesMarkersPluginApi<Time>;
  private renderedPoints?: EquityPoint[];
  private renderedTimeframe?: '1d' | '1h';

  constructor() {
    afterRenderEffect(() => this.render());
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.markers?.detach();
    this.chart?.remove();
    this.chart = undefined;
    this.series = undefined;
    this.markers = undefined;
    this.renderedPoints = undefined;
  }

  private render(): void {
    const points = this.points();
    const timeframe = this.timeframe();
    const trades = this.trades();
    const element = this.host()?.nativeElement;
    if (!element) {
      this.ngOnDestroy();
      return;
    }
    const style = getComputedStyle(element);
    const color = (token: string): string => style.getPropertyValue(token).trim();
    if (!this.chart) {
      this.chart = createChart(element, {
        width: element.clientWidth,
        height: 320,
        layout: {
          background: { type: ColorType.Solid, color: color('--surface') },
          textColor: color('--muted'),
          fontFamily: style.fontFamily,
        },
        grid: {
          vertLines: { color: color('--grid') },
          horzLines: { color: color('--grid') },
        },
        rightPriceScale: { borderColor: color('--border') },
        timeScale: { borderColor: color('--border'), timeVisible: timeframe === '1h' },
      });
      this.series = this.chart.addSeries(LineSeries, {
        color: color('--accent'),
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
      this.markers = createSeriesMarkers(this.series, []);
      this.observer = new ResizeObserver(([entry]) => {
        if (entry) this.chart?.applyOptions({ width: entry.contentRect.width });
      });
      this.observer.observe(element);
    }
    if (points !== this.renderedPoints || timeframe !== this.renderedTimeframe) {
      this.chart.applyOptions({ timeScale: { timeVisible: timeframe === '1h' } });
      this.markers?.setMarkers([]);
      this.series?.setData(
        toChartPoints(points, timeframe).map((point) => ({
          time: point.time as Time,
          value: point.value,
        })),
      );
      this.chart.timeScale().fitContent();
      this.renderedPoints = points;
      this.renderedTimeframe = timeframe;
    }
    this.markers?.setMarkers(toTradeMarkers(trades, points, timeframe));
  }
}
