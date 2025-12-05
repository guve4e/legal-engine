import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthUser } from './auth-user.entity';
import { LoggingModule } from '../shared/lib/logging/logging.module';

@Module({
  imports: [
    // Register User entity
    TypeOrmModule.forFeature([AuthUser]),

    // JWT module setup
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: {
        expiresIn: '15m', // default for access token
      },
    }),
    LoggingModule,
  ],

  controllers: [AuthController],
  providers: [AuthService],

  // Export service for use in guards or other modules
  exports: [AuthService, TypeOrmModule, JwtModule],
})
export class AuthModule {}
