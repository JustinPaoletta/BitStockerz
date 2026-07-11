import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateJobDto } from './create-job.dto';

describe('CreateJobDto', () => {
  it('accepts supported job types and optional payload fields', async () => {
    const dto = plainToInstance(CreateJobDto, {
      job_type: 'crypto_import',
      symbol: 'btc-usd',
      intervals: ['1d', '1h'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects unsupported job types', async () => {
    const dto = plainToInstance(CreateJobDto, {
      job_type: 'unknown_job',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'job_type')).toBe(true);
  });
});
