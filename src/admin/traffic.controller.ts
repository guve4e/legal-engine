// src/traffic/traffic.controller.ts
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { TrafficService } from './traffic.service';
import { TrafficRepository } from '../pg/traffic.repository';
import type { Request } from 'express';

class PageviewDto {
  visitorId!: string;
  path!: string;
  referrer?: string | null;
  userAgent?: string | null;
}

@Controller()
export class TrafficController {
  constructor(
    private readonly trafficService: TrafficService,
    private readonly trafficRepo: TrafficRepository,
  ) {}

  @Post('analytics/pageview')
  async recordPageview(@Body() body: PageviewDto, @Req() req: Request) {
    await this.trafficService.recordPageview({
      visitorId: body.visitorId,
      path: body.path,
      referrer: body.referrer ?? null,
      userAgent: body.userAgent ?? req.headers['user-agent']?.toString(),
      ip: (req.headers['x-forwarded-for'] as string) ?? req.ip,
    });

    return { ok: true };
  }

  // admin view, similar style to AI usage
  @Get('admin/traffic/daily')
  async getDailyTraffic(@Query('days') days?: string) {
    const n = days ? Number(days) : 7;
    return this.trafficRepo.getDailyStats(Number.isFinite(n) ? n : 7);
  }
}