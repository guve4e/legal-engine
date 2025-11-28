import { Body, Controller, Get, Post } from '@nestjs/common';
import { LegalService, Tier } from './legal.service';
import { ChatDto } from './dto/chat.dto';
import { ChatPgDto } from './dto/chat-pg.dto';
import { AiService } from '../ai/ai.service';

@Controller('legal')
export class LegalController {
  constructor(
    private readonly legalService: LegalService,
    private readonly aiService: AiService,
  ) {}

  // -------------------------------------------------------
  // Mongo
  // -------------------------------------------------------

  @Get('mongo-ping')
  pingMongo() {
    return this.legalService.ping();
  }

  @Post('chat')
  async chat(@Body() body: ChatDto) {
    const { question, domain, limit = 5 } = body;
    return this.legalService.chat(question, domain, limit);
  }

  // -------------------------------------------------------
  // Postgres PGVector
  // -------------------------------------------------------

  @Get('pg-health')
  pgHealth() {
    return this.legalService.pgHealth();
  }

  @Get('pg-stats')
  pgStats() {
    return this.legalService.pgStats();
  }

  @Get('pg-laws')
  listPgLaws() {
    return this.legalService.listPgLaws();
  }

  @Post('debug/analyze-question')
  async debugAnalyze(@Body() body: { question: string }) {
    const { question } = body;
    return this.aiService.analyzeLegalQuestion(question);
  }


  @Post('chat-pg')
  async chatPg(@Body() body: ChatPgDto): Promise<any> {
    const { question } = body;

    // Backend decides tier, user just asks the question
    const tier: Tier =
      (process.env.AIADVOCATE_FORCE_TIER as Tier) ?? 'free';

    return this.legalService.chatWithPg(question, { tier });
  }
}