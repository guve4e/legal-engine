// src/legal-chat/legal-chat.controller.ts
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { LegalChatService } from './legal-chat.service';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { LEGAL_QA_SERVICE, type LegalQaService } from './legal-chat.types';

@Controller('legal-chat')
export class LegalChatController {
  constructor(
    private readonly chatService: LegalChatService,
    @Inject(LEGAL_QA_SERVICE)
    private readonly legalQaService: LegalQaService,
  ) {}

  @Post('start')
  async startConversation(@Body() dto: StartConversationDto) {
    console.log(`POST /legal-chat/start`, dto);
    const conv = await this.chatService.startConversation(dto);
    return {
      id: conv.id,
      userId: conv.userId,
      title: conv.title,
      createdAt: conv.createdAt,
    };
  }

  @Post('message')
  async sendMessage(@Body() dto: SendMessageDto) {
    console.log(`POST /legal-chat/message`, dto);
    return this.chatService.handleUserMessage(dto);
  }

  @Get('conversation/:id')
  async getConversation(@Param('id') id: string) {
    console.log(`GET /legal-chat/conversation/${id}`);
    return this.chatService.getConversationWithMessages(id);
  }

  @Get('user/:userId')
  async listUserConversations(@Param('userId') userId: string) {
    console.log(`GET /legal-chat/user/${userId}`);
    return this.chatService.listUserConversations(userId);
  }

  @Post('ask')
  async ask(@Body('question') question: string) {
    console.log(`POST /legal-chat/ask`, question);
    if (!question || !question.trim()) {
      return { error: 'Моля, изпратете въпрос.' };
    }

    const answer = await this.legalQaService.answerQuestion({
      userQuestion: question.trim(),
      conversationSummary: null,
      history: [],
    });

    return {
      question,
      ...answer,
    };
  }
}