import { IsString, IsNotEmpty, MinLength, IsEnum } from 'class-validator';
import { UserRole } from '../roles/user.roles';


export class RegisterDto {
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

  @IsString()
  @IsNotEmpty({ message: 'Email is required' })
  email: string = '';

  @IsString()
  @IsNotEmpty({ message: 'Email is required' })
  language: string = '';
}
