// legal/dto/admin-laws.dto.ts
import { IsInt, IsOptional, IsString, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ListLawsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  hasChunks?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize = 50;
}

// What we return to FE in the list
export interface LawListItemDto {
  id: number;
  ldocId: number;
  lawTitle: string;
  listTitle: string | null;
  sourceUrl: string;
  chunkCount: number;
  docType: 'LAW' | 'PRAVILNIK' | 'OTHER';
}

export interface LawListResponseDto {
  items: LawListItemDto[];
  page: number;
  pageSize: number;
  total: number;
}

// Detail view
export interface LawChunkDto {
  id: number;
  index: number;
  content: string;
}

export interface LawDetailDto {
  id: number;
  ldocId: number;
  lawTitle: string;
  listTitle: string | null;
  sourceUrl: string;
  chunkCount: number;
  chunks: LawChunkDto[];
}

export interface AdminLawsStatsDto {
  totalLaws: number;
  totalWithChunks: number;
  totalWithoutChunks: number;
  byType: {
    LAW: number;
    PRAVILNIK: number;
    OTHER: number;
  };
}
