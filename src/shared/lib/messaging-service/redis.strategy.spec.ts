import Redis from 'ioredis';

import { LoggerService } from '@gm-be/shared/types/types';
import {RedisMessagingStrategy} from "@gm-be/shared/lib/messaging-service/redis.messaging.strategy";

jest.mock('ioredis');

describe('RedisStrategy', () => {
  let redisStrategy: RedisMessagingStrategy;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockRedisInstance: jest.Mocked<Redis>;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    mockRedisInstance = new Redis() as jest.Mocked<Redis>;
    jest.mocked(Redis).mockImplementation(() => mockRedisInstance);

    redisStrategy = new RedisMessagingStrategy(mockLogger);
  });

  it('should publish a message to a Redis channel', async () => {
    await redisStrategy.publish('myChannel', 'Hello, Redis!');
    expect(mockRedisInstance.publish).toHaveBeenCalledWith('myChannel', 'Hello, Redis!');
    expect(mockLogger.log).toHaveBeenCalledWith('Published message to channel "myChannel"');
  });

  it('should subscribe to a Redis channel', () => {
    const callback = jest.fn();
    redisStrategy.subscribe('myChannel', callback);

    expect(mockRedisInstance.subscribe).toHaveBeenCalledWith('myChannel', expect.any(Function));
  });

  // it('should log and invoke callback when a message is received', () => {
  //   const callback = jest.fn();
  //   redisStrategy.subscribe('myChannel', callback);
  //
  //   // Simulate message reception
  //   const messageHandler = jest.mocked(mockRedisInstance.on).mock.calls[0][1];
  //   messageHandler('myChannel', 'Test Message');
  //
  //   expect(mockLogger.log).toHaveBeenCalledWith('Message received on channel "myChannel": Test Message');
  //   //expect(callback).toHaveBeenCalledWith('Test Message');
  // });

  it('should unsubscribe from a Redis channel', async () => {
    await redisStrategy.unsubscribe('myChannel');
    expect(mockRedisInstance.unsubscribe).toHaveBeenCalledWith('myChannel');
    expect(mockLogger.log).toHaveBeenCalledWith('Unsubscribed from channel "myChannel"');
  });
});
