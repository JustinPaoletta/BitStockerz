import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AUTH_TOKEN_REQUEST_KEY,
  AuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { StrategiesService } from './strategies.service';

@Controller('strategies')
@UseGuards(AuthGuard)
export class StrategiesController {
  constructor(
    private readonly strategiesService: StrategiesService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateStrategyDto) {
    return this.strategiesService.create(this.requireUserId(request), dto);
  }

  @Get(':id')
  getById(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.strategiesService.getById(this.requireUserId(request), id);
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }

    return this.authService.requireUserBySessionToken(token).id;
  }
}
