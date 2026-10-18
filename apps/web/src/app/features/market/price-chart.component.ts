import {
  afterRenderEffect,
  Component,
  ElementRef,
  input,
  OnDestroy,
  viewChild,
} from '@angular/core';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type Time,
} from 'lightweight-charts';

export interface MarketChart {
  symbol: string;
  currency: string;
  timeframe: '1d' | '1h';
  data_mode: 'database' | 'seed';
  price_source: string;
  contains_simulated_prices: boolean;
  bars: {
    timestamp: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }[];
  indicators: {
    id: string;
    type: string;
    period: number;
    points: { timestamp: string; value: string }[];
  }[];
}

@Component({
  selector: 'app-price-chart',
  template: `<div
    #host
    class="chart"
    role="img"
    aria-label="Candlestick chart with selected strategy indicators"
  ></div>`,
  styles: `
    .chart {
      height: 400px;
      width: 100%;
    }
  `,
})
export class PriceChartComponent implements OnDestroy {
  readonly data = input.required<MarketChart>();
  private readonly host = viewChild<ElementRef<HTMLDivElement>>('host');
  private chart?: IChartApi;
  private observer?: ResizeObserver;
  private themeMedia?: MediaQueryList;
  private readonly onThemeChange = (): void => this.render();

  constructor() {
    afterRenderEffect(() => this.render());
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
      this.themeMedia.addEventListener('change', this.onThemeChange);
    }
  }

  ngOnDestroy(): void {
    this.themeMedia?.removeEventListener('change', this.onThemeChange);
    this.disposeChart();
  }

  private disposeChart(): void {
    this.observer?.disconnect();
    this.chart?.remove();
    this.chart = undefined;
  }
  private render(): void {
    const data = this.data();
    const host = this.host()?.nativeElement;
    if (!host) return;
    this.disposeChart();
    const style = getComputedStyle(host);
    const color = (token: string): string => style.getPropertyValue(token).trim();
    this.chart = createChart(host, {
      width: host.clientWidth,
      height: 400,
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
      timeScale: { timeVisible: data.timeframe === '1h' },
      leftPriceScale: { visible: data.indicators.some((item) => item.type === 'RSI') },
    });
    const time = (value: string): Time =>
      data.timeframe === '1d'
        ? (value.slice(0, 10) as Time)
        : (Math.floor(Date.parse(value) / 1000) as Time);
    this.chart
      .addSeries(CandlestickSeries, {
        upColor: color('--chart-up'),
        downColor: color('--chart-down'),
        wickUpColor: color('--chart-marker-entry'),
        wickDownColor: color('--chart-down'),
        borderVisible: true,
        borderUpColor: color('--chart-marker-entry'),
        borderDownColor: color('--chart-down'),
      })
      .setData(
        data.bars.map((bar) => ({
          time: time(bar.timestamp),
          open: Number(bar.open),
          high: Number(bar.high),
          low: Number(bar.low),
          close: Number(bar.close),
        })),
      );
    const colors = [1, 2, 3, 4].map((index) => color(`--chart-indicator-${index}`));
    data.indicators.forEach((item, index) =>
      this.chart!.addSeries(LineSeries, {
        color: colors[index % colors.length],
        lineWidth: 2,
        title: `${item.id} (${item.type} ${item.period})`,
        priceScaleId: item.type === 'RSI' ? 'left' : 'right',
      }).setData(
        item.points.map((point) => ({ time: time(point.timestamp), value: Number(point.value) })),
      ),
    );
    this.chart.timeScale().fitContent();
    this.observer = new ResizeObserver(([entry]) => {
      if (entry) this.chart?.applyOptions({ width: entry.contentRect.width });
    });
    this.observer.observe(host);
  }
}
