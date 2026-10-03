import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';
import { BacktestsService } from '../backtest/backtests.service';
import { JobsService } from '../jobs/jobs.service';
import { MarketDataService } from '../market-data/market-data.service';
import { StrategiesService } from '../strategies/strategies.service';
import { computeConfidence } from './ai-confidence';
import { AiService } from './ai.service';
import { fitContextBudget } from './context-budget';
import { identifyFailureModes, mergeIssues } from './failure-mode.heuristics';
import {
  ADVISORY_SYSTEM_PROMPT,
  buildExplainBacktestPrompt,
  buildSuggestImprovementsPrompt,
} from './prompts/ai.prompts';
import {
  explainBacktestOutputSchema,
  suggestImprovementsOutputSchema,
} from './schemas/ai-output.schemas';
import type { AiSuggestion } from './ai.types';

@Injectable()
export class BacktestIntelligenceService {
  constructor(
    private readonly backtests: BacktestsService,
    private readonly strategies: StrategiesService,
    private readonly jobs: JobsService,
    private readonly marketData: MarketDataService,
    private readonly ai: AiService,
    private readonly config: AppConfigService,
  ) {}

  async explainBacktest(userId: string, backtestRunId: string) {
    const { context, deterministic } = await this.loadBacktestContext(
      userId,
      backtestRunId,
    );

    const response = await this.ai.invoke({
      userId,
      operation: 'explain_backtest',
      schema: explainBacktestOutputSchema,
      system: ADVISORY_SYSTEM_PROMPT,
      prompt: buildExplainBacktestPrompt(context),
      confidence: {
        mode: 'explain',
        hasBacktestContext: true,
        deterministicSeverities: deterministic.map((item) => item.severity),
        modelOnlyFindingCount: 0,
      },
      stubContext: { backtest_run_id: backtestRunId },
    });

    const issues = mergeIssues(deterministic, response.issues ?? []);
    const modelOnlyFindingCount = issues.filter(
      (issue) => !deterministic.some((item) => item.code === issue.code),
    ).length;

    return {
      disclaimer: response.disclaimer,
      confidence: computeConfidence({
        mode: 'explain',
        hasBacktestContext: true,
        deterministicSeverities: deterministic.map((item) => item.severity),
        modelOnlyFindingCount,
      }),
      ai_request_id: response.ai_request_id,
      explanation: response.explanation.slice(0, 4000),
      issues,
    };
  }

  async suggestImprovements(
    userId: string,
    strategyId: string,
    backtestRunId?: string,
  ) {
    const strategy = await this.strategies.getById(userId, strategyId);
    let backtestContext: Record<string, unknown> | undefined;
    let hasBacktestContext = false;

    if (backtestRunId) {
      const loaded = await this.loadBacktestContext(userId, backtestRunId);
      if (loaded.run.strategyId !== strategyId) {
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          'backtest_run_id must belong to the same strategy_id.',
        );
      }
      backtestContext = loaded.context;
      hasBacktestContext = true;
    }

    const context = fitContextBudget(
      {
        strategy: {
          id: strategy.id,
          name: strategy.name,
          definition: strategy.definition,
        },
        backtest: backtestContext,
      },
      this.config.ai.maxContextChars,
      ['backtest'],
    );

    const response = await this.ai.invoke({
      userId,
      operation: 'suggest_improvements',
      schema: suggestImprovementsOutputSchema,
      system: ADVISORY_SYSTEM_PROMPT,
      prompt: buildSuggestImprovementsPrompt(context.payload),
      confidence: {
        mode: 'suggest',
        hasBacktestContext,
        deterministicSeverities: [],
        modelOnlyFindingCount: 0,
      },
      stubContext: {
        strategy_name: strategy.name,
        backtest_run_id: backtestRunId,
      },
    });

    const suggestions = dedupeSuggestions(response.suggestions ?? []).slice(
      0,
      5,
    );

    return {
      disclaimer: response.disclaimer,
      confidence: computeConfidence({
        mode: 'suggest',
        hasBacktestContext,
        deterministicSeverities: [],
        modelOnlyFindingCount: 0,
      }),
      ai_request_id: response.ai_request_id,
      suggestions,
    };
  }

  private async loadBacktestContext(userId: string, backtestRunId: string) {
    const detail = await this.backtests.getRun(backtestRunId, userId);
    if (!detail) {
      throw new DomainError(ErrorCode.BACKTEST_NOT_FOUND);
    }
    if (detail.run.status !== 'completed' || !detail.result) {
      throw new DomainError(
        ErrorCode.BACKTEST_INVALID_STATE,
        'Backtest must be completed with results before Kernel analysis.',
      );
    }

    const strategy = await this.strategies.getById(
      userId,
      detail.run.strategyId,
    );
    const symbol = (
      await this.marketData.getSymbolsByIds([detail.run.symbolId])
    )[0];

    let barsProcessed: number | undefined;
    if (detail.run.jobId) {
      try {
        const job = await this.jobs.getJobForUser(detail.run.jobId, userId);
        const diagnostics = job.payload.diagnostics;
        if (
          diagnostics &&
          typeof diagnostics === 'object' &&
          'bars_processed' in diagnostics &&
          typeof diagnostics.bars_processed === 'number'
        ) {
          barsProcessed = (diagnostics as { bars_processed: number })
            .bars_processed;
        }
      } catch {
        barsProcessed = undefined;
      }
    }

    const deterministic = identifyFailureModes({
      result: detail.result,
      trades: detail.trades,
      barsProcessed,
    });

    const ranked = [...detail.trades].sort(
      (left, right) => Number(right.pnlAbs) - Number(left.pnlAbs),
    );
    const best = ranked.slice(0, 3).map(summarizeTrade);
    const worst = ranked.slice(-3).reverse().map(summarizeTrade);

    const context = fitContextBudget(
      {
        backtest_run_id: detail.run.id,
        strategy_id: detail.run.strategyId,
        strategy_name: strategy.name,
        symbol: symbol?.symbol ?? 'UNKNOWN',
        timeframe: detail.run.timeframe,
        start_date: detail.run.startDate.toISOString(),
        end_date: detail.run.endDate.toISOString(),
        metrics: {
          total_return_pct: detail.result.totalReturnPct,
          max_drawdown_pct: detail.result.maxDrawdownPct,
          win_rate_pct: detail.result.winRatePct,
          num_trades: detail.result.numTrades,
          avg_win_pct: detail.result.avgWinPct,
          avg_loss_pct: detail.result.avgLossPct,
          sharpe_ratio: detail.result.sharpeRatio,
        },
        bars_processed: barsProcessed,
        best_trades: best,
        worst_trades: worst,
        strategy_summary: strategy.summary,
      },
      this.config.ai.maxContextChars,
      ['worst_trades', 'best_trades', 'strategy_summary'],
    ).payload;

    return {
      run: detail.run,
      context,
      deterministic,
    };
  }
}

function summarizeTrade(trade: {
  entryTime: Date;
  exitTime: Date;
  pnlAbs: string;
  pnlPct: string;
}) {
  return {
    entry_time: trade.entryTime.toISOString(),
    exit_time: trade.exitTime.toISOString(),
    pnl_abs: trade.pnlAbs,
    pnl_pct: trade.pnlPct,
  };
}

function dedupeSuggestions(suggestions: AiSuggestion[]): AiSuggestion[] {
  const seen = new Set<string>();
  const result: AiSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (seen.has(suggestion.code)) {
      continue;
    }
    seen.add(suggestion.code);
    result.push({
      ...suggestion,
      evidence: [...new Set(suggestion.evidence)].slice(0, 10),
    });
  }
  return result;
}
