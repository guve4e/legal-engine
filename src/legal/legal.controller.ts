import { Body, Controller, Get, Post } from '@nestjs/common';
import { LegalService } from './legal.service';
import { AiService } from '../ai/ai.service';

@Controller('legal')
export class LegalController {
  constructor(
    private readonly legalService: LegalService,
    private readonly aiService: AiService,
  ) {}

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
    return this.aiService.analyzeLegalQuestion(body.question);
  }
}