import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppConfigService } from '../config/app-config.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../observability/audit.service';
import { JobsController } from './jobs.controller';
import { IngestionController } from './ingestion.controller';
import { JobsService } from './jobs.service';
import { JobHandlersService } from './job-handlers.service';
import { ManualIngestionGuard } from './manual-ingestion.guard';

async function setup(nodeEnv: 'production' | 'test') {
  const job = { id: 'owned-job', userId: 'user-1' };
  const handlers = { createAndRun: jest.fn().mockResolvedValue(job) };
  const jobs = {
    getJobForUser: jest.fn().mockResolvedValue(job),
    toJobResponse: jest.fn((record: unknown) => record),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const module = await Test.createTestingModule({
    controllers: [JobsController, IngestionController],
    providers: [
      ManualIngestionGuard,
      AuthGuard,
      { provide: AppConfigService, useValue: { server: { nodeEnv } } },
      {
        provide: AuthService,
        useValue: {
          requireUserBySessionToken: jest.fn(() => ({ id: 'user-1' })),
        },
      },
      { provide: JobHandlersService, useValue: handlers },
      { provide: JobsService, useValue: jobs },
      { provide: AuditService, useValue: audit },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return { app, handlers, jobs, audit, server: app.getHttpServer() as Server };
}

describe('Shared market-data ingestion security', () => {
  let app: INestApplication;
  afterEach(async () => {
    if (app) await app.close();
  });
  it('blocks all authenticated production write entry points before work or audit writes', async () => {
    const fixture = await setup('production');
    app = fixture.app;
    for (const [path, payload] of [
      ['/api/market-data/ingestion/equity', { symbol: 'AAPL' }],
      ['/api/market-data/ingestion/crypto', { symbol: 'BTC-USD' }],
      ['/api/jobs', { job_type: 'market_data_scheduled' }],
    ] as const) {
      const result = await request(fixture.server)
        .post(path)
        .set('Authorization', 'Bearer user-session')
        .send(payload)
        .expect(403);
      expect(result.body.code).toBe('FORBIDDEN');
    }
    expect(fixture.handlers.createAndRun).not.toHaveBeenCalled();
    expect(fixture.audit.record).not.toHaveBeenCalled();
  });
  it('requires authentication and allows owned job reads in production', async () => {
    const fixture = await setup('production');
    app = fixture.app;
    await request(fixture.server)
      .post('/api/jobs')
      .send({ job_type: 'equity_daily_import' })
      .expect(401);
    await request(fixture.server).get('/api/jobs/owned-job').expect(401);
    await request(fixture.server)
      .get('/api/jobs/owned-job')
      .set('Authorization', 'Bearer user-session')
      .expect(200);
    expect(fixture.jobs.getJobForUser).toHaveBeenCalledWith(
      'owned-job',
      'user-1',
    );
  });
  it('retains development fixture tools with validated payloads', async () => {
    const fixture = await setup('test');
    app = fixture.app;
    await request(fixture.server)
      .post('/api/market-data/ingestion/equity')
      .set('Authorization', 'Bearer user-session')
      .send({ symbol: ' aapl ' })
      .expect(201);
    await request(fixture.server)
      .post('/api/market-data/ingestion/crypto')
      .set('Authorization', 'Bearer user-session')
      .send({ symbol: 'btc-usd', intervals: ['1d', '1h'] })
      .expect(201);
    await request(fixture.server)
      .post('/api/jobs')
      .set('Authorization', 'Bearer user-session')
      .send({ job_type: 'crypto_import', intervals: ['1h'] })
      .expect(201);
    expect(fixture.handlers.createAndRun).toHaveBeenCalledWith(
      'equity_daily_import',
      'user-1',
      { symbol: 'AAPL' },
    );
    expect(fixture.handlers.createAndRun).toHaveBeenCalledWith(
      'crypto_import',
      'user-1',
      { symbol: 'BTC-USD', intervals: ['1d', '1h'] },
    );
  });
  it('returns400 for malformed objects, unknown fields or excessive work before handlers', async () => {
    const fixture = await setup('test');
    app = fixture.app;
    for (const [path, body] of [
      ['/api/market-data/ingestion/equity', { symbol: { injected: true } }],
      ['/api/market-data/ingestion/equity', { symbol: 'a'.repeat(33) }],
      ['/api/market-data/ingestion/equity', { admin: true }],
      ['/api/market-data/ingestion/crypto', { intervals: '1d' }],
      ['/api/market-data/ingestion/crypto', { intervals: ['1d', '1d', '1h'] }],
      ['/api/jobs', { job_type: 'crypto_import', intervals: [] }],
      ['/api/jobs', { job_type: 'crypto_import', symbol: 123 }],
    ] as const) {
      await request(fixture.server)
        .post(path)
        .set('Authorization', 'Bearer user-session')
        .send(body)
        .expect(400);
    }
    expect(fixture.handlers.createAndRun).not.toHaveBeenCalled();
  });
});
