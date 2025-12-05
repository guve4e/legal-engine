// src/admin/ai-usage-admin.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { AiUsageService } from '../ai/ai-usage.service';

@Controller('admin/ai-usage')
export class AiUsageAdminController {
  constructor(private readonly aiUsageService: AiUsageService) {}

  @Get('daily')
  async getDailyStats(@Query('days') days?: string) {
    const n = days ? Number(days) : 7;
    return this.aiUsageService.getDailyStats(Number.isFinite(n) ? n : 7);
  }

  @Get('by-kind')
  async getKindStats(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.aiUsageService.getKindStats(fromDate, toDate);
  }

  // NEW: one-shot overview
  @Get('overview')
  async getOverview(
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const n = days ? Number(days) : 7;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    return this.aiUsageService.getOverview(
      Number.isFinite(n) ? n : 7,
      fromDate,
      toDate,
    );
  }
}