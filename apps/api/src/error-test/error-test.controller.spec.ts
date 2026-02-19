import { ConflictException, ForbiddenException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ErrorTestController } from './error-test.controller';

describe('ErrorTestController', () => {
  let controller: ErrorTestController;

  beforeEach(() => {
    controller = new ErrorTestController();
  });

  it('throws UnauthorizedException', () => {
    expect(() => controller.unauthorized()).toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException', () => {
    expect(() => controller.forbidden()).toThrow(ForbiddenException);
  });

  it('throws ConflictException', () => {
    expect(() => controller.conflict()).toThrow(ConflictException);
  });

  it('throws HttpException with status 429', () => {
    try {
      controller.rateLimited();
      fail('Expected rateLimited to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('throws generic Error for internal', () => {
    expect(() => controller.internal()).toThrow(Error);
  });
});
