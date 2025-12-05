// admin-laws.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminLawsRepository } from './admin-laws.repository';
import {
  ListLawsQueryDto,
  LawListResponseDto,
  LawDetailDto,
  AdminLawsStatsDto
} from '../legal/dto/admin-laws.dto';

@Injectable()
export class AdminLawsService {
  constructor(private readonly repo: AdminLawsRepository) {}

  async listLaws(query: ListLawsQueryDto): Promise<LawListResponseDto> {
    const hasChunks =
      query.hasChunks === 'true'
        ? true
        : query.hasChunks === 'false'
          ? false
          : null;

    // 🔧 normalize + defaults here
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 50;

    const { items, total } = await this.repo.findLaws({
      q: query.q,
      hasChunks,
      page,
      pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async getLawDetail(id: number): Promise<LawDetailDto> {
    const law = await this.repo.findLawDetail(id);
    if (!law) {
      throw new NotFoundException('Law not found');
    }
    return law;
  }

  async reingestLaw(id: number): Promise<{ status: string }> {
    console.log('Re-ingest requested for law id', id);
    return { status: 'queued' };
  }

  async getStats(): Promise<AdminLawsStatsDto> {
    return this.repo.getStats();
  }
}