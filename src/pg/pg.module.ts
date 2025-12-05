// src/pg/pg.module.ts
import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { PgLegalRepository } from './pg-legal.repository';
import { AiUsageRepository } from './ai-usage.repository';
import { TrafficRepository } from './traffic.repository';

@Module({
  imports: [],
  providers: [
    {
      provide: 'PG_POOL',
      useFactory: () => {
        return new Pool({
          host: process.env.PG_HOST || '192.168.1.60',
          port: +(process.env.PG_PORT || 5433),
          database: process.env.PG_DB || 'bg_legal',
          user: process.env.PG_USER || 'postgres',
          password: process.env.PG_PASS || 'aztewe',
        });
      },
    },
    TrafficRepository,
    PgLegalRepository,
    AiUsageRepository,
  ],
  exports: [
    'PG_POOL',
    PgLegalRepository,
    AiUsageRepository,
    TrafficRepository,
  ],
})
export class PgModule {}