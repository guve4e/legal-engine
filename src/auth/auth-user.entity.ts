import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

export type AuthUserRole = 'ADMIN' | 'USER';

@Entity('auth_users')
export class AuthUser {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, unique: true })
  username!: string;

  @Column({ type: 'text' })
  password!: string;

  @Column({ type: 'varchar', length: 16, default: 'USER' })
  role!: AuthUserRole;

  @Column({ type: 'text', nullable: true })
  refreshToken: string | null;
}
