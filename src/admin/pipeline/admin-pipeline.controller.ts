// ============================================================================
// FILE: src/admin/pipeline/admin-pipeline.controller.ts
// ============================================================================

import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Param,
} from '@nestjs/common';

import type {
  AdminPipelineStatsDto,
  AdminRegistryQueueDto,
  RegistryQueueFilter,
  RegistryDocType,
  PipelineRegistryState,
  AdminPipelineRegistryListDto,
} from './dto/admin-pipeline.dto';

import { AdminPipelineService } from './admin-pipeline.service';

@Controller('admin/pipeline')
export class AdminPipelineController {
  constructor(private readonly svc: AdminPipelineService) {}

  @Get('stats')
  getStats(): Promise<AdminPipelineStatsDto> {
    return this.svc.getStats();
  }

  /**
   * Old/optional endpoint (queue view). Keep it if you still use it elsewhere.
   */
  @Get('queue')
  getQueue(
    @Query('filter') filter?: RegistryQueueFilter,
    @Query('docType') docType?: RegistryDocType,
    @Query('q') q?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ): Promise<AdminRegistryQueueDto> {
    const page = Math.max(1, Number(pageRaw || 1));
    const pageSize = Math.min(200, Math.max(1, Number(pageSizeRaw || 50)));

    const f: RegistryQueueFilter =
      filter === 'pending-embed' ||
      filter === 'not-scraped' ||
      filter === 'errors' ||
      filter === 'all'
        ? filter
        : 'pending-embed';

    const dt: RegistryDocType | undefined =
      docType === 'LAW' ||
      docType === 'KODEKS' ||
      docType === 'NAREDBA' ||
      docType === 'PRAVILNIK'
        ? docType
        : undefined;

    return this.svc.listQueue({
      filter: f,
      docType: dt,
      q,
      page,
      pageSize,
    });
  }

  /**
   * Main pipeline registry list used by PipelineView.vue
   */
  @Get('registry')
  getRegistry(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('state') state: PipelineRegistryState = 'all',
    @Query('q') q?: string,
    @Query('docType') docType?: string,
  ): Promise<AdminPipelineRegistryListDto> {
    return this.svc.listRegistry({
      page: Number(page || 1),
      pageSize: Number(pageSize || 50),
      state,
      q,
      docType,
    });
  }

  /**
   * Single row requeue (safe: just clears error & marks embedded=false)
   */
  @Post('reembed/:ldocId')
  reembed(@Param('ldocId', ParseIntPipe) ldocId: number) {
    return this.svc.reembed(ldocId);
  }

  /**
   * Bulk requeue next N items for a given state.
   * Example: POST /admin/pipeline/reembed-bulk  { state: "pending", limit: 100 }
   */
  @Post('reembed-bulk')
  reembedBulk(
    @Body()
    body: {
      state?: PipelineRegistryState;
      limit?: number;
      q?: string;
      docType?: string;
    },
  ): Promise<{ ok: true; count: number }> {
    const state: PipelineRegistryState =
      (body?.state as PipelineRegistryState) ?? 'pending';
    const limit = Math.min(1000, Math.max(1, Number(body?.limit ?? 100)));
    const q = body?.q;
    const docType = body?.docType;

    return this.svc.reembedBulk({ state, limit, q, docType });
  }
}