import { PickType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsString } from 'class-validator';
import { BaseUserDto } from './base-user.dto';

export class AuthUserResponseDto extends PickType(BaseUserDto, [
  'userId',
] as const) {
  @IsString()
  @IsNotEmpty({ message: 'JWT is required' })
  jwt: string = '';
}
