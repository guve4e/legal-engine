import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export enum SupportedLanguages {
  English = 'en',
  Bulgarian = 'bg',
  German = 'de',
}

export const SupportedLanguagesDisplay = {
  [SupportedLanguages.English]: 'English',
  [SupportedLanguages.Bulgarian]: 'Bulgarian',
  [SupportedLanguages.German]: 'German',
};

export class UserSettingsDto {
  @IsEnum(SupportedLanguages, { message: 'Language must be English, Bulgarian, or German' })
  @IsOptional()
  language?: SupportedLanguages; // Example: 'English', 'Bulgarian', 'German'

  @IsOptional()
  @IsBoolean()
  darkMode?: boolean;

  @IsOptional()
  @IsBoolean()
  receiveNotifications?: boolean;
}
