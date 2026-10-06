import {
  Body,
  Controller,
  Get,
  HttpCode,
  Header,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { ExecutionsQueryDto } from './dto/executions-query.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('Paper Trading')
@Controller('trading')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly auth: AuthService,
  ) {}

  @Post('orders')
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary: 'Place a paper market order',
    description:
      'Fills immediately at the latest eligible close or returns a persisted REJECTED order for a business-rule rejection.',
    authenticated: true,
    responseDescription: 'Terminal FILLED or REJECTED market order.',
    responseSchema: apiSchemaRef('PlaceOrderResponse'),
    errors: [400, 401, 403, 404, 409, 500],
  })
  place(@Req() request: AuthenticatedRequest, @Body() dto: PlaceOrderDto) {
    return this.orders.placeMarketOrder(this.requireUserId(request), {
      symbol: dto.symbol,
      side: dto.side,
      quantity: dto.quantity,
      clientOrderId: dto.client_order_id,
    });
  }

  @Get('orders')
  @ApiEndpoint({
    summary: 'List recent paper orders',
    authenticated: true,
    responseDescription: 'Newest-first owner-scoped order page.',
    responseSchema: apiSchemaRef('OrderList'),
    errors: [400, 401, 404, 500],
  })
  listOrders(
    @Req() request: AuthenticatedRequest,
    @Query() query: OrdersQueryDto,
  ) {
    return this.orders.listOrders(this.requireUserId(request), {
      status: query.status,
      symbol: query.symbol,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  @Get('executions.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="paper-executions.csv"')
  @ApiEndpoint({
    summary: 'Export paper execution history',
    authenticated: true,
    responseDescription: 'Owned execution ledger as CSV (up to 100,000 rows).',
    errors: [400, 401, 500],
  })
  exportExecutions(@Req() request: AuthenticatedRequest) {
    return this.orders.exportExecutions(this.requireUserId(request));
  }

  @Get('executions')
  @ApiEndpoint({
    summary: 'List paper-trade executions',
    authenticated: true,
    responseDescription: 'Newest-first owner-scoped execution page.',
    responseSchema: apiSchemaRef('ExecutionList'),
    errors: [400, 401, 404, 500],
  })
  listExecutions(
    @Req() request: AuthenticatedRequest,
    @Query() query: ExecutionsQueryDto,
  ) {
    return this.orders.listExecutions(this.requireUserId(request), {
      symbol: query.symbol,
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
    });
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) throw new DomainError(ErrorCode.UNAUTHORIZED);
    return this.auth.requireUserBySessionToken(token).id;
  }
}
