// src/ingestion/ingestion.service.ts
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

function safeErr(e: any): string {
  const msg = e?.message ? String(e.message) : String(e);
  return msg.slice(0, 4000);
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly repo: PgLegalRepository,
    private readonly embeddings: OpenAiEmbeddingsService,
    @Inject(CLEANER) private readonly cleaner: Cleaner,
  ) {}

  // ------------------------------------------------------------
  // MODE A: legacy dir scan (works without registry)
  // ------------------------------------------------------------
  async ingestDir(opts?: {
    dir?: string;
    maxDocs?: number;
    maxCharsPerChunk?: number;
    model?: string;
  }) {
    const dir =
      opts?.dir ?? process.env.LEX_LAWS_PARSED_DIR ?? 'lex_data/laws_parsed';

    const maxDocs = opts?.maxDocs ?? +(process.env.MAX_LAWS_PER_RUN || 1);

    const maxCharsPerChunk =
      opts?.maxCharsPerChunk ?? +(process.env.MAX_CHARS_PER_CHUNK || 2200);

    const model =
      opts?.model ?? process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';

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

      const ok = await this.ingestOneParsedDoc({
        data,
        model,
        maxCharsPerChunk,
        labelIndex: i + 1,
        labelTotal: files.length,
        registryMode: false, // ✅ important
      });

      if (ok) processed++;
    }

    console.log(`\nDone. Newly processed docs: ${processed}`);
  }

  // ------------------------------------------------------------
  // MODE B: registry-driven ingestion (MVP mode)
  // ------------------------------------------------------------
  async ingestFromRegistry(opts?: {
    parsedDir?: string;
    maxDocs?: number;
    maxCharsPerChunk?: number;
    model?: string;
  }) {
    const parsedDir =
      opts?.parsedDir ?? process.env.LEX_LAWS_PARSED_DIR ?? 'lex_data/laws_parsed';

    const maxDocs = opts?.maxDocs ?? +(process.env.MAX_LAWS_PER_RUN || 1);

    const maxCharsPerChunk =
      opts?.maxCharsPerChunk ?? +(process.env.MAX_CHARS_PER_CHUNK || 2200);

    const model =
      opts?.model ?? process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';

    const targets = await this.repo.listRegistryToIngest(maxDocs);

    if (!targets.length) {
      console.log('Registry: nothing to ingest.');
      return;
    }

    let processed = 0;

    for (let i = 0; i < targets.length; i++) {
      const ldocId = (targets[i].ldoc_id ?? '').toString().trim();
      const title = (targets[i].title ?? '').toString().trim();

      const label = `${title || '(no title)'} (${ldocId || 'no-ldoc'})`;
      console.log(`\n=== [${i + 1}/${targets.length}] ${label} ===`);

      if (!ldocId) {
        console.log('  -> missing ldoc_id in registry row, skipping');
        continue;
      }

      const filePath = path.join(parsedDir, `${ldocId}.json`);
      if (!fs.existsSync(filePath)) {
        const err = `parsed json missing: ${filePath}`;
        console.log(`  -> ${err}`);
        await this.repo.markRegistryIngestedError(ldocId, err);
        continue;
      }

      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw) as ParsedLawFile;

        const ok = await this.ingestOneParsedDoc({
          data,
          model,
          maxCharsPerChunk,
          labelIndex: i + 1,
          labelTotal: targets.length,
          registryMode: true, // ✅ important
        });

        if (ok) processed++;
      } catch (e: any) {
        const err = safeErr(e);
        console.log(`  -> ingest error: ${err}`);
        await this.repo.markRegistryIngestedError(ldocId, err);
      }
    }

    console.log(`\nDone. Newly processed docs (registry): ${processed}`);
  }

  // ------------------------------------------------------------
  // Shared single-doc ingestion logic
  // ------------------------------------------------------------
  private async ingestOneParsedDoc(opts: {
    data: ParsedLawFile;
    model: string;
    maxCharsPerChunk: number;
    labelIndex: number;
    labelTotal: number;
    registryMode: boolean;
  }): Promise<boolean> {
    const { data, model, maxCharsPerChunk, registryMode } = opts;

    const ldocId = (data.ldoc_id ?? '').toString().trim();
    const listTitle = (data.list_title ?? data.title ?? data.law_title ?? '')
      .toString()
      .trim();
    const lawTitle = (data.law_title ?? data.title ?? listTitle ?? '')
      .toString()
      .trim();
    const sourceUrl = (data.source_url ?? data.url ?? '').toString().trim();
    const fullTextRaw = (data.text ?? '').toString().trim();

    const label = `${lawTitle || listTitle || '(no title)'} (${ldocId || 'no-ldoc'})`;
    console.log(`\n=== [${opts.labelIndex}/${opts.labelTotal}] ${label} ===`);

    if (!ldocId) {
      console.log('  -> missing ldoc_id, skipping');
      return false;
    }

    if (!fullTextRaw) {
      console.log('  -> empty text, skipping');
      if (registryMode) {
        await this.repo.markRegistryIngestedError(ldocId, 'empty text in parsed json');
      }
      return false;
    }

    const cleaned = this.cleaner.clean({
      source: 'lex.bg',
      title: lawTitle || listTitle,
      rawText: fullTextRaw,
    });

    const contentHash = sha1(cleaned);

    const existing = await this.repo.getLawByLdocId(ldocId);
    if (existing?.content_hash === contentHash && existing?.embedded_at) {
      console.log('  -> unchanged + already embedded, skipping');
      if (registryMode) {
        await this.repo.markRegistryIngestedOk(ldocId, contentHash);
      }
      return false;
    }

    const lawId = await this.repo.upsertLawForIngestion({
      ldocId,
      listTitle: listTitle || lawTitle || '(no title)',
      lawTitle: lawTitle || listTitle || '(no title)',
      sourceUrl: sourceUrl || '',
      contentHash,
    });

    const chunks = makeChunksByParagraphs(cleaned, maxCharsPerChunk);
    console.log(`  -> ${chunks.length} chunks`);

    const out: { index: number; text: string; embedding: number[] }[] = [];
    for (let c = 0; c < chunks.length; c++) {
      const t = chunks[c];
      const emb = await this.embeddings.embedOne(t, model);
      out.push({ index: c, text: t, embedding: emb });

      if ((c + 1) % 25 === 0) {
        console.log(`     embedded ${c + 1}/${chunks.length}`);
      }
    }

    await this.repo.replaceLawChunks(lawId, out);

    if (registryMode) {
      await this.repo.markRegistryIngestedOk(ldocId, contentHash);
    }

    console.log(`  ✅ inserted ${out.length} chunks`);
    return true;
  }
}