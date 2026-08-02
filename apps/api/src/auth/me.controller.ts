import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
import { AUTH_TOKEN_REQUEST_KEY, AuthGuard } from './auth.guard';
import type { AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Profile')
@Controller()
export class MeController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiEndpoint({
    summary: 'Read the authenticated profile',
    authenticated: true,
    responseDescription:
      'Current user profile and linked authentication methods.',
    responseSchema: apiSchemaRef('UserProfile'),
    errors: [401, 500],
  })
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.getProfileBySessionToken(
      this.getAuthToken(request),
    );
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiEndpoint({
    summary: 'Update profile preferences',
    description:
      'Updates display_name and/or base_currency. USD is the only supported base currency in the current MVP.',
    authenticated: true,
    responseDescription: 'Updated user profile.',
    responseSchema: apiSchemaRef('UserProfile'),
    errors: [400, 401, 500],
  })
  update(@Req() request: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfileBySessionToken(
      this.getAuthToken(request),
      dto,
    );
  }

  private getAuthToken(request: AuthenticatedRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }
    return token;
  }
}
