// src/legal-chat/legal-chat.pg-qa.service.ts
import { Injectable } from '@nestjs/common';
import { LegalService } from '../legal/legal.service';
import {
  LEGAL_QA_SERVICE,
  LegalQaService,
  LegalQaAnswer,
} from './legal-chat.types';

@Injectable()
export class LegalChatPgQaService implements LegalQaService {
  constructor(private readonly legalService: LegalService) {}

  async answerQuestion(input: {
    userQuestion: string;
    conversationSummary?: string | null;
    history: { role: 'user' | 'assistant' | 'system'; content: string }[];
  }): Promise<LegalQaAnswer> {
    const { userQuestion, conversationSummary, history } = input;

    const qLower = userQuestion.toLowerCase();

    const isRecap =
      qLower.includes('резюмирай') ||
      qLower.includes('обобщи') ||
      qLower.includes('какво обсъждахме') ||
      qLower.includes('за какво говорихме') ||
      qLower.includes('какво говорихме') ||
      qLower.includes('summary') ||
      qLower.includes('what did we talk') ||
      qLower.includes('recap');

    // 1) Special handling for recap / summary questions
    if (isRecap) {
      if (conversationSummary && conversationSummary.trim().length > 0) {
        // Use the LLM-maintained summary directly
        return {
          answer: conversationSummary,
          rewrittenQuestion: userQuestion,
          domains: ['other'],
          lawHints: [],
          supportingChunks: [],
        };
      }

      // Fallback: quick human-style summary from history
      const userTurns = history.filter((m) => m.role === 'user');
      const assistantTurns = history.filter((m) => m.role === 'assistant');

      let answer: string;

      if (userTurns.length === 0 && assistantTurns.length === 0) {
        answer =
          'Все още нямаме достатъчно история в този разговор, за да направя резюме.';
      } else {
        const bullets = userTurns
          .map((m) => `• ${m.content}`)
          .join('\n');

        if (bullets) {
          answer = 'Досега обсъждахме следните въпроси:\n' + bullets;
        } else {
          answer =
            'Досега сме обменили няколко съобщения, но нямам достатъчно ясно формулирани въпроси, за да направя смислено резюме.';
        }
      }

      return {
        answer,
        rewrittenQuestion: userQuestion,
        domains: ['other'],
        lawHints: [],
        supportingChunks: [],
      };
    }

    // 2) Normal legal QA path via Postgres + pgvector
    const result = await this.legalService.chatWithPg(userQuestion, {
      tier: 'free',
      history: history
        .filter((h) => h.role === 'user' || h.role === 'assistant')
        .map((h) => ({
          role: h.role as 'user' | 'assistant',
          text: h.content,
        })),
    });

    return {
      answer: result.answer,
      rewrittenQuestion: undefined,
      domains: result.detectedDomains ?? [],
      lawHints: result.lawHints ?? [],
      supportingChunks: (result.context || []).map((c: any) => ({
        lawId: c.law_id,
        lawTitle: c.law_title,
        listTitle: c.list_title,
        sourceUrl: c.source_url,
        chunkIndex: c.chunk_index,
        chunkText: c.chunk_text,
      })),
    };
  }
}