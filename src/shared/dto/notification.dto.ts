import {
  IsUUID,
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
} from 'class-validator';

export enum ReadStatus {
  UNREAD = 'unread',
  READ = 'read',
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export class NotificationDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  userId!: string; // 🔹 Added userId

  @IsString()
  type!: string;

  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsDateString()
  timestamp!: string; // ISO 8601 string representation

  @IsEnum(ReadStatus)
  readStatus!: ReadStatus;

  @IsEnum(Priority)
  priority!: Priority;

  @IsString()
  source!: string;

  @IsString()
  @IsOptional()
  locale?: string;

  metadata!: Record<string, any>;
}
