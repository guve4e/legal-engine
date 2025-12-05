import { Module } from '@nestjs/common';
import { LokiLoggerService } from './loki-logger.service';

@Module({
  providers: [
    {
      provide: 'JOB_NAME',
      useValue: process.env.JOB_NAME || 'aiad-be',
    },
    {
      provide: 'APP_NAME',
      useValue: process.env.APP_NAME || 'aiad',
    },
    LokiLoggerService,
    {
      provide: 'LOGGER_SERVICE',
      useExisting: LokiLoggerService,
    },
  ],
  exports: [
    'LOGGER_SERVICE', // main abstraction
    LokiLoggerService, // if you want to inject class directly
    'JOB_NAME',
    'APP_NAME',
  ],
})
export class LoggingModule {}
