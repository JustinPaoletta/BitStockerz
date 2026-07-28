import { ErrorCode } from '../../common/errors/error-codes.enum';
import { checkBudget, createExecutionBudget, elapsedBudgetMs } from './budget';

describe('backtest execution budget', () => {
  it('checks only configured loop checkpoints unless forced', () => {
    let now = 0;
    const budget = createExecutionBudget(10, undefined, () => now);
    now = 11;

    expect(() => checkBudget(budget, 1)).not.toThrow();
    expect(() => checkBudget(budget, 64)).toThrow(
      expect.objectContaining({ code: ErrorCode.BACKTEST_TIMEOUT }),
    );
  });

  it('reports non-negative elapsed monotonic time', () => {
    let now = 10;
    const budget = createExecutionBudget(100, undefined, () => now);
    now = 25;
    expect(elapsedBudgetMs(budget)).toBe(15);
    now = 5;
    expect(elapsedBudgetMs(budget)).toBe(0);
    expect(() => checkBudget(undefined, 0, true)).not.toThrow();
  });
});
