// src/legal/legal.module.ts
import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';
import { MongooseModule } from '@nestjs/mongoose';
import { EmbeddingsService } from './embeddings.service';

import {
  LegalSource,
  LegalSourceSchema,
} from './schemas/legal-source.schema';
import {
  LegalPassage,
  LegalPassageSchema,
} from './schemas/legal-passage.schema';

import { AiModule } from '../ai/ai.module';
import { PgModule } from '../pg/pg.module'; // 👈 import pg module

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LegalSource.name, schema: LegalSourceSchema },
      { name: LegalPassage.name, schema: LegalPassageSchema },
    ]),
    AiModule,
    PgModule, // 👈 this brings PgLegalRepository + PG_POOL into LegalModule
  ],
  controllers: [LegalController],
  providers: [
    LegalService,
    EmbeddingsService,
  ],
  exports: [
    LegalService,
    EmbeddingsService, // for LegalChatModule
    // ❌ no need to export PgLegalRepository here; PgModule already does
  ],
})
export class LegalModule {}