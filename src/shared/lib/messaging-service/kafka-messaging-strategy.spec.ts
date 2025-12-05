import { Test, TestingModule } from '@nestjs/testing';
import { Kafka, Producer, Consumer, Admin, ConsumerRunConfig } from 'kafkajs';
import { LoggerService } from '@gm-be/shared/types/types';
import { KafkaMessagingStrategy } from '@gm-be/shared/lib/messaging-service/kafka.messaging.strategy';

jest.mock('kafkajs');

describe('KafkaMessagingStrategy', () => {
  let messagingStrategy: KafkaMessagingStrategy;
  let mockProducer: Producer;
  let mockConsumer: Consumer;
  let mockAdmin: Admin;
  let mockLogger: LoggerService;

  beforeEach(async () => {
    mockProducer = {
      connect: jest.fn(),
      send: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Producer;

    mockConsumer = {
      connect: jest.fn(),
      subscribe: jest.fn(),
      run: jest.fn(),
      stop: jest.fn(),
    } as unknown as Consumer;

    mockAdmin = {
      connect: jest.fn(),
      createTopics: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Admin;

    // ✅ Spy on Kafka methods and return mock instances
    jest.spyOn(Kafka.prototype, 'producer').mockReturnValue(mockProducer);
    jest.spyOn(Kafka.prototype, 'consumer').mockReturnValue(mockConsumer);
    jest.spyOn(Kafka.prototype, 'admin').mockReturnValue(mockAdmin);

    // ✅ Fix `mockLogger.error` being undefined when `catch()` is called
    mockLogger = {
      log: jest.fn().mockResolvedValue(undefined),
      error: jest.fn().mockResolvedValue(undefined), // ✅ Now async-safe
    } as unknown as LoggerService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaMessagingStrategy,
        { provide: 'LOGGER_SERVICE', useValue: mockLogger },
        { provide: 'KAFKA_CLIENT_ID', useValue: 'test-client' },
        { provide: 'KAFKA_BROKERS', useValue: ['localhost:9092'] },
      ],
    }).compile();

    messagingStrategy = module.get<KafkaMessagingStrategy>(KafkaMessagingStrategy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should subscribe to a Kafka topic and process messages', async () => {
    const callback = jest.fn();

    // Mock `consumer.run()` BEFORE calling `subscribe()`
    jest
      .spyOn(mockConsumer, 'run')
      .mockImplementation(async (config?: Partial<ConsumerRunConfig>) => {
        setTimeout(() => {
          config?.eachMessage?.({
            message: { value: Buffer.from('{"data":"test"}') },
          } as any);
        }, 0);
      });

    // Now call subscribe()
    await messagingStrategy.subscribe('test-topic', callback);

    expect(mockConsumer.subscribe).toHaveBeenCalledWith({
      topic: 'test-topic',
      fromBeginning: false,
    });
    expect(mockConsumer.run).toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 100)); // Ensure async execution

    expect(callback).toHaveBeenCalledWith('{"data":"test"}');
  });

  it('should resolve waitForReply when the correct correlationId is received', async () => {
    const testMessage = JSON.stringify({
      correlationId: '1234',
      userSettings: { theme: 'dark' },
    });

    jest
      .spyOn(mockConsumer, 'run')
      .mockImplementation(async (config?: Partial<ConsumerRunConfig>) => {
        setTimeout(() => {
          config?.eachMessage?.({
            message: { value: Buffer.from(testMessage) },
          } as any);
        }, 50);
      });

    const response = await messagingStrategy.waitForReply(
      'reply-topic',
      '1234',
      500
    );
    expect(response).toEqual({ theme: 'dark' });
  });

  it('should reject waitForReply if timeout occurs', async () => {
    await expect(
      messagingStrategy.waitForReply('reply-topic', '1234', 100)
    ).rejects.toThrow('Timeout waiting for reply on topic "reply-topic"');
  });

  it('should handle errors when publishing messages', async () => {
    jest.spyOn(mockProducer, 'send').mockRejectedValue(new Error('Kafka error'));

    await messagingStrategy.publish('test-topic', 'test-message');

    expect(mockLogger.error).toHaveBeenCalledWith('Error publishing to topic "test-topic": Kafka error');
  });
});
