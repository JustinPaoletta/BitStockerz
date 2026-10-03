import type { AppConfigService } from '../config/app-config.service';
import { ManualIngestionGuard } from './manual-ingestion.guard';

function guard(nodeEnv: string) {
  return new ManualIngestionGuard({ server: { nodeEnv } } as AppConfigService);
}

describe('ManualIngestionGuard', () => {
  it.each(['development', 'test'])(
    'allows local fixture/job tools in %s',
    (nodeEnv) => {
      expect(guard(nodeEnv).canActivate()).toBe(true);
    },
  );
  it.each(['production', 'unknown'])(
    'denies manual shared-data writes in %s',
    (nodeEnv) => {
      expect(() => guard(nodeEnv).canActivate()).toThrow(
        'Manual market data ingestion is unavailable',
      );
    },
  );
});
