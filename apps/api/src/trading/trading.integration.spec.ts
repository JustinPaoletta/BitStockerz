import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { GlobalHttpExceptionFilter } from '../common/errors/http-exception.filter';
import { AppLogger } from '../common/logging/app-logger';
import { FillPriceService } from './fill-price.service';

describe('paper trading covered HTTP integration', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(app.get(AppLogger));
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(app.get(GlobalHttpExceptionFilter));
    await app.init();
  });

  afterEach(async () => app.close());

  async function register(email = `${crypto.randomUUID()}@example.com`) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email })
      .expect(201);
    return response.body.access_token as string;
  }

  it('provisions and lazily reads one fixed-scale paper account', async () => {
    const token = await register();
    await request(app.getHttpServer())
      .get('/api/paper-account')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 1,
          base_currency: 'USD',
          starting_balance: '100000.00',
          cash_balance: '100000.00',
        });
      });
    await request(app.getHttpServer()).get('/api/paper-account').expect(401);
  });

  it('runs the fill, replay, views, partial sell, and close lifecycle', async () => {
    const token = await register();
    const auth = `Bearer ${token}`;
    const buy = {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: '2.5',
      client_order_id: 'covered-buy',
    };
    const first = await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', auth)
      .send(buy)
      .expect(200);
    expect(first.body.order.status).toBe('FILLED');
    const replay = await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', auth)
      .send(buy)
      .expect(200);
    expect(replay.body.order.id).toBe(first.body.order.id);

    await request(app.getHttpServer())
      .get('/api/trading/positions')
      .set('Authorization', auth)
      .expect(200)
      .expect((response) => expect(response.body.positions).toHaveLength(1));
    await request(app.getHttpServer())
      .get('/api/trading/portfolio-summary')
      .set('Authorization', auth)
      .expect(200)
      .expect((response) =>
        expect(response.body.unrealized_pnl_total).toBe('0.00'),
      );
    await request(app.getHttpServer())
      .get('/api/trading/orders?status=FILLED&symbol=AAPL&limit=1&offset=0')
      .set('Authorization', auth)
      .expect(200)
      .expect((response) => expect(response.body.orders).toHaveLength(1));
    await request(app.getHttpServer())
      .get('/api/trading/executions?symbol=AAPL&limit=1&offset=0')
      .set('Authorization', auth)
      .expect(200)
      .expect((response) => expect(response.body.executions).toHaveLength(1));

    for (const [quantity, id] of [
      ['1.5', 'covered-partial'],
      ['1', 'covered-close'],
    ]) {
      await request(app.getHttpServer())
        .post('/api/trading/orders')
        .set('Authorization', auth)
        .send({
          symbol: 'AAPL',
          side: 'SELL',
          quantity,
          client_order_id: id,
        })
        .expect(200);
    }
    await request(app.getHttpServer())
      .get('/api/trading/positions')
      .set('Authorization', auth)
      .expect(200)
      .expect((response) => expect(response.body.positions).toEqual([]));
  });

  it('persists risk rejects and catches semantic idempotency conflicts', async () => {
    const token = await register();
    const auth = `Bearer ${token}`;
    const input = {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: '1000',
      client_order_id: 'covered-reject',
    };
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', auth)
      .send(input)
      .expect(200)
      .expect((response) => {
        expect(response.body.order.status).toBe('REJECTED');
        expect(response.body.order.reject_reason).toBe('MAX_ORDER_NOTIONAL');
      });
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', auth)
      .send({ ...input, quantity: '999' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', auth)
      .send({ symbol: 'AAPL', side: 'SELL', quantity: '1' })
      .expect(200)
      .expect((response) =>
        expect(response.body.order.reject_reason).toBe('INSUFFICIENT_POSITION'),
      );
  });

  it('aggregates average-cost realized gains and losses through partial sales, replay, and reopening', async () => {
    const token = await register();
    const auth = `Bearer ${token}`;
    const other = await register();
    const prices = app.get(FillPriceService);
    let fill = '100';
    jest.spyOn(prices, 'getLatestClose').mockImplementation(async () => ({
      symbolId: 1,
      symbol: 'AAPL',
      price: new Prisma.Decimal(fill),
      asOf: new Date(),
      interval: '1d',
    }));
    jest
      .spyOn(prices, 'getLatestClosesByIds')
      .mockImplementation(
        async (ids) => new Map(ids.map((id) => [id, new Prisma.Decimal(fill)])),
      );
    const order = (side: string, quantity: string, key: string) =>
      request(app.getHttpServer())
        .post('/api/trading/orders')
        .set('Authorization', auth)
        .send({ symbol: 'AAPL', side, quantity, client_order_id: key })
        .expect(200);
    const summary = async (
      expected: Record<string, string>,
      authorization = auth,
    ) => {
      await request(app.getHttpServer())
        .get('/api/trading/portfolio-summary')
        .set('Authorization', authorization)
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject(expected);
          expect(
            new Prisma.Decimal(response.body.realized_pnl_total)
              .add(response.body.unrealized_pnl_total)
              .toFixed(2),
          ).toBe(response.body.total_pnl);
        });
    };
    await order('BUY', '2', 'pnl-buy-1');
    fill = '120';
    await order('BUY', '2', 'pnl-buy-2');
    await summary({
      realized_pnl_total: '0.00',
      unrealized_pnl_total: '40.00',
      total_pnl: '40.00',
    });
    fill = '125';
    await order('SELL', '1.5', 'pnl-partial');
    await summary({
      realized_pnl_total: '22.50',
      unrealized_pnl_total: '37.50',
      total_pnl: '60.00',
    });
    await order('SELL', '1.5', 'pnl-partial');
    await order('SELL', '99', 'pnl-reject');
    await summary({ realized_pnl_total: '22.50', total_pnl: '60.00' });
    await summary(
      {
        realized_pnl_total: '0.00',
        unrealized_pnl_total: '0.00',
        total_pnl: '0.00',
      },
      `Bearer ${other}`,
    );
    fill = '90';
    await order('SELL', '2.5', 'pnl-close');
    await summary({
      realized_pnl_total: '-27.50',
      unrealized_pnl_total: '0.00',
      total_pnl: '-27.50',
    });
    fill = '80';
    await order('BUY', '1', 'pnl-reopen');
    await summary({
      realized_pnl_total: '-27.50',
      unrealized_pnl_total: '0.00',
      total_pnl: '-27.50',
    });
  });

  it('returns a persisted NO_MARKET_PRICE reject and fails MTM closed', async () => {
    const token = await register();
    const auth = `Bearer ${token}`;
    const prices = app.get(FillPriceService);
    const getPrice = jest
      .spyOn(prices, 'getLatestClose')
      .mockRejectedValueOnce(
        new DomainError(ErrorCode.TRADING_NO_MARKET_PRICE),
      );
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', auth)
      .send({ symbol: 'AAPL', side: 'BUY', quantity: '1' })
      .expect(200)
      .expect((response) =>
        expect(response.body.order.reject_reason).toBe('NO_MARKET_PRICE'),
      );
    getPrice.mockRestore();

    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', auth)
      .send({ symbol: 'AAPL', side: 'BUY', quantity: '1' })
      .expect(200);
    jest
      .spyOn(prices, 'getLatestClosesByIds')
      .mockRejectedValueOnce(
        new DomainError(ErrorCode.TRADING_NO_MARKET_PRICE),
      );
    await request(app.getHttpServer())
      .get('/api/trading/portfolio-summary')
      .set('Authorization', auth)
      .expect(422)
      .expect((response) =>
        expect(response.body.code).toBe('TRADING_NO_MARKET_PRICE'),
      );
  });

  it('enforces strict body/query validation, ownership, and empty pages', async () => {
    const first = await register('covered-first@example.com');
    const second = await register('covered-second@example.com');
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', `Bearer ${first}`)
      .send({ symbol: 'AAPL', side: 'BUY', quantity: '1' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/trading/orders')
      .set('Authorization', `Bearer ${second}`)
      .expect(200)
      .expect((response) => expect(response.body.orders).toEqual([]));

    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', `Bearer ${first}`)
      .send({ symbol: 'AAPL', side: 'BUY', quantity: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/trading/orders')
      .set('Authorization', `Bearer ${first}`)
      .send({
        symbol: 'DELISTED',
        side: 'BUY',
        quantity: '1',
      })
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/trading/orders?limit=201')
      .set('Authorization', `Bearer ${first}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/trading/executions?offset=10001')
      .set('Authorization', `Bearer ${first}`)
      .expect(400);
  });
});
