// src/legal-chat/legal-qa.service.impl.ts
import { Injectable } from '@nestjs/common';
import { LegalQaAnswer, LegalQaService } from './legal-chat.types';
import { MessageRole } from './entities/message.entity';
import { LegalService } from '../legal/legal.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class LegalQaServiceImpl implements LegalQaService {
  constructor(
    private readonly legalService: LegalService, // 🚀 reuse the existing PG+AI engine
    private readonly aiService: AiService,       // used for summarization
  ) {}

  // ---------- MAIN Q&A (delegates to LegalService.chatWithPg) ----------

  async answerQuestion(input: {
    userQuestion: string;
    conversationSummary?: string | null;
    history: { role: 'user' | 'assistant' | 'system'; content: string }[];
  }): Promise<LegalQaAnswer> {
    const { userQuestion } = input;

    // Call the existing PG+AI pipeline
    const result = await this.legalService.chatWithPg(userQuestion, {
      // later we can pass domainHint derived from history/summary
      // domainHint: ...
    });

    // Map the result into the LegalQaAnswer shape used by legal-chat
    return {
      answer: result.answer,
      // we don't currently expose the rewritten query from LegalService,
      // so for now we just echo the original question or result.question
      rewrittenQuestion: result.question,
      supportingChunks: result.context.map((c) => ({
        lawId: c.law_id,
        lawTitle: c.law_title,
        listTitle: c.list_title,
        sourceUrl: c.source_url,
        chunkIndex: c.chunk_index,
        chunkText: c.chunk_text,
      })),
    };
  }

  // ---------- SUMMARIZATION (uses AiService) ----------

  async summarizeConversation(
    history: { role: MessageRole; content: string }[],
  ): Promise<string> {
    if (!history.length) return '';

    const conversationText = history
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const question = `
Направи кратко, ясно резюме на следния правен разговор.
Опиши:
- фактическата ситуация (кой, какво, кога)
- основните правни теми (напр. лов, КАТ, НАП, трудово право и т.н.)
- без да даваш нов правен съвет, само обобщение
До 6–8 изречения.
`.trim();

    // Хак: използваме generateAnswer, като подаваме целия разговор като „контекст“
    const summary = await this.aiService.generateAnswer(question, [
      {
        text: conversationText,
      },
    ]);

    return summary;
  }
}