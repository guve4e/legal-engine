import { Body, Controller, Get, Post } from '@nestjs/common';
import { LegalService } from './legal.service';
import { ChatDto } from './dto/chat.dto';
import { ChatPgDto } from './dto/chat-pg.dto';

@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

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

  @Post('chat-pg')
  async chatPg(@Body() body: ChatPgDto): Promise<any> {
    const { question, limit = 5, lawId } = body;
    return this.legalService.chatWithPg(question, limit, lawId);
  }
}