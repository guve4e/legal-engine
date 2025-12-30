// ============================================================================
// FILE: src/admin/pipeline/admin-pipeline.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { AdminPipelineController } from './admin-pipeline.controller';
import { AdminPipelineRepository } from './admin-pipeline.repository';
import { AdminPipelineService } from './admin-pipeline.service';

@Module({
  controllers: [AdminPipelineController],
  providers: [AdminPipelineRepository, AdminPipelineService],
  exports: [AdminPipelineService],
})
export class AdminPipelineModule {}
