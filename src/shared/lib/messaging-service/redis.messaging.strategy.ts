import Redis from 'ioredis';
import type { LoggerService } from '../../types';
import { MessagingStrategy } from './messaging.strategy';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RedisMessagingStrategy implements MessagingStrategy {
  private redis: Redis;
  private redisSubscriber: Redis;

  constructor(
    @Inject('LOGGER_SERVICE') private readonly logger: LoggerService, // Inject the logger
  ) {
    this.redis = new Redis();
    this.redisSubscriber = new Redis();
  }

  async onModuleInit(): Promise<void> {
    await this.initializeLogger();
  }

  private async initializeLogger(): Promise<void> {
    if (!this.logger) {
      console.error('Logger is not initialized.');
      return;
    }

    try {
      await this.logger.log('Redis connections initialized');
      await this.logger.log('Log succeeded');
    } catch (error) {
      // Ensure logger.error itself doesn't throw unhandled errors
      try {
        await this.logger.error('Log failed', error as string);
      } catch (err) {
        console.error('Failed to log error:', err);
      }
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.redis.publish(channel, message);
    } catch (error) {
      this.handleError(`Error publishing to channel "${channel}"`, error);
    }
  }

  subscribe(channel: string, callback: (message: string) => void): void {
    this.redisSubscriber.subscribe(channel, (err) => {
      if (err) {
        this.handleError(`Error subscribing to channel "${channel}"`, err);
        throw err;
      }

      this.logger
        .log(`Subscribed to channel "${channel}"`)
        .catch(console.error);
    });

    this.redisSubscriber.on('message', async (receivedChannel, message) => {
      if (receivedChannel === channel) callback(message);
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    try {
      await this.redisSubscriber.unsubscribe(channel);
      await this.logger.log(`Unsubscribed from channel "${channel}"`);
    } catch (error) {
      this.handleError(`Error unsubscribing from channel "${channel}"`, error);
    }
  }

  private handleError(context: string, error: unknown): void {
    if (error instanceof Error) {
      this.logger
        .error(`${context}: ${error.message}`, error.stack)
        .catch(console.error);
    } else {
      this.logger.error(`${context}: ${String(error)}`).catch(console.error);
    }
  }

  async waitForReply(
    channel: string,
    correlationId: string,
    timeout = 10000,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let isResolved = false;

      this.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message);

          if (parsedMessage.correlationId === correlationId && !isResolved) {
            isResolved = true;

            // ✅ Delay unsubscribe slightly to ensure proper processing
            setTimeout(() => {
              this.unsubscribe(channel).catch((err) => {
                this.logger.error(
                  `Failed to unsubscribe from "${channel}"`,
                  err.stack,
                );
              });
            }, 100);

            // ✅ Return the correct response structure
            if (parsedMessage.error) {
              reject(new Error(parsedMessage.error));
            } else if (parsedMessage.notifications) {
              resolve(parsedMessage.notifications); // ✅ Ensure notifications return correctly
            } else {
              resolve(
                parsedMessage.userSettings ||
                  parsedMessage.data ||
                  parsedMessage,
              ); // ✅ Support other services
            }
          }
        } catch (error) {
          reject(new Error(`Invalid response format on channel "${channel}"`));
        }
      });

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;

          this.unsubscribe(channel).catch((err) => {
            this.logger.error(
              `Failed to unsubscribe from "${channel}" on timeout`,
              err.stack,
            );
          });

          reject(
            new Error(`Timeout waiting for reply on channel "${channel}"`),
          );
        }
      }, timeout);

      this.redisSubscriber.on('unsubscribe', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  /**
   * Retrieve data from Redis cache.
   * @param key - The key to retrieve from the cache.
   */
  async getFromCache(key: string): Promise<any | null> {
    try {
      const cachedValue = await this.redis.get(key);
      return cachedValue ? JSON.parse(cachedValue) : null;
    } catch (error) {
      this.handleError(`Failed to retrieve key "${key}" from Redis`, error);
      return null;
    }
  }

  /**
   * Set data in Redis cache with an optional TTL (time-to-live).
   * @param key - The key to set in the cache.
   * @param value - The value to store in the cache.
   * @param ttl - Time-to-live in seconds.
   */
  async setToCache(key: string, value: any, ttl: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
      await this.logger.log(
        `Set key "${key}" in Redis with TTL: ${ttl} seconds`,
      );
    } catch (error) {
      this.handleError(`Failed to set key "${key}" in Redis`, error);
    }
  }
}
