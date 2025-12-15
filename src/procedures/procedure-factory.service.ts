import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { EmbeddingsService } from '../legal/embeddings.service';
import { PgLegalRepository, LawChunkRow } from '../pg/pg-legal.repository';
import { LawSelectorService } from '../legal/law-selector.service';
import { AiContextItem } from '../ai/ai.types';

export interface ProcedureDraftFull {
  draft: import('../procedures/procedure-ai.types').ProcedureDraftFromAi;
  rawContext: AiContextItem[];
  usedLawIds: number[];
}

const DRAFT_RETRIEVAL = {
  maxLaws: 6,
  perLawLimit: 4,
  globalFallback: 6,
  minTotal: 10,
};

@Injectable()
export class ProcedureFactoryService {
  constructor(
    private readonly aiService: AiService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly pgLegalRepo: PgLegalRepository,
    private readonly lawSelector: LawSelectorService,
  ) {}

  /**
   * INTERNAL TOOL:
   * 1) Analyze scenario → domains + lawHints
   * 2) Select candidate laws
   * 3) Fetch chunks per selected law
   * 4) Fallback global chunks if too few
   * 5) Call AI to generate structured procedure draft JSON
   */
  async generateDraftForScenario(
    scenarioDescription: string,
  ): Promise<ProcedureDraftFull> {
    const question = scenarioDescription;

    // 1) Rewrite for search
    const rewritten = await this.aiService.rewriteLegalSearchQuery(question);

    // 2) Embed
    const embedding = await this.embeddingsService.embed(rewritten);

    // 3) AI analysis (domains + lawHints)
    const analysis = await this.aiService.analyzeLegalQuestion(question);

    // 4) Candidate laws
    const allLaws = await this.pgLegalRepo.listLaws();
    const candidateLaws = this.lawSelector.selectCandidateLaws(allLaws, analysis, {
      maxLaws: DRAFT_RETRIEVAL.maxLaws,
    });

    // 5) Per-law vector search
    const chunks: LawChunkRow[] = [];

    for (const law of candidateLaws) {
      const subset = (await this.pgLegalRepo.findChunksByEmbedding(
        embedding,
        DRAFT_RETRIEVAL.perLawLimit,
        law.id,
      )) as LawChunkRow[];

      chunks.push(...subset);
    }

    // 6) Fallback if too few (to catch weird edge cases)
    if (chunks.length < DRAFT_RETRIEVAL.minTotal && DRAFT_RETRIEVAL.globalFallback > 0) {
      const global = (await this.pgLegalRepo.findChunksByEmbedding(
        embedding,
        DRAFT_RETRIEVAL.globalFallback,
        undefined,
      )) as LawChunkRow[];
      chunks.push(...global);
    }

    // 7) Build context items
    const contextItems: AiContextItem[] = chunks.map((c) => ({
      citation: `${c.law_title} – ${c.list_title} (ldoc: ${c.law_id}, chunk ${c.chunk_index})`,
      text: c.chunk_text,
    }));

    // 8) Generate AI draft
    const draft = await this.aiService.generateProcedureDraftFromContext({
      scenarioDescription,
      question,
      lawContext: contextItems,
    });

    const usedLawIds = Array.from(new Set(chunks.map((c) => c.law_id)));

    return {
      draft,
      rawContext: contextItems,
      usedLawIds,
    };
  }
}