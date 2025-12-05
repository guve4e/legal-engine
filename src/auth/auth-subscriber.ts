import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisMessagingStrategy } from '../shared/lib/messaging-service/redis.messaging.strategy';
import { v4 as uuidv4 } from 'uuid';
import { LokiLoggerService } from '../shared/lib/logging/loki-logger.service';

@Injectable()
export class AuthSubscriber implements OnModuleInit {
  private readonly messagingService: RedisMessagingStrategy;
  private readonly logger: LokiLoggerService;

  constructor() {
    this.logger = new LokiLoggerService('gm', 'auth');
    this.messagingService = new RedisMessagingStrategy(this.logger);
  }

  async onModuleInit(): Promise<void> {
    // Subscribe to the 'UserCreated' channel
    this.messagingService.subscribe('UserCreated', async (message: string) => {
      try {
        const userData = JSON.parse(message);

        // Log user creation
        await this.logger.log(
          `Received UserCreated event for userId: ${userData.userId}`,
        );

        // Handle user creation logic
        // Create auth record (example placeholder)
        await this.createAuthRecord(userData.userId);

        // Log success
        await this.logger.log(
          `Auth record created for userId: ${userData.userId}`,
        );
      } catch (error) {
        // Log the error
        await this.logger.error(
          `Error handling UserCreated event: ${error.message}`,
          error.stack,
        );

        // Publish a compensating event
        const correlationId = uuidv4(); // Generate a unique ID for the event
        const errorMessage = {
          correlationId,
          error: error.message,
          userData: message,
        };

        await this.messagingService.publish(
          'UserCreationFailed',
          JSON.stringify(errorMessage),
        );

        await this.logger.warn(
          `Published UserCreationFailed event for userId: ${JSON.parse(message).userId}`,
        );
      }
    });
  }

  private async createAuthRecord(userId: string): Promise<void> {
    // Simulate auth record creation
    // Replace this with your actual logic
    if (!userId) {
      throw new Error('Invalid userId');
    }

    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulated async operation
  }
}
