import { randomBytes } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { MessagingStrategy } from './messaging.strategy';
import type { LoggerService } from '../../types';


/**
 * Enum for available messaging transports.
 */
export enum MessagingTransport {
  KAFKA = 'kafka',
  REDIS = 'redis',
}

/**
 * Utility class for generating unique correlation IDs.
 */
export class CorrelationIdUtil {
  static generate(): string {
    return randomBytes(16).toString('hex');
  }
}

@Injectable()
export class MessagingService {
  constructor(
    @Inject('LOGGER_SERVICE') private readonly logger: LoggerService,
    @Inject('KAFKA_MESSAGING_STRATEGY') private readonly kafkaStrategy: MessagingStrategy,
    @Inject('REDIS_MESSAGING_STRATEGY') private readonly redisStrategy: MessagingStrategy,
    @Inject('MESSAGING_DEFAULT_TRANSPORT') private readonly defaultTransport: MessagingTransport // Injected default transport
  ) {}

  /**
   * Publishes an event to the selected messaging transport.
   */
  async publishEvent(
    topic: string,
    message: any,
    transport?: MessagingTransport // Allow per-message override
  ) {
    const chosenTransport = transport || this.defaultTransport;

    try {
      const payload = JSON.stringify(message);

      if (chosenTransport === MessagingTransport.KAFKA) {
        await this.kafkaStrategy.publish(topic, payload);
        await this.logger.log(`📡 Published event to Kafka: ${topic}`);
      } else {
        await this.redisStrategy.publish(topic, payload);
        await this.logger.log(`📡 Published event to Redis: ${topic}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logger.error(
        `❌ Failed to publish event to ${chosenTransport.toUpperCase()} (${topic}): ${errorMessage}`
      );
    }
  }

  /**
   * Handles request-response messaging via Redis.
   */
  async requestResponse(
    channel: string,
    payload: any,
    timeout = 5000
  ): Promise<any> {
    const correlationId = CorrelationIdUtil.generate();
    const requestMessage = JSON.stringify({ ...payload, correlationId });

    const replyChannel = `${channel}-response:${correlationId}`;

    try {
      await this.logger.debug(
        `📡 Sending request on ${channel} (correlationId: ${correlationId})`
      );
      await this.redisStrategy.publish(channel, requestMessage);

      const response = await this.redisStrategy.waitForReply(
        replyChannel,
        correlationId,
        timeout
      );

      await this.logger.debug(
        `✅ Received response for ${channel} (correlationId: ${correlationId})`
      );
      return response;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logger.error(
        `❌ Request timeout on ${channel} (correlationId: ${correlationId}): ${errorMessage}`
      );
      throw new Error(`Request timeout: No response from Redis`);
    }
  }

  /**
   * Subscribe to messages from Kafka or Redis.
   */
  async subscribe(
    topic: string,
    callback: (message: string) => void,
    transport?: MessagingTransport // Allow override
  ) {
    const chosenTransport = transport || this.defaultTransport;

    try {
      if (chosenTransport === MessagingTransport.KAFKA) {
        await this.kafkaStrategy.subscribe(topic, callback);
        await this.logger.log(`📡 Subscribed to Kafka topic: ${topic}`);
      } else {
        await this.redisStrategy.subscribe(topic, callback);
        await this.logger.log(`📡 Subscribed to Redis topic: ${topic}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logger.error(
        `❌ Failed to subscribe to ${chosenTransport.toUpperCase()} (${topic}): ${errorMessage}`
      );
    }
  }

  /**
   * Unsubscribes from a topic in Kafka or Redis.
   */
  async unsubscribe(topic: string, transport?: MessagingTransport): Promise<void> {
    const chosenTransport = transport || this.defaultTransport;

    try {
      if (chosenTransport === MessagingTransport.KAFKA) {
        await this.kafkaStrategy.unsubscribe(topic);
        await this.logger.log(`📢 Unsubscribed from Kafka topic: ${topic}`);
      } else {
        await this.redisStrategy.unsubscribe(topic);
        await this.logger.log(`📢 Unsubscribed from Redis channel: ${topic}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logger.error(`❌ Failed to unsubscribe from ${chosenTransport.toUpperCase()} (${topic}): ${errorMessage}`);
    }
  }

  get redisCache() {
    return this.redisStrategy;
  }
}
