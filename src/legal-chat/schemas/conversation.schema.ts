import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ required: false, type: String })
  userId?: string;

  @Prop({ required: false, type: String })
  title?: string;

  @Prop({ required: false, type: String })
  caseSummary?: string | null;

  @Prop({ required: false, type: String })
  summary?: string | null;   // <-- allow null, matches your `summary: null`

  @Prop({ required: false, type: Date })
  closedAt?: Date | null;

  // add these so TS knows about them (timestamps: true)
  @Prop({ required: false, type: Date })
  createdAt?: Date;

  @Prop({ required: false, type: Date })
  updatedAt?: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);