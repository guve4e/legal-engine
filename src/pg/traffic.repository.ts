// src/pg/traffic.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

export interface PageviewInsert {
  visitorId: string;
  path: string;
  referrer?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
}

export interface TrafficDailyStat {
  day: string;           // '2025-11-29'
  pageViews: number;
  uniqueVisitors: number;
}

@Injectable()
export class TrafficRepository {
  constructor(@Inject('PG_POOL') private readonly pool: Pool,) {}

  async insertPageview(input: PageviewInsert): Promise<void> {
    const { visitorId, path, referrer, userAgent, ipHash } = input;
    await this.pool.query(
      `
      INSERT INTO site_pageviews (visitor_id, path, referrer, user_agent, ip_hash)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [visitorId, path, referrer ?? null, userAgent ?? null, ipHash ?? null],
    );
  }

  async getDailyStats(days: number): Promise<TrafficDailyStat[]> {
    const { rows } = await this.pool.query(
      `
      SELECT
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
        COUNT(*)                            AS page_views,
        COUNT(DISTINCT visitor_id)          AS unique_visitors
      FROM site_pageviews
      WHERE created_at >= now() - $1::interval
      GROUP BY date_trunc('day', created_at)
      ORDER BY day DESC
      `,
      [`${days} days`],
    );

    return rows.map((r) => ({
      day: r.day,
      pageViews: Number(r.page_views),
      uniqueVisitors: Number(r.unique_visitors),
    }));
  }
}