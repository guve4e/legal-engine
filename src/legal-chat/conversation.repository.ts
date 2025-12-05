import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';

@Injectable()
export class ConversationRepository {
  constructor(
    @InjectModel(Conversation.name)
    private readonly model: Model<ConversationDocument>,
  ) {}

  create(data: Partial<Conversation>): Promise<ConversationDocument> {
    return this.model.create(data);
  }

  findById(id: string): Promise<ConversationDocument | null> {
    return this.model.findById(id).exec();
  }

  listByUserId(userId: string): Promise<ConversationDocument[]> {
    return this.model.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async updateSummary(id: string, summary: string | null) {
    return this.model
      .findByIdAndUpdate(id, { summary }, { new: true })
      .exec();
  }
}