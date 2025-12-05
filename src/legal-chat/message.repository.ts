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

  async create(data: {
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
  }): Promise<MessageDocument> {
    return this.model.create({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
    });
  }

  findByConversationId(conversationId: string): Promise<MessageDocument[]> {
    return this.model
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .exec();
  }
}