import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { GlobalHttpExceptionFilter } from '../common/errors/http-exception.filter';
import { MarketDataService } from '../market-data/market-data.service';
import { ProductService } from './product.service';
const definition = {
  indicators: [
    { id: 'sma', type: 'SMA', params: { period: 2 }, source: 'close' },
  ],
  entry: {
    logic: 'AND',
    conditions: [{ left: { price: 'close' }, op: 'gt', right: { literal: 0 } }],
  },
  exit: {
    logic: 'AND',
    conditions: [{ left: { price: 'close' }, op: 'lt', right: { literal: 0 } }],
  },
  risk: {
    stop_loss: { type: 'percent', value: 2 },
    take_profit: { type: 'percent', value: 5 },
  },
};
describe('product workspace ownership and account lifecycle', () => {
  let app: INestApplication;
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(app.get(GlobalHttpExceptionFilter));
    await app.init();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });
  async function account() {
    const email = `${crypto.randomUUID()}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email })
      .expect(201);
    return {
      email,
      token: response.body.access_token as string,
      auth: `Bearer ${response.body.access_token}`,
    };
  }
  it('saves an isolated watchlist, charts with strategy overlays, and validates mismatches', async () => {
    const user = await account(),
      other = await account();
    await request(app.getHttpServer())
      .get('/api/workspace/watchlist')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/workspace/watchlist')
      .set('Authorization', user.auth)
      .send({ symbol: 'AAPL' })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/workspace/watchlist')
      .set('Authorization', user.auth)
      .send({ symbol: 'AAPL', unexpected: true })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/workspace/watchlist')
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => expect(r.body.symbols[0].symbol).toBe('AAPL'));
    await request(app.getHttpServer())
      .get('/api/workspace/watchlist')
      .set('Authorization', other.auth)
      .expect(200)
      .expect((r) => expect(r.body.symbols).toHaveLength(0));
    const strategy = await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', user.auth)
      .send({
        name: 'Chart',
        asset_type: 'EQUITY',
        timeframe: '1d',
        definition,
      })
      .expect(201);
    const end = new Date().toISOString().slice(0, 10),
      start = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const query = `symbol=AAPL&timeframe=1d&start=${start}&end=${end}&strategy_id=${strategy.body.id}`;
    await request(app.getHttpServer())
      .get(`/api/workspace/chart?${query}`)
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => {
        expect(r.body.data_mode).toBe('seed');
        expect(r.body.bars.length).toBeGreaterThan(0);
        expect(r.body.indicators[0].points.length).toBeGreaterThan(0);
      });
    await request(app.getHttpServer())
      .get(`/api/workspace/chart?${query}`)
      .set('Authorization', other.auth)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `/api/workspace/chart?${query.replace('timeframe=1d', 'timeframe=1h')}`,
      )
      .set('Authorization', user.auth)
      .expect(400);
    await request(app.getHttpServer())
      .delete('/api/workspace/watchlist/AAPL')
      .set('Authorization', user.auth)
      .expect(204);
  });
  it('supports hourly chart timestamps and rejects oversized, reversed and mismatched ranges', async () => {
    const user = await account();
    const end = new Date().toISOString(),
      start = new Date(Date.now() - 86400000).toISOString();
    await request(app.getHttpServer())
      .get(
        `/api/workspace/chart?symbol=BTC-USD&timeframe=1h&start=${start}&end=${end}`,
      )
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => expect(r.body.indicators).toEqual([]));
    await request(app.getHttpServer())
      .get('/api/workspace/prices/AAPL')
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => expect(r.body.as_of).toMatch(/Z$/));
    await request(app.getHttpServer())
      .get(
        `/api/workspace/chart?symbol=AAPL&timeframe=1d&start=${end}&end=${start}`,
      )
      .set('Authorization', user.auth)
      .expect(400);
    await request(app.getHttpServer())
      .get(
        '/api/workspace/chart?symbol=AAPL&timeframe=1d&start=2000-01-01&end=2026-10-03',
      )
      .set('Authorization', user.auth)
      .expect(400);
    const strategy = await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', user.auth)
      .send({
        name: 'Mismatch',
        asset_type: 'EQUITY',
        timeframe: '1d',
        definition,
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(
        `/api/workspace/chart?symbol=BTC-USD&timeframe=1d&start=2026-10-01&end=2026-10-03&strategy_id=${strategy.body.id}`,
      )
      .set('Authorization', user.auth)
      .expect(400);
    await request(app.getHttpServer())
      .get(
        `/api/workspace/chart?symbol=AAPL&timeframe=1d&start=2026-10-01T00:00:00Z&end=2026-10-03T00:00:00Z`,
      )
      .set('Authorization', user.auth)
      .expect(200);
  });

  it('archives a reset ledger, retires idempotency keys, exports and deletes only owned data', async () => {
    const user = await account(),
      other = await account();
    const body = {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: '1',
      client_order_id: 'prior-ledger',
    };
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', user.auth)
      .send(body)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', other.auth)
      .send(body)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/workspace/paper/reset')
      .set('Authorization', user.auth)
      .send({ confirmation: 'WRONG' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/workspace/paper/reset')
      .set('Authorization', user.auth)
      .send({ confirmation: 'RESET' })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/workspace/paper/archives')
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => {
        expect(r.body.archives).toHaveLength(1);
        expect(r.body.archives[0].snapshot.orders).toHaveLength(1);
      });
    await request(app.getHttpServer())
      .get('/api/workspace/paper/archives')
      .set('Authorization', other.auth)
      .expect(200)
      .expect((r) => expect(r.body.archives).toHaveLength(0));
    await request(app.getHttpServer())
      .get('/api/workspace/account-export')
      .set('Authorization', other.auth)
      .expect(200)
      .expect((r) => {
        expect(r.body.orders).toHaveLength(1);
        expect(r.body.executions).toHaveLength(1);
        expect(r.body.positions).toHaveLength(1);
      });
    await request(app.getHttpServer())
      .post('/api/workspace/paper/reset')
      .set('Authorization', other.auth)
      .send({ confirmation: 'RESET' })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/paper-account')
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => expect(r.body.cash_balance).toBe('100000.00'));
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', user.auth)
      .send(body)
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', user.auth)
      .send({ ...body, client_order_id: 'new-ledger' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/trading/executions.csv')
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => expect(r.text).toContain('"AAPL","BUY","1.00000000"'));
    await request(app.getHttpServer())
      .get('/api/workspace/account-export')
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => {
        expect(r.body.profile.email).toBe(user.email);
        expect(JSON.stringify(r.body)).not.toContain(user.token);
        expect(r.body.orders).toHaveLength(1);
      });
    await request(app.getHttpServer())
      .delete('/api/workspace/account')
      .set('Authorization', user.auth)
      .send({ confirmation: other.email })
      .expect(400);
    await request(app.getHttpServer())
      .delete('/api/workspace/account')
      .set('Authorization', user.auth)
      .send({ confirmation: user.email })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/workspace/watchlist')
      .set('Authorization', user.auth)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/paper-account')
      .set('Authorization', other.auth)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/workspace/paper/archives')
      .set('Authorization', other.auth)
      .expect(200)
      .expect((r) => expect(r.body.archives).toHaveLength(1));
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', other.auth)
      .send(body)
      .expect(409);
  });
  it('lists hashed session identifiers and enforces ownership when revoking', async () => {
    const user = await account(),
      other = await account();
    const sessions = await request(app.getHttpServer())
      .get('/api/me/security/sessions')
      .set('Authorization', user.auth)
      .expect(200);
    expect(sessions.body.sessions[0].id).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(sessions.body)).not.toContain(user.token);
    await request(app.getHttpServer())
      .delete(`/api/me/security/sessions/${sessions.body.sessions[0].id}`)
      .set('Authorization', other.auth)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/me/security/passkeys')
      .set('Authorization', user.auth)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/me/security/passkeys/options')
      .set('Authorization', user.auth)
      .send({})
      .expect(200)
      .expect((r) =>
        expect(r.body.options.authenticatorSelection.userVerification).toBe(
          'required',
        ),
      );
    await request(app.getHttpServer())
      .post('/api/me/security/passkeys/verify')
      .set('Authorization', user.auth)
      .send({ challenge_id: crypto.randomUUID(), response: {} })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/me/security/sessions/${sessions.body.sessions[0].id}`)
      .set('Authorization', user.auth)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', user.auth)
      .expect(401);
  });
  it('pins runner versions, rejects duplicate symbols and isolates controls', async () => {
    const user = await account(),
      other = await account();
    const strategy = await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', user.auth)
      .send({
        name: 'Runner',
        asset_type: 'EQUITY',
        timeframe: '1d',
        definition,
      })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/automations')
      .set('Authorization', user.auth)
      .send({
        strategy_id: strategy.body.id,
        symbol: 'AAPL',
        allocation_pct: 10,
      })
      .expect(201);
    expect(created.body.status).toBe('paused');
    await request(app.getHttpServer())
      .post('/api/automations')
      .set('Authorization', user.auth)
      .send({
        strategy_id: strategy.body.id,
        symbol: 'AAPL',
        allocation_pct: 10,
      })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/automations/${created.body.id}/control`)
      .set('Authorization', other.auth)
      .send({ status: 'active' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/automations/${created.body.id}/control`)
      .set('Authorization', user.auth)
      .send({ status: 'active' })
      .expect(201);
    const market = app.get(MarketDataService);
    const asOf = new Date(Date.now() - 86400000);
    asOf.setUTCHours(0, 0, 0, 0);
    jest.spyOn(market, 'getLatestClose').mockResolvedValue({
      symbol_id: 1,
      symbol: 'AAPL',
      price: '100',
      as_of: asOf.toISOString(),
      interval: '1d',
    });
    jest
      .spyOn(market, 'getBacktestBars')
      .mockResolvedValue([
        { ts: asOf, open: 100, high: 100, low: 100, close: 100, volume: 100 },
      ]);
    await request(app.getHttpServer())
      .post(`/api/automations/${created.body.id}/evaluate`)
      .set('Authorization', user.auth)
      .send({})
      .expect(201)
      .expect((r) => expect(r.body.state.quantity).toBe('100.00000000'));
    await request(app.getHttpServer())
      .post(`/api/automations/${created.body.id}/evaluate`)
      .set('Authorization', user.auth)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/trading/orders')
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => expect(r.body.orders).toHaveLength(1));
    await request(app.getHttpServer())
      .post(`/api/automations/${created.body.id}/control`)
      .set('Authorization', user.auth)
      .send({ status: 'stopped' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/workspace/paper/reset')
      .set('Authorization', user.auth)
      .send({ confirmation: 'RESET' })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/automations')
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => expect(r.body.automations[0].status).toBe('stopped'));
  });
  it('persists costs and benchmark, exports complete research, and hides other owners', async () => {
    const user = await account(),
      other = await account();
    const strategy = await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', user.auth)
      .send({
        name: 'Costs',
        asset_type: 'EQUITY',
        timeframe: '1d',
        definition,
      })
      .expect(201);
    const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const simulation = {
      allocation_pct: 50,
      commission_bps: 10,
      slippage_bps: 10,
      execution_timing: 'next_open',
      evaluation_period: 'out_of_sample',
    };
    const run = await request(app.getHttpServer())
      .post('/api/backtests')
      .set('Authorization', user.auth)
      .send({
        strategy_id: strategy.body.id,
        symbol: 'AAPL',
        timeframe: '1d',
        start_date: start,
        end_date: end,
        initial_equity: 10000,
        simulation,
      })
      .expect((response) => {
        if (response.status !== 200)
          throw new Error(JSON.stringify(response.body));
      })
      .expect(200);
    const id = run.body.run.id as string;
    expect(run.body.run.simulation).toEqual(simulation);
    expect(run.body.results.benchmark.final_equity).toMatch(/^\d+\.\d{2}$/);
    await request(app.getHttpServer())
      .get(`/api/backtests/${id}/research`)
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => {
        expect(r.body.definition).toEqual(definition);
        expect(r.body.version_number).toBe(1);
        expect(r.body.results.benchmark).toBeDefined();
      });
    await request(app.getHttpServer())
      .get(`/api/backtests/${id}/trades.csv`)
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) =>
        expect(r.text).toContain('"fees_abs","pnl_abs","pnl_pct"'),
      );
    await request(app.getHttpServer())
      .get(`/api/backtests/${id}/results.csv`)
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => {
        expect(r.text).toContain('"definition","results"');
        expect(r.text).toContain('out_of_sample');
      });
    for (const suffix of ['research', 'trades.csv', 'results.csv']) {
      await request(app.getHttpServer())
        .get(`/api/backtests/${id}/${suffix}`)
        .set('Authorization', other.auth)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/backtests/${crypto.randomUUID()}/${suffix}`)
        .set('Authorization', user.auth)
        .expect(404);
    }
    await request(app.getHttpServer())
      .delete(`/api/strategies/${strategy.body.id}`)
      .set('Authorization', user.auth)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/backtests/${id}/research`)
      .set('Authorization', user.auth)
      .expect(200)
      .expect((r) => expect(r.body.definition).toEqual(definition));
  });

  it('fails account deletion while a job is active', async () => {
    const user = await account();
    const auth = app.get(AuthService);
    const id = auth.requireUserBySessionToken(user.token).id;
    const product = app.get(ProductService);
    const jobs = (
      product as unknown as { jobs: { exportMemoryForUser: () => unknown[] } }
    ).jobs;
    jest
      .spyOn(jobs, 'exportMemoryForUser')
      .mockReturnValue([{ status: 'running' }]);
    await expect(product.deleteUser(user.token, user.email)).rejects.toThrow();
    expect(auth.requireUserBySessionToken(user.token).id).toBe(id);
  });
});
