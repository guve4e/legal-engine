import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'PG_POOL',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Pool({
          host: config.get<string>('PGHOST', 'localhost'),
          port: parseInt(config.get<string>('PGPORT', '5432'), 10),
          database: config.get<string>('PGDATABASE', 'bg_legal'),
          user: config.get<string>('PGUSER'),
          password: config.get<string>('PGPASSWORD'),
          ssl: config.get<string>('PGSSL', 'false') === 'true'
            ? { rejectUnauthorized: false }
            : undefined,
        });
      },
    },
  ],
  exports: ['PG_POOL'],
})
export class DatabaseModule {}