import { Module } from '@nestjs/common';
import { CleaningModule } from './cleaning/cleaning.module';
import { IngestionService } from './ingestion.service';
import { OpenAiEmbeddingsService } from './openai-embeddings.service';
import { PgModule } from '../pg/pg.module';

@Module({
  imports: [CleaningModule, PgModule],
  providers: [IngestionService, OpenAiEmbeddingsService],
  exports: [IngestionService],
})
export class IngestionModule {}