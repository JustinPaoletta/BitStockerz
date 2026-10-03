import { CanActivate, Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';

/** Shared market data may only be updated by the internal scheduler in production. */
@Injectable()
export class ManualIngestionGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(): boolean {
    if (!['development', 'test'].includes(this.config.server.nodeEnv)) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        'Manual market data ingestion is unavailable in production.',
      );
    }
    return true;
  }
}
