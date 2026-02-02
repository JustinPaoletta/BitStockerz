import {
  Controller,
  Get,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

/**
 * Controller used only for error contract e2e tests.
 * Each route triggers a specific error code.
 */
@Controller('error-test')
export class ErrorTestController {
  @Get('unauthorized')
  unauthorized() {
    throw new UnauthorizedException('Authentication required');
  }

  @Get('forbidden')
  forbidden() {
    throw new ForbiddenException('Access denied');
  }

  @Get('conflict')
  conflict() {
    throw new ConflictException('Resource already exists');
  }

  @Get('rate-limited')
  rateLimited() {
    throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  @Get('internal')
  internal() {
    throw new Error('Unhandled internal error');
  }
}
