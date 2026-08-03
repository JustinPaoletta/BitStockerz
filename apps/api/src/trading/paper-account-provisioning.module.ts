import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaperAccountProvisioner } from './paper-account-provisioner.service';
import { TradingMemoryStore } from './trading-memory.store';

@Module({
  imports: [AppConfigModule, PrismaModule],
  providers: [PaperAccountProvisioner, TradingMemoryStore],
  exports: [PaperAccountProvisioner, TradingMemoryStore],
})
export class PaperAccountProvisioningModule {}
