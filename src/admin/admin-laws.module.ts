// legal/admin-laws.module.ts
import { Module } from '@nestjs/common';
import { AdminLawsController } from './admin-laws.controller';
import { AdminLawsService } from './admin-laws.service';
import { AdminLawsRepository } from './admin-laws.repository';

@Module({
  controllers: [AdminLawsController],
  providers: [AdminLawsService, AdminLawsRepository],
  exports: [AdminLawsService],
})
export class AdminLawsModule {}