import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { Inject, Injectable } from '@nestjs/common';
import { PgLegalRepository } from '../pg/pg-legal.repository';
import { makeChunksByParagraphs } from '../legal/chunking/simple-chunker';
import { OpenAiEmbeddingsService } from './openai-embeddings.service';
import { CLEANER } from './cleaning/cleaning.module';
import type { Cleaner } from './cleaning/cleaner';

type ParsedLawFile = {
  ldoc_id?: string | number;
  list_title?: string;
  law_title?: string;
  title?: string;
  source_url?: string;
  url?: string;
  text?: string;
};

function sha1(s: string) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly repo: PgLegalRepository,
    private readonly embeddings: OpenAiEmbeddingsService,
    @Inject(CLEANER) private readonly cleaner: Cleaner,
  ) {}

  async ingestDir(opts?: {
    dir?: string;
    maxDocs?: number;
    maxCharsPerChunk?: number;
    model?: string;
  }) {
    const dir =
      opts?.dir ??
      process.env.LEX_LAWS_PARSED_DIR ??
      'lex_data/laws_parsed';

    const maxDocs =
      opts?.maxDocs ?? +(process.env.MAX_LAWS_PER_RUN || 1);

    const maxCharsPerChunk =
      opts?.maxCharsPerChunk ??
      +(process.env.MAX_CHARS_PER_CHUNK || 2200);

    const model =
      opts?.model ??
      process.env.EMBEDDING_MODEL ??
      'text-embedding-3-small';

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    let processed = 0;

    for (let i = 0; i < files.length; i++) {
      if (maxDocs && processed >= maxDocs) break;

      const filePath = path.join(dir, files[i]);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as ParsedLawFile;

      const ldocId = (data.ldoc_id ?? '').toString().trim();
      const listTitle = (data.list_title ?? data.title ?? data.law_title ?? '')
        .toString()
        .trim();
      const lawTitle = (data.law_title ?? data.title ?? listTitle ?? '')
        .toString()
        .trim();
      const sourceUrl = (data.source_url ?? data.url ?? '').toString().trim();
      const fullTextRaw = (data.text ?? '').toString().trim();

      const label = `${lawTitle || files[i]} (${ldocId || 'no-ldoc'})`;
      // eslint-disable-next-line no-console
      console.log(`\n=== [${i + 1}/${files.length}] ${label} ===`);

      if (!ldocId) {
        console.log('  -> missing ldoc_id, skipping');
        continue;
      }
      if (!fullTextRaw) {
        console.log('  -> empty text, skipping');
        continue;
      }

      // ✅ use DI cleaner (so CleaningModule is real)
      const cleaned = this.cleaner.clean({
        source: 'lex.bg',
        title: lawTitle || listTitle,
        rawText: fullTextRaw,
      });

      const contentHash = sha1(cleaned);

      // Skip if same content already embedded
      const existing = await this.repo.getLawByLdocId(ldocId);
      if (existing?.content_hash === contentHash && existing?.embedded_at) {
        console.log('  -> unchanged + already embedded, skipping');
        continue;
      }

      // Upsert law row (stores content_hash + scraped_at)
      const lawId = await this.repo.upsertLawForIngestion({
        ldocId,
        listTitle: listTitle || lawTitle || '(no title)',
        lawTitle: lawTitle || listTitle || '(no title)',
        sourceUrl: sourceUrl || '',
        contentHash,
      });

      // Chunk
      const chunks = makeChunksByParagraphs(cleaned, maxCharsPerChunk);
      console.log(`  -> ${chunks.length} chunks`);

      // Embed + collect
      const out: { index: number; text: string; embedding: number[] }[] = [];
      for (let c = 0; c < chunks.length; c++) {
        const t = chunks[c];
        const emb = await this.embeddings.embedOne(t, model);
        out.push({ index: c, text: t, embedding: emb });

        if ((c + 1) % 25 === 0) {
          console.log(`     embedded ${c + 1}/${chunks.length}`);
        }
      }

      // Replace chunks in one transaction
      await this.repo.replaceLawChunks(lawId, out);

      processed++;
      console.log(`  ✅ inserted ${out.length} chunks`);
    }

    console.log(`\nDone. Newly processed docs: ${processed}`);
  }
}