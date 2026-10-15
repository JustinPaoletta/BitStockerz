import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  AppConfigService,
  loadAppConfig,
} from '../src/config/app-config.service';
import { GlobalHttpExceptionFilter } from '../src/common/errors/http-exception.filter';

describe('private beta global access boundary', () => {
  let app: INestApplication<App>;
  const key = 'a'.repeat(64);
  beforeAll(async () => {
    const config = new AppConfigService();
    jest.spyOn(config, 'server', 'get').mockReturnValue(
      loadAppConfig({
        NODE_ENV: 'test',
        PRIVATE_BETA_ENABLED: 'true',
        PRIVATE_BETA_PROXY_KEY: key,
      }).server,
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfigService)
      .useValue(config)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(app.get(GlobalHttpExceptionFilter));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('keeps health probes available while blocking direct data and auth requests', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200);
    await request(app.getHttpServer()).get('/api/auth/providers').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/webauthn/register/options')
      .send({})
      .expect(401);
    await request(app.getHttpServer()).get('/api').expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/providers')
      .set('x-bitstockerz-beta-key', key)
      .expect(200);
    // The gateway key does not replace the user's application session.
    await request(app.getHttpServer())
      .get('/api/me')
      .set('x-bitstockerz-beta-key', key)
      .expect(401);
  });
});
