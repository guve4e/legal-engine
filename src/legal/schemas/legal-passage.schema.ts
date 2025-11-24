// src/legal/schemas/legal-passage.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LegalSource } from './legal-source.schema';

export type LegalPassageDocument = LegalPassage & Document;

export type LegalContentType =
  | 'law'
  | 'commentary'
  | 'case'
  | 'faq'
  | 'template';

@Schema({ timestamps: true, collection: 'legal_passages' })
export class LegalPassage {
  @Prop({ type: Types.ObjectId, ref: LegalSource.name, required: true })
  sourceId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['law', 'commentary', 'case', 'faq', 'template'],
    default: 'law',
  })
  contentType: LegalContentType;

  @Prop({ default: 'bg' })
  language: string;

  @Prop()
  article?: string;

  @Prop()
  paragraph?: string;

  @Prop()
  point?: string;

  @Prop()
  citation?: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: [String], default: [] })
  domains: string[]; // ["boat", "driver"]

  @Prop({ type: [String], default: [] })
  tags: string[]; // ["documents", "fine"]

  @Prop({ default: 0 })
  chunkIndex: number;

  @Prop({ default: 1 })
  chunkCount: number;

  @Prop()
  embeddingId?: string;

  @Prop({ default: 0.5 })
  importance?: number;
}

export const LegalPassageSchema = SchemaFactory.createForClass(LegalPassage);