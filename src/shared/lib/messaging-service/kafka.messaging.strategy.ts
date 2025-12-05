import { Kafka, Producer, Consumer, Admin } from 'kafkajs';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { LoggerService } from '../../types';
import { MessagingStrategy } from './messaging.strategy';

@Injectable()
export class KafkaMessagingStrategy implements MessagingStrategy, OnModuleInit {

  // Track producer connection state
  private isProducerConnected = false;
  private kafka: Kafka;
  private readonly producer: Producer;
  private consumer: Consumer;
  private admin: Admin;
  private isConsumerRunning = false;
  private topicSubscriptions = new Map<string, (message: string) => void>();

  constructor(
    @Inject('LOGGER_SERVICE') private readonly logger: LoggerService,
    @Inject('KAFKA_CLIENT_ID') private readonly clientId: string,
    @Inject('KAFKA_BROKERS') private readonly brokers: string[]
  ) {
    this.kafka = new Kafka({ clientId: this.clientId, brokers: this.brokers });
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: `${this.clientId}-group` });
    this.admin = this.kafka.admin();
  }

  async onModuleInit() {
    await this.connectKafka();
  }

  /** Connect Kafka Producer & Consumer Once */
  private async connectKafka() {
    try {
      await Promise.all([this.producer.connect(), this.consumer.connect()]);
    } catch (error) {
      this.handleError('Error connecting Kafka components', error);
    }
  }

  /** Ensure Kafka Topic Exists Before Publishing */
  private async ensureTopicExists(topic: string): Promise<void> {
    try {
      await this.admin.connect();
      const existingTopics = await this.admin.listTopics();
      if (!existingTopics.includes(topic)) {
        await this.admin.createTopics({
          topics: [{ topic, numPartitions: 1 }],
        });
        await this.logger.log(`✅ Created Kafka topic: ${topic}`);
      }
    } catch (error) {
      this.handleError(`Error ensuring topic exists: ${topic}`, error);
    } finally {
      await this.admin.disconnect();
    }
  }

  /** Publish a Message to Kafka */
  async publish(topic: string, message: string): Promise<void> {
    try {
      if (!this.producer) throw new Error("Kafka producer is not initialized");

      // Ensure producer is connected before sending
      if (!this.isProducerConnected) {
        console.warn("⚠️ Producer is not connected. Reconnecting...");
        await this.connectProducer();
      }

      await this.ensureTopicExists(topic);
      await this.producer.send({ topic, messages: [{ value: message }] });
    } catch (error) {
      this.handleError(`Error publishing to topic "${topic}"`, error);
    }
  }

  /** Subscribe to Kafka Topic */
  async subscribe(topic: string, callback: (message: string) => void): Promise<void> {
    if (this.topicSubscriptions.has(topic)) return;

    this.topicSubscriptions.set(topic, callback);

    try {
      await this.consumer.subscribe({ topic, fromBeginning: false });
      await this.logger.log(`📡 Subscribed to Kafka topic: ${topic}`);
    } catch (error) {
      this.handleError(`Error subscribing to topic "${topic}"`, error);
      return;
    }

    if (!this.isConsumerRunning) {
      this.isConsumerRunning = true;

      await this.consumer.run({
        eachMessage: async ({ topic, message }) => {
          const payload = message.value?.toString() || '';
          const handler = this.topicSubscriptions.get(topic);
          if (handler) handler(payload);
        },
      });

      await this.logger.log(`🚀 Kafka consumer started and running`);
    }
  }

  // (runConsumerOnce is no longer needed, handled in subscribe)

  /** Unsubscribe from a Kafka Topic */
  async unsubscribe(topic: string): Promise<void> {
    if (!this.topicSubscriptions.has(topic)) return;

    this.topicSubscriptions.delete(topic);
    await this.logger.log(`✅ Unsubscribed from Kafka topic: ${topic}`);
  }

  /** Wait for a Reply on a Kafka Topic */
  async waitForReply(
    replyTopic: string,
    correlationId: string,
    timeout = 10000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let isResolved = false;

      this.subscribe(replyTopic, (message) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.correlationId === correlationId && !isResolved) {
          isResolved = true;
          this.unsubscribe(replyTopic).catch(() => {});
          parsedMessage.error
            ? reject(new Error(parsedMessage.error))
            : resolve(parsedMessage);
        }
      });

      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.unsubscribe(replyTopic).catch(() => {});
          reject(
            new Error(`Timeout waiting for reply on topic "${replyTopic}"`)
          );
        }
      }, timeout);
    });
  }

  /** Centralized Error Handling */
  private handleError(context: string, error: unknown): void {
    this.logger
      .error(
        `${context}: ${error instanceof Error ? error.message : String(error)}`
      )
      .catch(() => {});
  }

  // Separate method to connect the producer
  private async connectProducer() {
    try {
      await this.producer.connect();
      this.isProducerConnected = true;
      console.log("✅ Kafka Producer connected successfully");
    } catch (error) {
      console.error("❌ Failed to connect Kafka Producer", error);
      this.isProducerConnected = false;
    }
  }
}
