import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { loadEnvFile } from './load-env';

jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
}));

describe('loadEnvFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not read local secrets for an isolated prototype', () => {
    process.env.BITSTOCKERZ_SKIP_ENV_FILE = 'true';
    try {
      loadEnvFile();
      expect(config).not.toHaveBeenCalled();
      expect(existsSync).not.toHaveBeenCalled();
    } finally {
      delete process.env.BITSTOCKERZ_SKIP_ENV_FILE;
    }
  });

  it('loads the first existing env file candidate', () => {
    (existsSync as jest.Mock).mockReturnValue(true);

    loadEnvFile();

    expect(existsSync).toHaveBeenCalled();
    expect(config).toHaveBeenCalledWith(
      expect.objectContaining({ override: false }),
    );
  });

  it('does nothing when no env file candidates exist', () => {
    (existsSync as jest.Mock).mockReturnValue(false);

    loadEnvFile();

    expect(config).not.toHaveBeenCalled();
  });
});
