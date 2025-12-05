import {
  IsString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  MinLength,
} from 'class-validator';
import { UserRole } from '../roles/user.roles';

export enum SupportedLanguages {
  English = 'English',
  Bulgarian = 'Bulgarian',
  German = 'German',
}

export class BaseUserDto {
  @IsString()
  userId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Email is required' })
  email: string = '';
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  username: string = '';

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string = '';

  @IsEnum(UserRole, {
    message: 'Invalid role',
  })
  @IsNotEmpty({ message: 'Role is required' })
  role: UserRole = UserRole.Staff;

  @IsEnum(SupportedLanguages)
  @IsNotEmpty({ message: 'Language is required' })
  language!: SupportedLanguages;
}
