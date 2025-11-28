// src/legal/legal.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
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
import {
  AiService,
  AiContextItem,
  LegalQuestionAnalysis,
} from '../ai/ai.service';
import { Pool } from 'pg';
import { EmbeddingsService } from './embeddings.service';
import {
  PgLegalRepository,
  LawRow,
  LawChunkRow,
} from '../pg/pg-legal.repository';

/**
 * Tier – matches AIAdvocate plans:
 * - free  – strong, but shallow
 * - plus  – deeper, multi-law reasoning
 * - pro   – max depth, for professionals
 */
export type Tier = 'free' | 'plus' | 'pro';

interface TierConfig {
  maxLaws: number;
  perLawLimit: number;
  globalFallbackLimit: number;
}

const TIER_CONFIG: Record<Tier, TierConfig> = {
  free: {
    maxLaws: 3,
    perLawLimit: 3,
    globalFallbackLimit: 5,
  },
  plus: {
    maxLaws: 5,
    perLawLimit: 5,
    globalFallbackLimit: 12,
  },
  pro: {
    maxLaws: 8,
    perLawLimit: 8,
    globalFallbackLimit: 25,
  },
};

@Injectable()
export class LegalService {
  private readonly logger = new Logger(LegalService.name);

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

  private getTierConfig(tier?: Tier): TierConfig {
    return TIER_CONFIG[tier ?? 'free'];
  }

  // ---------------------------------------------------------------------------
  // Basic health / legacy Mongo search
  // ---------------------------------------------------------------------------

  ping() {
    return 'Legal service with Mongo is responsive';
  }

  async searchPassages(query: string, domain?: string) {
    const filter: any = {};

    if (domain) {
      filter.domains = domain;
    }

    if (query && query.trim().length > 0) {
      const regex = new RegExp(query.trim(), 'i');
      filter.$or = [{ text: regex }, { tags: regex }, { citation: regex }];
    }

    return this.legalPassageModel.find(filter).limit(20).lean();
  }

  /**
   * Legacy Mongo-based chat (kept for experiments / backup).
   */
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
    let passages = await this.searchPassages(question, domain);

    if ((!passages || passages.length === 0) && domain) {
      passages = await this.legalPassageModel
        .find({ domains: domain })
        .sort({ importance: -1, createdAt: 1 })
        .limit(limit)
        .lean();
    }

    return passages.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Postgres / pgvector health & basic stats
  // ---------------------------------------------------------------------------

