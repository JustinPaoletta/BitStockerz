import {
  CircuitBreaker,
  CircuitOpenError,
  isTransientProviderError,
  PermanentProviderError,
} from './circuit-breaker';

describe('isTransientProviderError', () => {
  it('classifies permanent and validation errors as non-transient', () => {
    expect(
      isTransientProviderError(new PermanentProviderError('missing key')),
    ).toBe(false);
    expect(isTransientProviderError(new Error('validation failed'))).toBe(
      false,
    );
    expect(isTransientProviderError(new Error('not configured'))).toBe(false);
  });

  it('classifies network/timeout/5xx style errors as transient', () => {
    expect(isTransientProviderError(new Error('timeout contacting vendor'))).toBe(
      true,
    );
    expect(isTransientProviderError(new Error('HTTP 502 bad gateway'))).toBe(
      true,
    );
    expect(isTransientProviderError(new Error('429 too many requests'))).toBe(
      true,
    );
    expect(isTransientProviderError(new Error('econnreset'))).toBe(true);
    expect(isTransientProviderError(new Error('504 gateway'))).toBe(true);
    expect(isTransientProviderError(new CircuitOpenError())).toBe(true);
    expect(isTransientProviderError('weird')).toBe(true);
  });
});

describe('CircuitBreaker', () => {
  let now: number;
  let breaker: CircuitBreaker;

  beforeEach(() => {
    now = 0;
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 60_000,
      clock: () => now,
    });
  });

  it('opens after N consecutive transient failures', async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(
        breaker.exec(async () => {
          throw new Error('timeout contacting vendor');
        }),
      ).rejects.toThrow('timeout');
    }

    expect(breaker.getStatus().state).toBe('open');
    await expect(breaker.exec(async () => 'ok')).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
  });

  it('does not trip on permanent/validation errors', async () => {
    await expect(
      breaker.exec(async () => {
        throw new PermanentProviderError('live vendor not configured');
      }),
    ).rejects.toBeInstanceOf(PermanentProviderError);

    expect(breaker.getStatus().state).toBe('closed');
    expect(breaker.getStatus().consecutive_failures).toBe(0);
  });

  it('allows a single half-open probe after cooldown and resets on success', async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(
        breaker.exec(async () => {
          throw new Error('503 upstream');
        }),
      ).rejects.toThrow('503');
    }

    now += 60_000;
    expect(breaker.getStatus().state).toBe('half_open');

    const probe = breaker.exec(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'recovered';
    });
    await expect(breaker.exec(async () => 'concurrent')).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    await expect(probe).resolves.toBe('recovered');
    expect(breaker.getStatus().state).toBe('closed');
  });

  it('re-opens when a half-open probe fails permanently', async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(
        breaker.exec(async () => {
          throw new Error('network down');
        }),
      ).rejects.toThrow('network');
    }
    now += 60_000;
    await expect(
      breaker.exec(async () => {
        throw new PermanentProviderError('misconfigured');
      }),
    ).rejects.toBeInstanceOf(PermanentProviderError);
    expect(breaker.getStatus().state).toBe('open');
  });

  it('re-opens when a half-open probe fails transiently', async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(
        breaker.exec(async () => {
          throw new Error('network down');
        }),
      ).rejects.toThrow('network');
    }
    now += 60_000;
    await expect(
      breaker.exec(async () => {
        throw new Error('timeout again');
      }),
    ).rejects.toThrow('timeout');
    expect(breaker.getStatus().state).toBe('open');
  });
});
