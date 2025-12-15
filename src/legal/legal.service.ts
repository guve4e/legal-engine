// src/legal/legal.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Pool } from 'pg';

import {
  LegalSource,
  LegalSourceDocument,
} from './schemas/legal-source.schema';
import {
  LegalPassage,
  LegalPassageDocument,
} from './schemas/legal-passage.schema';

import { AiService } from '../ai/ai.service';

import { EmbeddingsService } from './embeddings.service';
import {
  PgLegalRepository,
  LawRow,
  LawChunkRow,
} from '../pg/pg-legal.repository';

import { LawSelectorService } from './law-selector.service';
import { AiContextItem, ChatTurn, LegalQuestionAnalysis } from '../ai/ai.types';

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
  free: { maxLaws: 3, perLawLimit: 3, globalFallbackLimit: 5 },
  plus: { maxLaws: 5, perLawLimit: 5, globalFallbackLimit: 12 },
  pro: { maxLaws: 8, perLawLimit: 8, globalFallbackLimit: 25 },
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

    private readonly lawSelector: LawSelectorService,
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

    if (domain) filter.domains = domain;

    if (query && query.trim().length > 0) {
      const regex = new RegExp(query.trim(), 'i');
      filter.$or = [{ text: regex }, { tags: regex }, { citation: regex }];
    }

    return this.legalPassageModel.find(filter).limit(20).lean();
  }

  async chat(
    question: string,
    domain?: string,
    limit = 5,
    history?: ChatTurn[],
  ) {
    const passages = await this.getPassagesForChat(question, domain, limit);

    const aiAnswer = await this.aiService.generateAnswer(
      question,
      passages.map((p) => ({ citation: p.citation, text: p.text })),
      { history },
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

  async getPassagesForChat(question: string, domain?: string, limit = 5) {
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
    return { message: 'Postgres legal DB is reachable', ...stats };
  }

  async listPgLaws() {
    return this.pgLegalRepo.listLaws();
  }

  private isLikelyNonLegal(
    analysis: LegalQuestionAnalysis,
    userQuestion: string,
  ): boolean {
    const domains = Array.isArray(analysis.domains) ? analysis.domains : [];
    const lawHints = Array.isArray(analysis.lawHints) ? analysis.lawHints : [];

    const metaPatterns = [
      'резюмирай',
      'обобщи',
      'какво обсъждахме',
      'за какво говорихме',
      'какво говорихме',
      'summary',
      'what did we talk',
      'recap',
    ];

    const lowerQ = (userQuestion || '').toLowerCase();
    const isMeta = metaPatterns.some((p) => lowerQ.includes(p));
    if (isMeta) return false;

    const noLawHints = lawHints.length === 0;
    const noUsefulDomains =
      domains.length === 0 ||
      domains.every((d) =>
        ['other', 'general', 'chitchat', 'smalltalk'].includes(d.toLowerCase()),
      );

    return noLawHints && noUsefulDomains;
  }

  // ---------------------------------------------------------------------------
  // 💡 Main AIAdvocate pipeline (Postgres + pgvector)
  // ---------------------------------------------------------------------------

  async chatWithPg(
    question: string,
    options?: { tier?: Tier; domainHint?: string; history?: ChatTurn[] },
  ) {
    const tier = options?.tier ?? 'free';
    const tierConfig = this.getTierConfig(tier);

    const category = await this.aiService.classifyQuestionKind(question);

    if (category === 'non-legal') {
      const answer =
        'AIAdvocate е правен асистент и е създаден да помага само по въпроси, ' +
        'свързани с българското право.\n\n' +
        'Моля, задай правен въпрос – например:\n' +
        '• „Спряха ме от КАТ, какви са ми правата?“\n' +
        '• „Как се обжалва електронен фиш?“\n' +
        '• „Какви са санкциите при превишена скорост?“';

      return {
        question,
        tier,
        detectedDomains: [],
        lawHints: [],
        candidateLawIds: [],
        tierConfig,
        contextCount: 0,
        context: [],
        answer,
      };
    }

    if (category === 'meta') {
      const history = options?.history ?? [];
      const metaAnswer = await this.aiService.generateAnswer(
        'Потребителят иска накратко обобщение на досегашния разговор. ' +
          'Направи кратко, ясно резюме на български, без нови правни теми.',
        [],
        { history },
      );

      return {
        question,
        tier,
        detectedDomains: [],
        lawHints: [],
        candidateLawIds: [],
        tierConfig,
        contextCount: 0,
        context: [],
        answer: metaAnswer,
      };
    }

    // legal
    const aiAnalysis = await this.aiService.analyzeLegalQuestion(question);
    const mergedAnalysis = this.mergeAnalysisWithHint(
      aiAnalysis,
      options?.domainHint,
    );

    if (this.isLikelyNonLegal(mergedAnalysis, question)) {
      const answer =
        'AIAdvocate е правен асистент и е създаден да помага само по въпроси, ' +
        'свързани с българското право.\n\n' +
        'Моля, задай правен въпрос – например:\n' +
        '• „Спряха ме от КАТ, какви са ми правата?“\n' +
        '• „Как се обжалва електронен фиш?“\n' +
        '• „Какви са санкциите при превишена скорост?“';

      return {
        question,
        tier,
        detectedDomains: mergedAnalysis.domains ?? [],
        lawHints: mergedAnalysis.lawHints ?? [],
        candidateLawIds: [],
        tierConfig,
        contextCount: 0,
        context: [],
        answer,
      };
    }

    // 2) Law selection (✅ via LawSelectorService)
    const allLaws = await this.pgLegalRepo.listLaws();
    const candidateLaws = this.lawSelector.selectCandidateLaws(
      allLaws,
      mergedAnalysis,
      {
        maxLaws: tierConfig.maxLaws,
      },
    );

    // 3) Tiered vector search (✅ diversified, per-law caps, max laws, real fallback)
    const chunks = await this.searchChunksTiered(
      question,
      candidateLaws,
      tierConfig,
    );

    // 4) Context
    const contextItems = this.buildAiContextItems(chunks);

    // 5) Answer
    const aiAnswer = await this.aiService.generateAnswer(
      question,
      contextItems,
      {
        history: options?.history,
      },
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

    if (domainHint) domains.add(domainHint);

    return { domains: Array.from(domains), lawHints };
  }

  private async searchChunksTiered(
    question: string,
    candidateLaws: LawRow[],
    cfg: TierConfig,
  ): Promise<LawChunkRow[]> {
    const rewritten = await this.aiService.rewriteLegalSearchQuery(question);
    const embedding = await this.embeddingsService.embed(rewritten);

    const lawIds = candidateLaws.map((l) => l.id);

    // 1) Oversample from candidate laws in one batch
    // Oversample hard so we have enough variety to round-robin.
    const oversample = Math.max(
      cfg.perLawLimit * Math.max(1, lawIds.length) * 3,
      cfg.globalFallbackLimit,
    );

    const raw = await this.pgLegalRepo.findChunksByEmbeddingForLaws(
      embedding,
      oversample,
      lawIds.length ? lawIds : undefined,
    );

    // 2) Diversify + cap per law and max laws (candidate priority)
    let picked = this.diversifyChunks(
      raw,
      cfg.perLawLimit,
      cfg.maxLaws,
      lawIds,
    );

    // 3) Fallback if too few results OR too few distinct laws
    const distinctPickedLaws = new Set(picked.map((c) => c.law_id)).size;
    const wantLaws = Math.min(cfg.maxLaws, lawIds.length || cfg.maxLaws);

    const needMore =
      picked.length < cfg.perLawLimit ||
      distinctPickedLaws < Math.min(2, wantLaws);

    if (needMore && cfg.globalFallbackLimit > 0) {
      const globalRaw = await this.pgLegalRepo.findChunksByEmbeddingForLaws(
        embedding,
        cfg.globalFallbackLimit,
        undefined,
      );

      // Merge + diversify again, but KEEP candidate order preference
      const merged = [...picked, ...globalRaw];
      picked = this.diversifyChunks(
        merged,
        cfg.perLawLimit,
        cfg.maxLaws,
        lawIds,
      );
    }

    return picked;
  }

  private diversifyChunks(
    chunks: LawChunkRow[],
    perLawLimit: number,
    maxLaws: number,
    preferredLawOrder?: number[],
  ): LawChunkRow[] {
    // sort by score (closest first)
    const sorted = [...chunks].sort((a, b) => a.score - b.score);

    // group by law_id
    const byLaw = new Map<number, LawChunkRow[]>();
    for (const c of sorted) {
      if (!byLaw.has(c.law_id)) byLaw.set(c.law_id, []);
      byLaw.get(c.law_id)!.push(c);
    }

    // choose iteration order: candidate laws first, then any others
    const candidateOrder =
      preferredLawOrder?.filter((id) => byLaw.has(id)) ?? [];
    const otherOrder = Array.from(byLaw.keys()).filter(
      (id) => !candidateOrder.includes(id),
    );

    const lawOrder = [...candidateOrder, ...otherOrder].slice(0, maxLaws);

    // round-robin pick with per-law caps
    const picked: LawChunkRow[] = [];
    const usedPerLaw = new Map<number, number>();

    let progress = true;
    while (progress) {
      progress = false;

      for (const lawId of lawOrder) {
        const used = usedPerLaw.get(lawId) ?? 0;
        if (used >= perLawLimit) continue;

        const arr = byLaw.get(lawId);
        if (!arr || arr.length === 0) continue;

        picked.push(arr.shift()!);
        usedPerLaw.set(lawId, used + 1);
        progress = true;
      }
    }

    return picked;
  }

  private buildAiContextItems(chunks: LawChunkRow[]): AiContextItem[] {
    return chunks.map((c) => ({
      citation: `${c.law_title} – ${c.list_title} (ldoc: ${c.ldoc_id}, chunk ${c.chunk_index})`,
      text: c.chunk_text,
    }));
  }
}
