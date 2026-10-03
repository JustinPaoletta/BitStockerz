import { ValidationPipe } from '@nestjs/common';
import { EquityIngestionDto, CryptoIngestionDto } from './ingestion.dto';
import { CreateJobDto } from './create-job.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
function validate(
  body: unknown,
  metatype: typeof EquityIngestionDto | typeof CreateJobDto,
) {
  return pipe.transform(body, { type: 'body', metatype });
}

describe('Bounded manual ingestion DTOs', () => {
  it('accepts omitted filters and normalizes valid symbol input', async () => {
    await expect(validate({}, EquityIngestionDto)).resolves.toEqual({});
    await expect(
      validate({ symbol: ' aapl ' }, EquityIngestionDto),
    ).resolves.toMatchObject({ symbol: 'AAPL' });
    await expect(
      validate(
        { symbol: ' btc-usd ', intervals: ['1d', '1h'] },
        CryptoIngestionDto,
      ),
    ).resolves.toMatchObject({ symbol: 'BTC-USD', intervals: ['1d', '1h'] });
    await expect(
      validate(
        { job_type: 'crypto_import', symbol: ' btc-usd ', intervals: ['1h'] },
        CreateJobDto,
      ),
    ).resolves.toMatchObject({ job_type: 'crypto_import', symbol: 'BTC-USD' });
  });
  it.each([
    {},
    [],
    123,
    'a'.repeat(33),
    '../secrets',
    'https://vendor.test',
    '',
    'AAPL\nMSFT',
  ])('rejects invalid symbols %j', async (symbol) => {
    await expect(validate({ symbol }, EquityIngestionDto)).rejects.toThrow();
    await expect(
      validate({ job_type: 'equity_daily_import', symbol }, CreateJobDto),
    ).rejects.toThrow();
  });
  it.each(['1d', [], ['1d', '1d'], ['1d', '1h', '1d'], ['1m'], [1], {}])(
    'rejects invalid interval arrays %j',
    async (intervals) => {
      await expect(
        validate({ intervals }, CryptoIngestionDto),
      ).rejects.toThrow();
      await expect(
        validate({ job_type: 'crypto_import', intervals }, CreateJobDto),
      ).rejects.toThrow();
    },
  );
  it('rejects unrecognized fields instead of bypassing the validation pipe', async () => {
    await expect(
      validate({ admin: true }, EquityIngestionDto),
    ).rejects.toThrow();
    await expect(
      validate(
        { job_type: 'crypto_import', user_id: 'other-user' },
        CreateJobDto,
      ),
    ).rejects.toThrow();
  });
});
