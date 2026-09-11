import { CanActivate, Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class ErrorTestEnabledGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(): boolean {
    if (!this.config.server.errorTestEnabled) {
      throw new DomainError(ErrorCode.NOT_FOUND);
    }
    return true;
  }
}
