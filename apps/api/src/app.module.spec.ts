import { RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

describe('AppModule', () => {
  it('registers the request id middleware for all routes', () => {
    const consumer = {
      apply: jest.fn().mockReturnThis(),
      forRoutes: jest.fn(),
    };

    const module = new AppModule();
    module.configure(consumer as any);

    expect(consumer.apply).toHaveBeenCalledWith(RequestIdMiddleware);
    expect(consumer.forRoutes).toHaveBeenCalledWith({ path: '*path', method: RequestMethod.ALL });
  });
});
