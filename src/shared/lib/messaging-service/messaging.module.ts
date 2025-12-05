// shared/messaging.module.ts
import { Module } from '@nestjs/common';
import { MessagingService, MessagingTransport } from './messaging.service';
import { RedisMessagingStrategy } from './redis.messaging.strategy';
import { KafkaMessagingStrategy } from './kafka.messaging.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LokiLoggerService } from '../logging/loki-logger.service';
import { LoggerService } from '../../types';



@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'LOGGER_SERVICE',
      useFactory: () => new LokiLoggerService('gm', 'mqtt'),
    },
    {
      provide: 'REDIS_MESSAGING_STRATEGY',
      useFactory: (logger: LoggerService) => new RedisMessagingStrategy(logger),
      inject: ['LOGGER_SERVICE'],
    },
    {
      provide: 'KAFKA_MESSAGING_STRATEGY',
      useFactory: (logger: LoggerService, configService: ConfigService) => {
        const brokers = configService.get<string>('KAFKA_BROKERS', 'localhost:9092')
          .split(',')
          .map(b => b.trim());
        return new KafkaMessagingStrategy(logger, 'sensor-stats', brokers);
      },
      inject: ['LOGGER_SERVICE', ConfigService],
    },
    {
      provide: 'MESSAGING_DEFAULT_TRANSPORT',
      useValue: process.env['MESSAGING_TRANSPORT'] === 'redis'
        ? MessagingTransport.REDIS
        : MessagingTransport.KAFKA,
    },
    {
      provide: 'MESSAGING_SERVICE',
      useFactory: (
        logger: LoggerService,
        kafkaStrategy: KafkaMessagingStrategy,
        redisStrategy: RedisMessagingStrategy,
        defaultTransport: MessagingTransport
      ) =>
        new MessagingService(logger, kafkaStrategy, redisStrategy, defaultTransport),
      inject: [
        'LOGGER_SERVICE',
        'KAFKA_MESSAGING_STRATEGY',
        'REDIS_MESSAGING_STRATEGY',
        'MESSAGING_DEFAULT_TRANSPORT',
      ],
    },
  ],
  exports: ['MESSAGING_SERVICE'],
})
export class MessagingModule {}
