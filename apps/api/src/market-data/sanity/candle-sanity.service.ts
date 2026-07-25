import { Injectable } from '@nestjs/common';
import type {
  SanityBarInput,
  SanityIssue,
  SanityIssueCode,
  SanitySummary,
} from './candle-sanity.types';

const MAX_ISSUES = 50;

@Injectable()
export class CandleSanityService {
  validateBar(bar: SanityBarInput): SanityIssue[] {
    const issues: SanityIssue[] = [];
    const prices = [bar.open, bar.high, bar.low, bar.close];

    if (prices.some((value) => !Number.isFinite(value))) {
      issues.push(this.issue(bar, 'NON_FINITE', 'OHLC values must be finite.'));
      return issues;
    }

    if (prices.some((value) => value <= 0)) {
      issues.push(
        this.issue(bar, 'NON_POSITIVE_PRICE', 'OHLC values must be > 0.'),
      );
    }

    if (!Number.isFinite(bar.volume)) {
      issues.push(
        this.issue(bar, 'NON_FINITE', 'volume must be a finite number.'),
      );
      return issues;
    }

    if (bar.volume < 0) {
      issues.push(this.issue(bar, 'NEGATIVE_VOLUME', 'volume must be >= 0.'));
    }

    if (bar.high < bar.low) {
      issues.push(
        this.issue(
          bar,
          'HIGH_LT_LOW',
          'high must be greater than or equal to low.',
        ),
      );
    }

    const bodyHigh = Math.max(bar.open, bar.close);
    const bodyLow = Math.min(bar.open, bar.close);

    if (bar.high < bodyHigh) {
      issues.push(
        this.issue(
          bar,
          'HIGH_LT_BODY',
          'high must be greater than or equal to max(open, close).',
        ),
      );
    }

    if (bar.low > bodyLow) {
      issues.push(
        this.issue(
          bar,
          'LOW_GT_BODY',
          'low must be less than or equal to min(open, close).',
        ),
      );
    }

    return issues;
  }

  scan(bars: SanityBarInput[], maxIssues = MAX_ISSUES): SanitySummary {
    const issues: SanityIssue[] = [];
    let invalid = 0;

    for (const bar of bars) {
      const barIssues = this.validateBar(bar);
      if (barIssues.length === 0) {
        continue;
      }

      invalid += 1;
      for (const issue of barIssues) {
        if (issues.length < maxIssues) {
          issues.push(issue);
        }
      }
    }

    return {
      checked: bars.length,
      invalid,
      issues,
    };
  }

  private issue(
    bar: SanityBarInput,
    code: SanityIssueCode,
    message: string,
  ): SanityIssue {
    return {
      symbol: bar.symbol,
      interval: bar.interval,
      ...(bar.date ? { date: bar.date } : {}),
      ...(bar.timestamp ? { timestamp: bar.timestamp } : {}),
      code,
      message,
    };
  }
}
