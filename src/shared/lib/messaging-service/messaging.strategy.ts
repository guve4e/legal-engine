export interface MessagingStrategy {
  /**
   * Publish a message to a specific channel.
   * @param channel - The channel to publish the message to.
   * @param message - The message to be published.
   * @returns A Promise that resolves when the message is published.
   */
  publish(channel: string, message: string): Promise<void>;

  /**
   * Subscribe to a specific channel and provide a callback for received messages.
   * @param channel - The channel to subscribe to.
   * @param callback - The callback to invoke when a message is received.
   */
  subscribe(channel: string, callback: (message: string) => void): void;

  /**
   * Unsubscribe from a specific channel.
   * @param channel - The channel to unsubscribe from.
   * @returns A Promise that resolves when the channel is unsubscribed.
   */
  unsubscribe(channel: string): Promise<void>;

  /**
   * Wait for a reply on a specific channel within a specified timeout.
   * @param replyChannel - The channel to listen for a reply.
   * @param correlationId
   * @param timeout - The time (in milliseconds) to wait for a reply (default is 10000ms).
   * @returns A Promise that resolves with the received message or rejects if the timeout expires.
   */
  waitForReply(replyChannel: string, correlationId: string, timeout: number): Promise<any>;
}
