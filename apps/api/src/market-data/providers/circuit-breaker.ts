export type CircuitState = 'closed' | 'open' | 'half_open';

export class CircuitOpenError extends Error {
  readonly code = 'CIRCUIT_OPEN';

  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class PermanentProviderError extends Error {
  readonly permanent = true as const;

  constructor(message: string) {
    super(message);
    this.name = 'PermanentProviderError';
  }
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  clock?: () => number;
}

export function isTransientProviderError(error: unknown): boolean {
  if (error instanceof PermanentProviderError) {
    return false;
  }
  if (error instanceof CircuitOpenError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return true;
  }

  const message = error.message.toLowerCase();
  if (
    message.includes('validation') ||
    message.includes('not configured') ||
    message.includes('invalid configuration')
  ) {
    return false;
  }

  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('econn') ||
    message.includes('429') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('5xx') ||
    /http\s*5\d\d/.test(message)
  );
}

export class CircuitBreaker {
  private consecutiveFailures = 0;
  private state: CircuitState = 'closed';
  private openedAt = 0;
  private halfOpenInFlight = false;
  private readonly clock: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.clock = options.clock ?? (() => Date.now());
  }

  getStatus(): {
    state: CircuitState;
    consecutive_failures: number;
    opened_at: number | null;
  } {
    this.maybeTransitionToHalfOpen();
    return {
      state: this.state,
      consecutive_failures: this.consecutiveFailures,
      opened_at: this.state === 'open' ? this.openedAt : null,
    };
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === 'open') {
      throw new CircuitOpenError();
    }

    if (this.state === 'half_open') {
      if (this.halfOpenInFlight) {
        throw new CircuitOpenError('Circuit breaker probe already in flight');
      }
      this.halfOpenInFlight = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    } finally {
      if (this.state === 'half_open' || this.halfOpenInFlight) {
        this.halfOpenInFlight = false;
      }
    }
  }

  private maybeTransitionToHalfOpen(): void {
    if (this.state !== 'open') {
      return;
    }
    if (this.clock() - this.openedAt >= this.options.cooldownMs) {
      this.state = 'half_open';
      this.halfOpenInFlight = false;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
    this.openedAt = 0;
    this.halfOpenInFlight = false;
  }

  private onFailure(error: unknown): void {
    if (!isTransientProviderError(error)) {
      // Permanent errors do not trip the breaker; leave state unchanged aside
      // from clearing a half-open probe slot (handled in finally).
      if (this.state === 'half_open') {
        this.state = 'open';
        this.openedAt = this.clock();
      }
      return;
    }

    this.consecutiveFailures += 1;
    if (
      this.state === 'half_open' ||
      this.consecutiveFailures >= this.options.failureThreshold
    ) {
      this.state = 'open';
      this.openedAt = this.clock();
    }
  }
}
