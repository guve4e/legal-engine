// src/ingestion/ingestion.module.ts
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { OpenAiEmbeddingsService } from './openai-embeddings.service';
import { IngestionService } from './ingestion.service';
import { PgModule } from '../pg/pg.module';
import { CleaningModule } from './cleaning/cleaning.module';

@Module({
  imports: [CleaningModule, PgModule, AiModule],
  providers: [IngestionService, OpenAiEmbeddingsService],
  exports: [IngestionService, OpenAiEmbeddingsService],
})
export class IngestionModule {}