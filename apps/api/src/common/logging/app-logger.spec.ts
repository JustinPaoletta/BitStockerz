import { AppLogger } from './app-logger';
import type { Logger as PinoNestLogger } from 'nestjs-pino';

describe('AppLogger', () => {
  let pinoLogger: jest.Mocked<PinoNestLogger>;
  let logger: AppLogger;

  beforeEach(() => {
    pinoLogger = {
      log: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<PinoNestLogger>;
    logger = new AppLogger(pinoLogger);
  });

  it('suppresses route mapping logs', () => {
    logger.log('Mapped {/api, GET} route', 'RouterExplorer');
    expect(pinoLogger.log).not.toHaveBeenCalled();
  });

  it('suppresses startup message logs', () => {
    logger.log('Nest application successfully started');
    expect(pinoLogger.log).not.toHaveBeenCalled();
  });

  it('suppresses when message is an error with a suppressed message', () => {
    logger.log(new Error('Nest application successfully started'));
    expect(pinoLogger.log).not.toHaveBeenCalled();
  });

  it('suppresses when message is an object with a suppressed message', () => {
    logger.log({ message: 'Nest application successfully started' });
    expect(pinoLogger.log).not.toHaveBeenCalled();
  });

  it('passes through non-suppressed logs', () => {
    logger.log('service initialized', 'AppService');
    expect(pinoLogger.log).toHaveBeenCalledWith('service initialized', 'AppService');
  });

  it('does not suppress when context is not a string', () => {
    logger.log('custom', { context: 'RouterExplorer' });
    expect(pinoLogger.log).toHaveBeenCalledWith('custom', { context: 'RouterExplorer' });
  });

  it('does not suppress when message object lacks message string', () => {
    logger.log({ detail: 'no message' });
    expect(pinoLogger.log).toHaveBeenCalledWith({ detail: 'no message' });
  });

  it('suppresses debug and verbose for route mapping contexts', () => {
    logger.debug('Mapped {/api, GET} route', 'RouterExplorer');
    logger.verbose('AppController {/api}:', 'RoutesResolver');
    expect(pinoLogger.debug).not.toHaveBeenCalled();
    expect(pinoLogger.verbose).not.toHaveBeenCalled();
  });

  it('does not suppress warn or error logs', () => {
    logger.warn('warning', 'RouterExplorer');
    logger.error('error', 'RoutesResolver');
    expect(pinoLogger.warn).toHaveBeenCalledWith('warning', 'RouterExplorer');
    expect(pinoLogger.error).toHaveBeenCalledWith('error', 'RoutesResolver');
  });
});
