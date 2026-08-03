import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AUTH_TOKEN_REQUEST_KEY,
  AuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
import { PaperAccountsService } from './paper-accounts.service';

@ApiTags('Paper Trading')
@Controller('paper-account')
@UseGuards(AuthGuard)
export class PaperAccountsController {
  constructor(
    private readonly accounts: PaperAccountsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiEndpoint({
    summary: 'Read the current paper account',
    authenticated: true,
    responseDescription: 'The caller’s USD paper account and cash balance.',
    responseSchema: apiSchemaRef('PaperAccount'),
    errors: [401, 500],
  })
  async get(@Req() request: AuthenticatedRequest) {
    const account = await this.accounts.getForUser(this.requireUserId(request));
    return this.accounts.toResponse(account);
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) throw new DomainError(ErrorCode.UNAUTHORIZED);
    return this.auth.requireUserBySessionToken(token).id;
  }
}