  async pgHealth() {
    const res = await this.pgPool.query(
      'SELECT COUNT(*)::int AS count FROM laws;',
    );
    return {
      message: 'Postgres legal DB is reachable',
      laws: res.rows[0].count,
    };
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

  // ---------------------------------------------------------------------------
  // 💡 Main AIAdvocate pipeline (Postgres + pgvector)
  // ---------------------------------------------------------------------------

  /**
   * Main entry point for AIAdvocate legal reasoning using Postgres + pgvector.
   *
   * Pipeline:
   * 1) AI-based question analysis (domains + lawHints)
   * 2) Law selection (tier-aware)
   * 3) Tiered vector search per law
   * 4) Optional global fallback
   * 5) Context construction
   * 6) LLM answer
   */
  async chatWithPg(
    question: string,
    options?: { tier?: Tier; domainHint?: string },
  ) {
    const tier = options?.tier ?? 'free';
    const tierConfig = this.getTierConfig(tier);

    // 1) AI analysis
    const aiAnalysis = await this.aiService.analyzeLegalQuestion(question);
    const mergedAnalysis = this.mergeAnalysisWithHint(
      aiAnalysis,
      options?.domainHint,
    );

    // 2) Law selection
    const allLaws = await this.pgLegalRepo.listLaws();
    const candidateLaws = this.selectCandidateLaws(
      allLaws,
      mergedAnalysis,
      tierConfig,
    );

    // 3) Tiered vector search
    const chunks = await this.searchChunksTiered(
      question,
      candidateLaws,
      tierConfig,
    );

    // 4) Build context for LLM
    const contextItems = this.buildAiContextItems(chunks);

    // 5) Get final answer
    const aiAnswer = await this.aiService.generateAnswer(
      question,
      contextItems,
    );

    return {
      question,
      tier,
      detectedDomains: mergedAnalysis.domains,
      lawHints: mergedAnalysis.lawHints,
      candidateLawIds: candidateLaws.map((l) => l.id),
      tierConfig,
      contextCount: chunks.length,
      context: chunks,
      answer: aiAnswer,
    };
  }

  // ---------------------------------------------------------------------------
  // 🔍 Merge AI analysis with optional UI domain hint
  // ---------------------------------------------------------------------------

  private mergeAnalysisWithHint(
    aiAnalysis: LegalQuestionAnalysis,
    domainHint?: string,
  ): LegalQuestionAnalysis {
    const domains = new Set<string>(
      Array.isArray(aiAnalysis.domains) ? aiAnalysis.domains : [],
    );
    const lawHints = Array.isArray(aiAnalysis.lawHints)
      ? aiAnalysis.lawHints
      : [];

    if (domainHint) {
      domains.add(domainHint);
    }

    return {
      domains: Array.from(domains),
      lawHints,
    };
  }

  // ---------------------------------------------------------------------------
  // 📚 Law selection based on AI lawHints + light boosting
  // ---------------------------------------------------------------------------

  /**
   * Choose a small set of candidate laws based on:
   * - AI-proposed law names (lawHints)
   * - light boosts for always-relevant laws (e.g. ZANN, APK, Constitution)
   *
   * NOTE: We only use LawRow fields that actually exist in the DB:
   *   id, ldoc_id, law_title, list_title, source_url
   */
  private selectCandidateLaws(
    allLaws: LawRow[],
    analysis: LegalQuestionAnalysis,
    tierConfig: TierConfig,
  ): LawRow[] {
    const { lawHints = [] } = analysis;
    const maxLaws = tierConfig.maxLaws;

    const normalizedHints = lawHints.map((h) => h.toLowerCase());

    const scored = allLaws.map((law) => {
      const title = `${law.law_title} ${law.list_title}`.toLowerCase();
      let score = 0;

      // 1) Direct text match with lawHints (main signal)
      for (const hint of normalizedHints) {
        if (!hint) continue;
        if (title.includes(hint)) {
          score += 80; // strong match
        }
      }

      // 2) Light boost for always-relevant laws
      if (title.includes('конституция на република българия')) {
        score += 5;
      }
      if (title.includes('административните нарушения и наказания')) {
        score += 5; // ЗАНН
      }
      if (title.includes('административнопроцесуален кодекс')) {
        score += 5; // АПК
      }

      return { law, score };
    });

    // Keep only positive score
    const positive = scored.filter((s) => s.score > 0);

    // Sort by score desc, then by id asc as a stable tiebreaker
    positive.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.law.id - b.law.id;
    });

    let selected: LawRow[];

    if (positive.length > 0) {
      selected = positive.slice(0, maxLaws).map((s) => s.law);
    } else {
      // Fallback: if no matches at all (rare),
      // just take the first N laws by id so the system still works.
      selected = [...allLaws]
        .sort((a, b) => a.id - b.id)
        .slice(0, maxLaws);
    }

    return selected;
  }

  // ---------------------------------------------------------------------------
  // 🔎 Tiered vector search over chunks
  // ---------------------------------------------------------------------------

  private async searchChunksTiered(
    question: string,
    candidateLaws: LawRow[],
    cfg: TierConfig,
  ): Promise<LawChunkRow[]> {
    // 1) Rewrite question into better search query
    const rewritten = await this.aiService.rewriteLegalSearchQuery(question);

    // 2) Embed
    const embedding = await this.embeddingsService.embed(rewritten);

    const results: LawChunkRow[] = [];

    // 3) Per-law vector search
    for (const law of candidateLaws) {
      const subset = (await this.pgLegalRepo.findChunksByEmbedding(
        embedding,
        cfg.perLawLimit,
        law.id,
      )) as LawChunkRow[];

      results.push(...subset);
    }

    // 4) Global fallback if too few results
    if (results.length < 3 && cfg.globalFallbackLimit > 0) {
      const global = (await this.pgLegalRepo.findChunksByEmbedding(
        embedding,
        cfg.globalFallbackLimit,
        undefined,
      )) as LawChunkRow[];
      results.push(...global);
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // 🧱 Context construction for LLM
  // ---------------------------------------------------------------------------

  private buildAiContextItems(chunks: LawChunkRow[]): AiContextItem[] {
    return chunks.map((c) => ({
      citation: `${c.law_title} – ${c.list_title} (ldoc: ${c.law_id}, chunk ${c.chunk_index})`,
      text: c.chunk_text,
    }));
  }
}