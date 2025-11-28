import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class MessageRepository {
  constructor(
    @InjectModel(Message.name)
    private readonly model: Model<MessageDocument>,
  ) {}

  create(data: Partial<Message>): Promise<MessageDocument> {
    return this.model.create(data);
  }

  findByConversationId(conversationId: string): Promise<MessageDocument[]> {
    return this.model
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .exec();
  }
}