// src/legal-chat/legal-qa.service.impl.ts
import { Injectable } from '@nestjs/common';
import { LegalQaAnswer, LegalQaService } from './legal-chat.types';
import { MessageRole } from './entities/message.entity';
import { LawChunkRow, PgLegalRepository } from '../pg/pg-legal.repository';
import { AiService, AiContextItem } from '../ai/ai.service';
import { EmbeddingsService } from '../legal/embeddings.service';

@Injectable()
export class LegalQaServiceImpl implements LegalQaService {
  // You can keep these for future use if you want different models
  private readonly MODEL_SUMMARY = 'gpt-4.1-mini';

  constructor(
    private readonly pgRepo: PgLegalRepository,
    private readonly aiService: AiService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  // ---------- MAIN Q&A ----------

  async answerQuestion(input: {
    userQuestion: string;
    conversationSummary?: string | null;
    history: { role: 'user' | 'assistant' | 'system'; content: string }[];
  }): Promise<LegalQaAnswer> {
    const { userQuestion, conversationSummary, history } = input;

    // 1) Rewrite question for better semantic search
    const rewrittenQuestion =
      await this.aiService.rewriteLegalSearchQuery(userQuestion);

    // 2) Embed rewritten question using the same embeddings pipeline
    const embedding = await this.embeddingsService.embed(rewrittenQuestion);

    // 3) Vector search in pgvector
    const chunks = await this.pgRepo.findChunksByEmbedding(embedding, 10);

    // 4) Build context for the model
    const contextItems: AiContextItem[] = [];

    const contextText = this.buildContextFromChunks(chunks);
    contextItems.push({
      citation: 'Lex.bg – релевантни правни текстове',
      text: contextText,
    });

    const historyText = this.buildHistoryBlock(
      history as { role: MessageRole; content: string }[],
    );
    if (historyText) {
      contextItems.push({
        citation: 'История на разговора',
        text: historyText,
      });
    }

    if (conversationSummary) {
      contextItems.push({
        citation: 'Обобщение на предишен разговор',
        text: conversationSummary,
      });
    }

    // 5) Let AiService handle the final answer (system prompt, safety, etc.)
    const answer = await this.aiService.generateAnswer(
      userQuestion,
      contextItems,
    );

    // 6) Return structured result for saving in Mongo
    return {
      answer,
      rewrittenQuestion,
      supportingChunks: chunks.map((c) => ({
        lawId: c.law_id,
        lawTitle: c.law_title,
        listTitle: c.list_title,
        sourceUrl: c.source_url,
        chunkIndex: c.chunk_index,
        chunkText: c.chunk_text,
      })),
    };
  }

  // ---------- SUMMARIZATION (simple implementation via AiService) ----------

  async summarizeConversation(
    history: { role: MessageRole; content: string }[],
  ): Promise<string> {
    if (!history.length) return '';

    const conversationText = history
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const question =
      'Моля, накратко обобщи следния правен разговор, като опишеш фактите и основните правни теми.';

    const ctx: AiContextItem[] = [
      {
        citation: 'Пълна история на разговора',
        text: conversationText,
      },
    ];

    // Reuse the same AiService prompt framework
    const summary = await this.aiService.generateAnswer(question, ctx);
    return summary || '';
  }

  // ---------- HELPERS ----------

  private buildContextFromChunks(chunks: LawChunkRow[]): string {
    if (!chunks.length) {
      return 'Няма намерени релевантни правни текстове за този въпрос.';
    }

    const lines: string[] = [];
    lines.push('### Релевантни правни текстове (от база данни)');

    chunks.forEach((c, idx) => {
      const lawTitle = c.law_title || c.list_title || 'Неизвестен акт';
      const header = `[${idx + 1}] ${lawTitle} (law_id=${c.law_id}, chunk=${c.chunk_index})`;
      const body = c.chunk_text.replace(/\s+/g, ' ').trim();

      lines.push(`${header}\nТекст: ${body}\n---`);
    });

    return lines.join('\n\n');
  }

  private buildHistoryBlock(
    history: { role: MessageRole; content: string }[],
  ): string {
    if (!history.length) return '';

    const formatted = history
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    return `### Досегашен разговор (кратка история)\n${formatted}\n`;
  }
}