import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { PrismaModule } from '../prisma/prisma.module';
import { IngestionController } from './ingestion.controller';
import { JobExecutorService } from './job-executor.service';
import { JobHandlersService } from './job-handlers.service';
import { JobSchedulerService } from './job-scheduler.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [
    PrismaModule,
    MarketDataModule,
    AuthModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [JobsController, IngestionController],
  providers: [
    JobsService,
    JobExecutorService,
    JobHandlersService,
    JobSchedulerService,
  ],
  exports: [JobsService, JobHandlersService, JobExecutorService],
})
export class JobsModule {}
