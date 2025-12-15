import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { LegalService, Tier } from '../legal/legal.service';
import { ProceduresService } from './procedures.service';
import { ChatTurn, LegalQuestionAnalysis } from '../ai/ai.types';

@Injectable()
export class ProcedurePlannerService {
  constructor(
    private readonly aiService: AiService,
    private readonly legalService: LegalService,
    private readonly proceduresService: ProceduresService,
  ) {}

  async planProcedureWithPg(
    question: string,
    options?: { tier?: Tier; history?: ChatTurn[] },
  ) {
    const tier = options?.tier ?? 'free';

    // 1) classify legal/meta/non-legal
    const category = await this.aiService.classifyQuestionKind(question);
    if (category !== 'legal') {
      return {
        kind: 'non-procedure' as const,
        category,
        message:
          'AIAdvocate може да планира процедури само по правни въпроси. Моля, задай конкретен юридически казус.',
      };
    }

    // 2) legal analysis -> domains + lawHints
    const analysis = await this.aiService.analyzeLegalQuestion(question);

    // 3) procedure candidates (cheap scorer)
    const candidates = this.proceduresService.initialMatch(question, analysis);
    if (!candidates.length) {
      return {
        kind: 'no-procedure-match' as const,
        category,
        analysis,
        message:
          'Не успях да намеря конкретна готова процедура за този въпрос. Можеш да използваш общия правен чат.',
      };
    }

    const topCandidates = candidates.slice(0, 3);

    // 4) optional LLM refinement (if you have it, otherwise skip)
    let chosenSlug = topCandidates[0].procedure.slug;

    if (typeof (this.aiService as any).selectBestProcedure === 'function') {
      const selection = await (this.aiService as any).selectBestProcedure(
        question,
        topCandidates.map((c: any) => ({
          slug: c.procedure.slug,
          name: c.procedure.name,
          shortDescription: c.procedure.shortDescription,
          keywords: c.procedure.keywords,
        })),
      );

      const rawSlug: unknown = selection?.slug;

      if (typeof rawSlug === 'string' && this.proceduresService.isValidSlug(rawSlug)) {
        chosenSlug = rawSlug; // ✅ typed as ProcedureSlug via type guard
      }
    }

    const procedure = this.proceduresService.getBySlug(chosenSlug);
    if (!procedure) {
      return {
        kind: 'no-procedure-match' as const,
        category,
        analysis,
        message:
          'Възникна технически проблем при избора на процедура. Опитай отново.',
      };
    }

    // 5) Fetch context for that procedure by reusing LegalService chat pipeline
    // Use procedure.lawHints as a strong hint if present
    const lawFilteredAnalysis: LegalQuestionAnalysis = {
      domains: analysis.domains,
      lawHints: procedure.lawHints?.length ? procedure.lawHints : analysis.lawHints,
    };

    // We reuse LegalService internals by calling chatWithPg with domainHint/tier
    // (Simplest MVP: call chatWithPg and ignore its final answer.)
    const chatRes = await this.legalService.chatWithPg(question, { tier });

    return {
      kind: 'procedure-plan' as const,
      tier,
      category,
      analysis: lawFilteredAnalysis,
      procedure,
      contextCount: chatRes.contextCount,
      context: chatRes.context,
    };
  }
}