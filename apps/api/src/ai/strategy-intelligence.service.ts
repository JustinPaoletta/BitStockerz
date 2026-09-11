import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { StrategiesService } from '../strategies/strategies.service';
import { computeConfidence } from './ai-confidence';
import { AiService } from './ai.service';
import { fitContextBudget } from './context-budget';
import {
  ADVISORY_SYSTEM_PROMPT,
  buildExplainStrategyPrompt,
  buildValidateStrategyPrompt,
} from './prompts/ai.prompts';
import {
  explainStrategyOutputSchema,
  validateStrategyOutputSchema,
} from './schemas/ai-output.schemas';
import { mergeWarnings, runStrategyLogicChecks } from './strategy-logic.checks';

@Injectable()
export class StrategyIntelligenceService {
  constructor(
    private readonly strategies: StrategiesService,
    private readonly ai: AiService,
    private readonly config: AppConfigService,
  ) {}

  async explainStrategy(userId: string, strategyId: string) {
    const strategy = await this.strategies.getById(userId, strategyId);
    const context = fitContextBudget(
      {
        id: strategy.id,
        name: strategy.name,
        description: strategy.description,
        asset_type: strategy.asset_type,
        timeframe: strategy.timeframe,
        version_number: strategy.version_number,
        definition: strategy.definition,
      },
      this.config.ai.maxContextChars,
      ['description'],
    );

    const response = await this.ai.invoke({
      userId,
      operation: 'explain_strategy',
      schema: explainStrategyOutputSchema,
      system: ADVISORY_SYSTEM_PROMPT,
      prompt: buildExplainStrategyPrompt(context.payload),
      confidence: {
        mode: 'explain',
        deterministicSeverities: [],
        modelOnlyFindingCount: 0,
      },
      stubContext: { strategy_name: strategy.name },
    });

    return {
      disclaimer: response.disclaimer,
      confidence: response.confidence,
      ai_request_id: response.ai_request_id,
      explanation: response.explanation.slice(0, 4000),
      warnings: (response.warnings ?? []).slice(0, 10),
    };
  }

  async validateStrategy(userId: string, strategyId: string) {
    const strategy = await this.strategies.getById(userId, strategyId);
    const deterministic = runStrategyLogicChecks(strategy.definition);
    const context = fitContextBudget(
      {
        id: strategy.id,
        name: strategy.name,
        definition: strategy.definition,
      },
      this.config.ai.maxContextChars,
      [],
    );

    const response = await this.ai.invoke({
      userId,
      operation: 'validate_strategy',
      schema: validateStrategyOutputSchema,
      system: ADVISORY_SYSTEM_PROMPT,
      prompt: buildValidateStrategyPrompt(context.payload),
      confidence: {
        mode: 'validate',
        deterministicSeverities: deterministic.map((item) => item.severity),
        modelOnlyFindingCount: 0,
      },
      stubContext: { strategy_name: strategy.name },
    });

    const warnings = mergeWarnings(deterministic, response.warnings ?? []);
    const modelOnlyFindingCount = warnings.filter(
      (warning) =>
        !deterministic.some(
          (item) =>
            item.code === warning.code &&
            item.evidence_paths.join('|') === warning.evidence_paths.join('|'),
        ),
    ).length;

    return {
      disclaimer: response.disclaimer,
      confidence: computeConfidence({
        mode: 'validate',
        deterministicSeverities: deterministic.map((item) => item.severity),
        modelOnlyFindingCount,
      }),
      ai_request_id: response.ai_request_id,
      warnings,
    };
  }
}
