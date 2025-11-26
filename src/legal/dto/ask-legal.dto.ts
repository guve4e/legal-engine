// src/legal/dto/ask-legal.dto.ts
import { IsOptional, IsString } from 'class-validator';

export class AskLegalDto {
  @IsString()
  question: string;

  @IsOptional()
  @IsString()
  lawAbbr?: string; // e.g. "ЗРА", "ТЗ" – optional filter
}

export class LegalChunkResult {
  id: string;
  text: string;
  lawAbbr: string;
  citation?: string;
  lawType?: string;
  score: number;
}