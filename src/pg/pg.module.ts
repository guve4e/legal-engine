// src/pg/pg.module.ts
import { Module } from '@nestjs/common';
import { Pool } from 'pg';

import { PgLegalRepository } from './pg-legal.repository';
import { AiUsageRepository } from './ai-usage.repository';
import { TrafficRepository } from './traffic.repository';

import { LoggingModule } from '../shared/lib/logging/logging.module';
import type { LoggerService } from '../shared/types';

@Module({
  imports: [LoggingModule],
  providers: [
    {
      provide: 'PG_POOL',
      inject: ['LOGGER_SERVICE'],
      useFactory: (logger: LoggerService) => {
        const poolName = process.env.PG_POOL_NAME || process.env.APP_NAME || 'aiad-be';
        const poolId = `${poolName}-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;

        // ✅ explicit config (don’t rely on defaults)
        const pool = new Pool({
          host: process.env.PG_HOST || '192.168.1.60',
          port: +(process.env.PG_PORT || 5433),
          database: process.env.PG_DB || 'bg_legal',
          user: process.env.PG_USER || 'postgres',
          password: process.env.PG_PASS || 'aztewe',

          // explicit pool behavior
          max: +(process.env.PG_POOL_MAX || 10),
          idleTimeoutMillis: +(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
          connectionTimeoutMillis: +(process.env.PG_CONN_TIMEOUT_MS || 5_000),
          // maxUses: +(process.env.PG_MAX_USES || 0), // enable if you want periodic recycle (pg >= 8.11 supports it)
        });

        let connectCount = 0;

        void logger.log(
          `[PG] pool created id="${poolId}" name="${poolName}" pid=${process.pid} max=${(pool as any).options?.max ?? 'n/a'}`,
        );

        pool.on('connect', async (client) => {
          connectCount += 1;
          void logger.log(
            `[PG] connect #${connectCount} id="${poolId}" name="${poolName}" total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`,
          );

          try {
            // session-level settings
            await client.query(`SET statement_timeout = 0`);
            await client.query(`SET ivfflat.probes = 20`);
            void logger.debug?.(`[PG] session init ok id="${poolId}" probes=20`);
          } catch (e: any) {
            void logger.error(
              `[PG] failed session init id="${poolId}": ${e?.message || e}`,
              e?.stack,
            );
          }
        });

        pool.on('acquire', () => {
          void logger.debug?.(
            `[PG] acquire id="${poolId}" total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`,
          );
        });

        pool.on('remove', () => {
          void logger.warn?.(
            `[PG] remove id="${poolId}" total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`,
          );
        });

        pool.on('error', (err: any) => {
          void logger.error(
            `[PG] pool error id="${poolId}": ${err?.message || err}`,
            err?.stack,
          );
        });

        return pool;
      },
    },
    TrafficRepository,
    PgLegalRepository,
    AiUsageRepository,
  ],
  exports: ['PG_POOL', PgLegalRepository, AiUsageRepository, TrafficRepository],
})
export class PgModule {}