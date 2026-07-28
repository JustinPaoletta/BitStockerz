import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
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
import { GetStrategyQueryDto } from './dto/get-strategy-query.dto';
import { ListStrategiesQueryDto } from './dto/list-strategies-query.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { ValidateStrategyDto } from './dto/validate-strategy.dto';
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

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validate(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ValidateStrategyDto,
  ) {
    return this.strategiesService.validate(this.requireUserId(request), dto);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListStrategiesQueryDto,
  ) {
    return this.strategiesService.list(this.requireUserId(request), {
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  @Get(':id')
  getById(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: GetStrategyQueryDto = {},
  ) {
    return this.strategiesService.getById(
      this.requireUserId(request),
      id,
      query.version,
    );
  }

  @Put(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStrategyDto,
  ) {
    return this.strategiesService.update(this.requireUserId(request), id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.strategiesService.delete(this.requireUserId(request), id);
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }

    return this.authService.requireUserBySessionToken(token).id;
  }
}
