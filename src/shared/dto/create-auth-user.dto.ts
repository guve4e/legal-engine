export type UserRole = 'ADMIN' | 'USER';

export class CreateAuthUserDto {
  userId!: string;
  username!: string;
  password!: string;
  role!: UserRole;
}
