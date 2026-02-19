import { Injectable, LoggerService } from '@nestjs/common';
import { Logger as PinoNestLogger } from 'nestjs-pino';

const SUPPRESSED_CONTEXTS = new Set(['RoutesResolver', 'RouterExplorer', 'NestApplication']);
const SUPPRESSED_MESSAGES = new Set(['Nest application successfully started']);

function extractContext(optionalParams: unknown[]): string | undefined {
  if (optionalParams.length === 0) {
    return undefined;
  }
  const ctx = optionalParams[optionalParams.length - 1];
  return typeof ctx === 'string' ? ctx : undefined;
}

function extractMessage(message: unknown): string | undefined {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  if (message && typeof message === 'object' && 'message' in message) {
    const candidate = (message as { message?: unknown }).message;
    return typeof candidate === 'string' ? candidate : undefined;
  }
  return undefined;
}

function shouldSuppress(message: unknown, optionalParams: unknown[]): boolean {
  const context = extractContext(optionalParams);
  if (context && SUPPRESSED_CONTEXTS.has(context)) {
    return true;
  }
  const msg = extractMessage(message);
  return msg ? SUPPRESSED_MESSAGES.has(msg) : false;
}

@Injectable()
export class AppLogger implements LoggerService {
  constructor(private readonly logger: PinoNestLogger) {}

  log(message: unknown, ...optionalParams: unknown[]) {
    if (shouldSuppress(message, optionalParams)) {
      return;
    }
    this.logger.log(message, ...(optionalParams as []));
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    if (shouldSuppress(message, optionalParams)) {
      return;
    }
    this.logger.debug(message, ...(optionalParams as []));
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    if (shouldSuppress(message, optionalParams)) {
      return;
    }
    this.logger.verbose(message, ...(optionalParams as []));
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.logger.warn(message, ...(optionalParams as []));
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.logger.error(message, ...(optionalParams as []));
  }
}
