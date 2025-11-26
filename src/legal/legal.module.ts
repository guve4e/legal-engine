import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';
import { MongooseModule } from '@nestjs/mongoose';
import { EmbeddingsService } from './embeddings.service';
import { PgLegalRepository } from '../pg/pg-legal.repository';

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
  providers: [LegalService, EmbeddingsService, PgLegalRepository],
  exports: [LegalService, PgLegalRepository],
})
export class LegalModule {}