// src/legal/legal.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LegalService } from './legal.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get('ping')
  ping() {
    return {
      status: 'ok',
      message: this.legalService.ping(),
      at: new Date().toISOString(),
    };
  }

  @Get('seed-demo')
  async seedDemo() {
    const result = await this.legalService.seedDemoData();
    return {
      status: 'ok',
      ...result,
    };
  }

  @Get('sources')
  async getSources() {
    const sources = await this.legalService.getAllSources();
    return { count: sources.length, items: sources };
  }

  @Get('passages')
  async getPassages(@Query('domain') domain: string) {
    const items = await this.legalService.getPassagesByDomain(
      domain || 'boat',
    );
    return { count: items.length, items };
  }

  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('domain') domain?: string,
  ) {
    const items = await this.legalService.searchPassages(q || '', domain);
    return {
      query: q,
      domain: domain || null,
      count: items.length,
      items,
    };
  }

  @Post('chat')
  async chat(@Body() body: ChatRequestDto) {
    const { question, domain, limit } = body;
    const result = await this.legalService.chat(
      question,
      domain,
      limit ?? 5,
    );
    return {
      status: 'ok',
      ...result,
    };
  }

  @Get('echo')
  echo(@Query('q') q: string) {
    return {
      question: q,
      note:
        'Legal engine is running. This will later call AI and Mongo search.',
    };
  }
}