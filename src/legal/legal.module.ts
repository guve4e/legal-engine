// src/legal/legal.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';
import { MongooseModule } from '@nestjs/mongoose';
import { EmbeddingsService } from './embeddings.service';
import { ProceduresModule } from '../procedures/procedures.module';
import { LegalSource, LegalSourceSchema } from './schemas/legal-source.schema';
import {
  LegalPassage,
  LegalPassageSchema,
} from './schemas/legal-passage.schema';

import { AiModule } from '../ai/ai.module';
import { PgModule } from '../pg/pg.module';
import { LawSelectorService } from './law-selector.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LegalSource.name, schema: LegalSourceSchema },
      { name: LegalPassage.name, schema: LegalPassageSchema },
    ]),
    AiModule,
    PgModule,
    forwardRef(() => ProceduresModule),
  ],
  controllers: [LegalController],
  providers: [LegalService, EmbeddingsService, LawSelectorService],
  exports: [LegalService, EmbeddingsService, LawSelectorService],
})
export class LegalModule {}
