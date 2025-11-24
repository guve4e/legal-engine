// src/legal/schemas/legal-source.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LegalSourceDocument = LegalSource & Document;

@Schema({ timestamps: true, collection: 'legal_sources' })
export class LegalSource {
  @Prop({ required: true, unique: true })
  code: string; // e.g. "KTK"

  @Prop({ required: true })
  titleBg: string;

  @Prop()
  titleEn?: string;

  @Prop({ default: 'BG' })
  jurisdiction: string;

  @Prop()
  sourceUrl?: string;

  @Prop({ type: [String], default: [] })
  domains: string[];

  // 👇 IMPORTANT: explicitly declare type: Date
  @Prop({ type: Date })
  effectiveFrom?: Date;

  // 👇 IMPORTANT: explicitly declare type: Date and allow null with default
  @Prop({ type: Date, default: null })
  effectiveTo?: Date | null;

  @Prop()
  notes?: string;
}

export const LegalSourceSchema = SchemaFactory.createForClass(LegalSource);