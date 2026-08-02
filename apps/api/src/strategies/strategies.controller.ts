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
import { ApiParam, ApiTags } from '@nestjs/swagger';
import {
  AUTH_TOKEN_REQUEST_KEY,
  AuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { GetStrategyQueryDto } from './dto/get-strategy-query.dto';
import { ListStrategiesQueryDto } from './dto/list-strategies-query.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { ValidateStrategyDto } from './dto/validate-strategy.dto';
import { StrategiesService } from './strategies.service';

@ApiTags('Strategies')
@Controller('strategies')
@UseGuards(AuthGuard)
export class StrategiesController {
  constructor(
    private readonly strategiesService: StrategiesService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @ApiEndpoint({
    summary: 'Create a strategy',
    description:
      'Creates owner-scoped strategy metadata and immutable version 1 after canonical definition validation.',
    status: 201,
    authenticated: true,
    responseDescription: 'Created strategy with its first version and summary.',
    responseSchema: apiSchemaRef('Strategy'),
    errors: [400, 401, 409, 500],
  })
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateStrategyDto) {
    return this.strategiesService.create(this.requireUserId(request), dto);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary: 'Validate a strategy definition',
    description:
      'Validates either an inline definition or an owned strategy_id without persisting changes. Definition validation failures are returned in a 200 response.',
    authenticated: true,
    responseDescription:
      'Canonical validation result and deterministic summary.',
    responseSchema: apiSchemaRef('StrategyValidation'),
    errors: [400, 401, 404, 500],
  })
  validate(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ValidateStrategyDto,
  ) {
    return this.strategiesService.validate(this.requireUserId(request), dto);
  }

  @Get()
  @ApiEndpoint({
    summary: 'List owned strategies',
    description:
      'Returns active strategies ordered by updated_at descending, then id.',
    authenticated: true,
    responseDescription: 'Page of active owned strategies.',
    responseSchema: apiSchemaRef('StrategyList'),
    errors: [400, 401, 500],
  })
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
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Read an owned strategy',
    description:
      'Returns the latest version by default. Supply version to read an immutable historical definition.',
    authenticated: true,
    responseDescription: 'Strategy metadata, selected definition, and summary.',
    responseSchema: apiSchemaRef('Strategy'),
    errors: [400, 401, 404, 500],
  })
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
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Update an owned strategy',
    description:
      'Updates metadata and appends an immutable version whenever definition is present.',
    authenticated: true,
    responseDescription: 'Updated strategy with the selected latest version.',
    responseSchema: apiSchemaRef('Strategy'),
    errors: [400, 401, 404, 409, 500],
  })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStrategyDto,
  ) {
    return this.strategiesService.update(this.requireUserId(request), id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Soft-delete an owned strategy',
    authenticated: true,
    status: 204,
    responseDescription: 'Strategy deactivated; response has no body.',
    errors: [400, 401, 404, 500],
  })
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
