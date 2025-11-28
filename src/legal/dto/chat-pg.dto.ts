// src/legal/dto/chat-pg.dto.ts
import { IsOptional, IsString, IsIn } from 'class-validator';

export class ChatPgDto {
  @IsString()
  question: string;

  @IsOptional()
  @IsIn(['free', 'plus', 'pro'])
  tier?: 'free' | 'plus' | 'pro';

  @IsOptional()
  @IsString()
  domainHint?: string;
}