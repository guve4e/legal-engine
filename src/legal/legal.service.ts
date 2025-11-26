// src/legal/legal.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LegalSource,
  LegalSourceDocument,
} from './schemas/legal-source.schema';
import {
  LegalPassage,
  LegalPassageDocument,
} from './schemas/legal-passage.schema';
import { AiService } from '../ai/ai.service';
import { Pool } from 'pg';
import { EmbeddingsService } from './embeddings.service';
import { PgLegalRepository } from '../pg/pg-legal.repository';

interface LawChunkRow {
  id: number;
  law_id: number;
  chunk_index: number;
  chunk_text: string;
  law_title: string;
  list_title: string;
  source_url: string;
}

@Injectable()
export class LegalService {
  constructor(
    @InjectModel(LegalSource.name)
    private readonly legalSourceModel: Model<LegalSourceDocument>,

    @InjectModel(LegalPassage.name)
    private readonly legalPassageModel: Model<LegalPassageDocument>,

    private readonly aiService: AiService,

    @Inject('PG_POOL')
    private readonly pgPool: Pool,

    private readonly embeddingsService: EmbeddingsService,

    private readonly pgLegalRepo: PgLegalRepository,
  ) {}

  ping() {
    return 'Legal service with Mongo is responsive';
  }

  async searchPassages(query: string, domain?: string) {
    const filter: any = {};

    if (domain) {
      filter.domains = domain;
    }

    if (query && query.trim().length > 0) {
      // simple regex search on text + tags for now
      const regex = new RegExp(query.trim(), 'i');
      filter.$or = [{ text: regex }, { tags: regex }, { citation: regex }];
    }

    return this.legalPassageModel.find(filter).limit(20).lean();
  }

  async chat(question: string, domain?: string, limit = 5) {
    const passages = await this.getPassagesForChat(question, domain, limit);

    const aiAnswer = await this.aiService.generateAnswer(
      question,
      passages.map((p) => ({
        citation: p.citation,
        text: p.text,
      })),
    );

    return {
      question,
      domain: domain ?? null,
      contextCount: passages.length,
      context: passages.map((p) => ({
        citation: p.citation,
        article: p.article,
        paragraph: p.paragraph,
        text: p.text,
        tags: p.tags,
        domains: p.domains,
        id: p._id,
      })),
      answer: aiAnswer,
    };
  }

  async getPassagesForChat(
    question: string,
    domain?: string,
    limit = 5,
  ) {
    // 1) try search by question text + domain
    let passages = await this.searchPassages(question, domain);

    // 2) if nothing found and domain is given → fallback to domain only
    if ((!passages || passages.length === 0) && domain) {
      passages = await this.legalPassageModel
        .find({ domains: domain })
        .sort({ importance: -1, createdAt: 1 })
        .limit(limit)
        .lean();
    }

    // 3) if still nothing, just return empty array
    return passages.slice(0, limit);
  }

  async pgHealth() {
    const res = await this.pgPool.query(
      'SELECT COUNT(*)::int AS count FROM laws;',
    );
    return {
      message: 'Postgres legal DB is reachable',
      laws: res.rows[0].count,
    };
  }

  /**
   * INTERNAL: run vector search over Postgres chunks.
   * Now uses AI to rewrite the user question into a better search query
   * before creating the embedding.
   */
  private async searchLawChunksByQuestion(
    question: string,
    limit = 10,
    lawId?: number,
  ): Promise<LawChunkRow[]> {
    // 🔎 Step 1: rewrite the question into a legal search query
    const rewritten = await this.aiService.rewriteLegalSearchQuery(question);

    // 🧬 Step 2: embed the rewritten query (fallback is the original)
    const embedding = await this.embeddingsService.embed(rewritten);

    // 🔍 Step 3: vector search in Postgres
    return this.pgLegalRepo.findChunksByEmbedding(embedding, limit, lawId);
  }

  async pgStats() {
    const stats = await this.pgLegalRepo.getStats();
    return {
      message: 'Postgres legal DB is reachable',
      ...stats,
    };
  }

  async listPgLaws() {
    return this.pgLegalRepo.listLaws();
  }

  async chatWithPg(question: string, limit = 5, lawId?: number) {
    const chunks = await this.searchLawChunksByQuestion(
      question,
      limit,
      lawId,
    );

    const aiAnswer = await this.aiService.generateAnswer(
      question,
      chunks.map((c) => ({
        citation: `${c.law_title} (ldoc: ${c.law_id}, chunk ${c.chunk_index})`,
        text: c.chunk_text,
      })),
    );

    return {
      question,
      contextCount: chunks.length,
      context: chunks,
      answer: aiAnswer,
    };
  }
}