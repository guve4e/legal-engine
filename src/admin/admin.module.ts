// src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AiUsageAdminController } from './ai-usage-admin.controller';
import { TrafficController } from './traffic.controller';

import { AiUsageService } from '../ai/ai-usage.service';
import { AiModule } from '../ai/ai.module';
import { PgModule } from '../pg/pg.module';
import { TrafficService } from './traffic.service';

@Module({
  imports: [
    PgModule, // gives TrafficController access to TrafficRepository
    AiModule,
  ],
  controllers: [
    AiUsageAdminController,
    TrafficController,
  ],
  providers: [
    AiUsageService,
    TrafficService,
  ],
})
export class AdminModule {}
