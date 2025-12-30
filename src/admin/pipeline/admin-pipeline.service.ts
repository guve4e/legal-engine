// ============================================================================
// FILE: src/admin/pipeline/admin-pipeline.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import {
  AdminPipelineStatsDto,
  AdminRegistryQueueDto,
  RegistryQueueFilter,
  RegistryDocType,
  PipelineRegistryState,
  AdminPipelineRegistryListDto,
} from './dto/admin-pipeline.dto';
import { AdminPipelineRepository } from './admin-pipeline.repository';

@Injectable()
export class AdminPipelineService {
  constructor(private readonly repo: AdminPipelineRepository) {}

  getStats(): Promise<AdminPipelineStatsDto> {
    return this.repo.getStats();
  }

  listQueue(input: {
    filter: RegistryQueueFilter;
    docType?: RegistryDocType;
    q?: string;
    page: number;
    pageSize: number;
  }): Promise<AdminRegistryQueueDto> {
    return this.repo.listRegistryQueue(input);
  }

  listRegistry(input: {
    page: number;
    pageSize: number;
    state?: PipelineRegistryState;
    q?: string;
    docType?: string;
  }): Promise<AdminPipelineRegistryListDto> {
    return this.repo.listRegistry(input);
  }

  async reembed(ldocId: number): Promise<{ ok: true }> {
    await this.repo.markForReembed(ldocId);
    return { ok: true };
  }

  async reembedBulk(input: {
    state: PipelineRegistryState;
    limit: number;
    q?: string;
    docType?: string;
  }): Promise<{ ok: true; count: number }> {
    const count = await this.repo.markForReembedBulk(input);
    return { ok: true, count };
  }
}