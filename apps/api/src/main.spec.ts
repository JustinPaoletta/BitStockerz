import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppLogger } from './common/logging/app-logger';
import { GlobalHttpExceptionFilter } from './common/errors/http-exception.filter';
import { AppConfigService } from './config/app-config.service';

const createMockApp = (port = 3000) => ({
  useLogger: jest.fn(),
  setGlobalPrefix: jest.fn(),
  useGlobalPipes: jest.fn(),
  useGlobalFilters: jest.fn(),
  listen: jest.fn().mockResolvedValue(undefined),
  get: jest.fn((token) => {
    if (typeof token === 'function' && token.name === AppConfigService.name) {
      return { server: { port } };
    }
    return token;
  }),
});

const createMock = jest.fn();

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: createMock,
  },
}));

describe('bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    createMock.mockReset();
  });

  it('boots the app with global pipes, filters, and logger', async () => {
    const mockApp = createMockApp(4567);
    createMock.mockResolvedValue(mockApp);

    jest.isolateModules(() => {
      require('./main');
    });
    await new Promise((resolve) => setImmediate(resolve));

    const [appModuleArg, optionsArg] = createMock.mock.calls[0];
    expect(appModuleArg).toBeDefined();
    expect(appModuleArg.name).toBe('AppModule');
    expect(optionsArg).toEqual({ bufferLogs: true });
    const loggerArg = mockApp.useLogger.mock.calls[0][0];
    expect(loggerArg).toBeDefined();
    expect(loggerArg.name).toBe('AppLogger');
    expect(mockApp.setGlobalPrefix).toHaveBeenCalledWith('api');
    const filterArg = mockApp.useGlobalFilters.mock.calls[0][0];
    expect(filterArg).toBeDefined();
    expect(filterArg.name).toBe('GlobalHttpExceptionFilter');
    expect(
      mockApp.get.mock.calls.some(([token]) => typeof token === 'function' && token.name === AppConfigService.name),
    ).toBe(true);
    expect(mockApp.listen).toHaveBeenCalledWith(4567);
    expect(mockApp.useGlobalPipes).toHaveBeenCalledTimes(1);
    const pipeArg = mockApp.useGlobalPipes.mock.calls[0][0];
    expect(pipeArg).toBeDefined();
    expect(pipeArg.constructor?.name).toBe('ValidationPipe');
  });

  it('uses default config port when no override is provided', async () => {
    const mockApp = createMockApp();
    createMock.mockResolvedValue(mockApp);

    jest.isolateModules(() => {
      require('./main');
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockApp.listen).toHaveBeenCalledWith(3000);
  });
});
