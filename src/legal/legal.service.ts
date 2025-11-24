import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LegalSource,
  LegalSourceDocument,
} from './schemas/legal-source.schema';
import {
  LegalPassage,
  LegalPassageDocument,
} from './schemas/legal-passage.schema';
import { AiService } from '../ai/ai.service';

@Injectable()
export class LegalService {
  constructor(
    @InjectModel(LegalSource.name)
    private readonly legalSourceModel: Model<LegalSourceDocument>,
    @InjectModel(LegalPassage.name)
    private readonly legalPassageModel: Model<LegalPassageDocument>,
    private readonly aiService: AiService,
  ) {}

  ping() {
    return 'Legal service with Mongo is responsive';
  }

  async seedDemoData() {
    // Check if we already seeded:
    const existing = await this.legalSourceModel.findOne({ code: 'KTK' });
    if (existing) {
      return { message: 'Demo data already exists', sourceId: existing._id };
    }

    const source = await this.legalSourceModel.create({
      code: 'KTK',
      titleBg: 'Кодекс на търговското корабоплаване',
      jurisdiction: 'BG',
      domains: ['boat', 'river', 'sea'],
      notes: 'Демо източник за тестване.',
    });

    const passage = await this.legalPassageModel.create({
      sourceId: source._id,
      contentType: 'law',
      language: 'bg',
      article: '89',
      paragraph: '1',
      citation: 'Чл. 89, ал. 1 КТК',
      text: 'На капитана на кораба се възлага управлението на кораба, включително и корабоводенето, както и вземането на всички необходими мерки за безопасно плаване и поддържане на реда в кораба.',
      domains: ['boat', 'river', 'sea'],
      tags: ['captain', 'documents', 'responsibility'],
      chunkIndex: 0,
      chunkCount: 1,
      importance: 0.9,
    });

    return {
      message: 'Demo legal source and passage created',
      sourceId: source._id,
      passageId: passage._id,
    };
  }

  async getAllSources() {
    return this.legalSourceModel.find().lean();
  }

  async getPassagesByDomain(domain: string) {
    return this.legalPassageModel
      .find({ domains: domain })
      .limit(20)
      .lean();
  }

  async searchPassages(query: string, domain?: string) {
    const filter: any = {};

    if (domain) {
      filter.domains = domain;
    }

    if (query && query.trim().length > 0) {
      // simple regex search on text + tags for now
      const regex = new RegExp(query.trim(), 'i');
      filter.$or = [{ text: regex }, { tags: regex }, { citation: regex }];
    }

    return this.legalPassageModel
      .find(filter)
      .limit(20)
      .lean();
  }

  async chat(question: string, domain?: string, limit = 5) {
    const passages = await this.searchPassages(question, domain);
    const limitedPassages = passages.slice(0, limit);

    const aiAnswer = await this.aiService.generateAnswer(
      question,
      limitedPassages.map((p) => ({
        citation: p.citation,
        text: p.text,
      })),
    );

    return {
      question,
      domain: domain ?? null,
      contextCount: limitedPassages.length,
      context: limitedPassages.map((p) => ({
        citation: p.citation,
        article: p.article,
        paragraph: p.paragraph,
        text: p.text,
        tags: p.tags,
        domains: p.domains,
        id: p._id,
      })),
      answer: aiAnswer,
    };
  }
}