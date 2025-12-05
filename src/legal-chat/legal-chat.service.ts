// src/legal-chat/legal-chat.service.ts
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConversationRepository } from './conversation.repository';
import { MessageRepository } from './message.repository';
import { ConversationDocument } from './schemas/conversation.schema';
import { MessageDocument } from './schemas/message.schema';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import type { LegalQaService, LegalQaAnswer } from './legal-chat.types';
import { LEGAL_QA_SERVICE, HISTORY_MODE } from './legal-chat.types';
import { AiService } from '../ai/ai.service';

@Injectable()
export class LegalChatService {
  private readonly logger = new Logger(LegalChatService.name);

  constructor(
    private readonly convRepo: ConversationRepository,
    private readonly msgRepo: MessageRepository,
    @Inject(LEGAL_QA_SERVICE)
    private readonly qa: LegalQaService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Start a new conversation.
   */
  async startConversation(
    dto: StartConversationDto,
  ): Promise<ConversationDocument> {
    const conv = await this.convRepo.create({
      userId: dto.userId || 'anonymous',
      title: dto.title || 'Нова консултация',
      summary: null,
    });

    return conv;
  }

  /**
   * Handle a new user message inside an existing conversation:
   *  - store user message
   *  - load full history
   *  - call LegalQaService with history / summary
   *  - store assistant message
   *  - optionally update summary (Option C)
   */
  async handleUserMessage(dto: SendMessageDto) {
    this.logger.debug(
      `handleUserMessage(): incoming dto = ${JSON.stringify(dto)}`,
    );

    const conv = await this.convRepo.findById(dto.conversationId);
    if (!conv) {
      throw new NotFoundException('Разговорът не е намерен.');
    }

    this.logger.debug(
      `handleUserMessage(): found conversation ${conv._id.toString()} for userId=${
        conv.userId
      }, summaryLen=${conv.summary ? conv.summary.length : 0}`,
    );

    // 1) Store user message
    const userMsg = await this.msgRepo.create({
      conversationId: conv._id.toString(),
      role: 'user',
      content: dto.content,
    });

    // 2) Load all messages (including the new one)
    const allMessages = await this.msgRepo.findByConversationId(
      conv._id.toString(),
    );

    this.logger.debug(
      `handleUserMessage(): loaded ${allMessages.length} messages for conversation ${conv._id.toString()}`,
    );

    // Build normalized history for the QA service
    const fullHistory: { role: 'user' | 'assistant' | 'system'; content: string }[] =
      allMessages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

    // Option B: in "summary" mode we still send a short tail of the real history
    const historyToSend =
      HISTORY_MODE === 'full'
        ? fullHistory
        : fullHistory.slice(-6); // last few messages for extra context

    this.logger.debug(
      `handleUserMessage(): HISTORY_MODE=${HISTORY_MODE}, will send history length=${historyToSend.length} to QA service`,
    );

    this.logger.debug(
      'handleUserMessage(): calling qa.answerQuestion with payload:',
    );
    this.logger.debug(
      JSON.stringify(
        {
          userQuestion: dto.content,
          conversationSummaryPreview: conv.summary
            ? conv.summary.slice(0, 120)
            : null,
          historySample:
            HISTORY_MODE === 'full'
              ? fullHistory.slice(-3)
              : fullHistory.slice(-3),
        },
        null,
        2,
      ),
    );

    // 3) Call QA service
    const qaResult: LegalQaAnswer = await this.qa.answerQuestion({
      userQuestion: dto.content,
      conversationSummary: conv.summary || null,
      history: historyToSend,
    });

    this.logger.debug(
      `handleUserMessage(): qaResult received, answer length=${
        qaResult.answer?.length ?? 0
      }, supportingChunks=${qaResult.supportingChunks?.length ?? 0}`,
    );

    const assistantText = qaResult.answer;

    // 4) Store assistant message
    const assistantMsg = await this.msgRepo.create({
      conversationId: conv._id.toString(),
      role: 'assistant',
      content: assistantText,
    });

    // 5) Update summary in Option C
    if (HISTORY_MODE === 'summary') {
      try {
        this.logger.debug(
          'handleUserMessage(): updating conversation summary (HISTORY_MODE=summary)',
        );

        const newSummary = await this.aiService.updateConversationSummary({
          previousSummary: conv.summary ?? null,
          lastUserMessage: dto.content,
          lastAssistantMessage: assistantText,
        });

        await this.convRepo.updateSummary(conv._id.toString(), newSummary);

        this.logger.debug(
          `handleUserMessage(): summary updated, newSummaryLen=${
            newSummary ? newSummary.length : 0
          }`,
        );
        conv.summary = newSummary;
      } catch (e) {
        this.logger.warn(
          `Failed to update conversation summary: ${
            (e as Error).message
          }`,
        );
      }
    }

    return {
      conversationId: conv._id.toString(),
      questionMessageId: userMsg._id.toString(),
      answerMessageId: assistantMsg._id.toString(),
      answer: assistantText,
      rewrittenQuestion: qaResult.rewrittenQuestion,
      domains: qaResult.domains,
      lawHints: qaResult.lawHints,
      supportingChunks: qaResult.supportingChunks,
    };
  }

  /**
   * Return conversation + all its messages.
   */
  async getConversationWithMessages(id: string): Promise<{
    conversation: ConversationDocument;
    messages: MessageDocument[];
  }> {
    const conv = await this.convRepo.findById(id);
    if (!conv) {
      throw new NotFoundException('Разговорът не е намерен.');
    }

    const messages = await this.msgRepo.findByConversationId(
      conv._id.toString(),
    );

    return { conversation: conv, messages };
  }

  /**
   * List conversations for a given user (for "My conversations" screen).
   */
  async listUserConversations(userId: string) {
    return this.convRepo.listByUserId(userId);
  }
}