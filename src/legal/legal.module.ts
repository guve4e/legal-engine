// src/legal/legal.module.ts
import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LegalSource,
  LegalSourceSchema,
} from './schemas/legal-source.schema';
import {
  LegalPassage,
  LegalPassageSchema,
} from './schemas/legal-passage.schema';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LegalSource.name, schema: LegalSourceSchema },
      { name: LegalPassage.name, schema: LegalPassageSchema },
    ]),
    AiModule,
  ],
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}