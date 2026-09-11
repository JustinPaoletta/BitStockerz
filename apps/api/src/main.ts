import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/errors/http-exception.filter';
import { AppLogger } from './common/logging/app-logger';
import { AppConfigService } from './config/app-config.service';
import { configureOpenApi } from './docs/openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);
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
  configureOpenApi(app);
  await app.listen(config.server.port);
}
void bootstrap();
