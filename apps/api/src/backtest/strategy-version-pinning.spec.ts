import type { StrategiesService } from '../strategies/strategies.service';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { StrategyVersionPinningService } from './strategy-version-pinning';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const STRATEGY_ID = '00000000-0000-4000-8000-000000000010';

describe('StrategyVersionPinningService', () => {
  it('delegates owner-scoped latest and explicit version resolution', async () => {
    const resolveOwnedVersion = jest.fn().mockResolvedValue({
      strategyId: STRATEGY_ID,
      strategyVersionId: 2,
      versionNumber: 2,
      assetType: 'EQUITY',
      timeframe: '1d',
      definition: {},
    });
    const service = new StrategyVersionPinningService({
      resolveOwnedVersion,
    } as unknown as StrategiesService);

    await expect(service.resolve(USER_ID, STRATEGY_ID)).resolves.toMatchObject({
      strategyVersionId: 2,
    });
    await service.resolve(USER_ID, STRATEGY_ID, 1);

    expect(resolveOwnedVersion).toHaveBeenNthCalledWith(
      1,
      USER_ID,
      STRATEGY_ID,
      undefined,
    );
    expect(resolveOwnedVersion).toHaveBeenNthCalledWith(
      2,
      USER_ID,
      STRATEGY_ID,
      1,
    );
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects malformed explicit version ids (%s)',
    async (versionId) => {
      const service = new StrategyVersionPinningService({
        resolveOwnedVersion: jest.fn(),
      } as unknown as StrategiesService);

      await expect(
        service.resolve(USER_ID, STRATEGY_ID, versionId),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    },
  );
});
