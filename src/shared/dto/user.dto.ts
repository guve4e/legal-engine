import { IsString, IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { UserRole } from '../roles/user.roles';

export class UserDto {
  @IsString()
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

  @IsEmail()
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @IsEnum(UserRole, {
    message: 'Invalid role',
  })
  @IsNotEmpty({ message: 'Role is required' })
  role!: UserRole;
}
