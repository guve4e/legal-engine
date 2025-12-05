import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true })
  conversationId: string;

  @Prop({
    required: true,
    enum: ['user', 'assistant', 'system'],
  })
  role: 'user' | 'assistant' | 'system';

  @Prop({
    required: true,
    trim: true,
    default: '', // <- important: prevents validation crash if someone forgets it
  })
  content: string;
}

export const MessageSchema = SchemaFactory.createForClass(Message);