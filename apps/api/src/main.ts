import './load-env';
import type { Express } from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/errors/http-exception.filter';
import { AppLogger } from './common/logging/app-logger';
import { AppConfigService } from './config/app-config.service';
import { configureOpenApi } from './docs/openapi';
import { configureTrustedProxy } from './common/http/trusted-proxy';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);
  configureTrustedProxy(
    app.getHttpAdapter().getInstance() as Express,
    config.server.trustedProxyCidrs,
  );
  app.useLogger(app.get(AppLogger));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(app.get(GlobalHttpExceptionFilter));
  const corsOrigins = config.server.corsAllowedOrigins;
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
    });
  }
  if (config.server.openApiEnabled) {
    configureOpenApi(app);
  }
  await app.listen(config.server.port, config.server.host);
}
void bootstrap();
