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
import { LEGAL_QA_SERVICE } from './legal-chat.types';

@Injectable()
export class LegalChatService {
  private readonly logger = new Logger(LegalChatService.name);

  constructor(
    private readonly convRepo: ConversationRepository,
    private readonly msgRepo: MessageRepository,
    // IMPORTANT: interface type imported via `import type`,
    // and actual DI uses the token
    @Inject(LEGAL_QA_SERVICE)
    private readonly qa: LegalQaService,
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
   *  - call LegalQaService with history
   *  - store assistant message
   */
  async handleUserMessage(dto: SendMessageDto) {
    const conv = await this.convRepo.findById(dto.conversationId);
    if (!conv) {
      throw new NotFoundException('Разговорът не е намерен.');
    }

    // 1) Store user message
    const userMsg = await this.msgRepo.create({
      conversationId: conv._id.toString(),
      role: 'user',
      content: dto.content,
    });

    // 2) Load all messages (including this one) as history
    const allMessages = await this.msgRepo.findByConversationId(
      conv._id.toString(),
    );

    const history = allMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 3) Call QA service with full history
    const qaResult: LegalQaAnswer = await this.qa.answerQuestion({
      userQuestion: dto.content,
      conversationSummary: conv.summary || null,
      history,
    });

    const assistantText = qaResult.answer;

    // 4) Store assistant message
    const assistantMsg = await this.msgRepo.create({
      conversationId: conv._id.toString(),
      role: 'assistant',
      content: assistantText,
    });

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