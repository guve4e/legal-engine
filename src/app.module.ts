// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LegalModule } from './legal/legal.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { LegalChatModule } from './legal-chat/legal-chat.module';
import { AdminModule } from './admin/admin.module';
import { AdminLawsModule } from './admin/admin-laws.module';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthUser } from './auth/auth-user.entity';
import { ProceduresModule } from './procedures/procedures.module';
import { DocumentsModule } from './documents/documents.module';
import { IngestionModule } from './ingestion/ingestion.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.LEGAL_MONGO_URI ||
      'mongodb://valio:supersecretpassword@192.168.1.60:27017/legal?authSource=admin',
    ),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.PG_HOST || '192.168.1.60',
      port: +(process.env.PG_PORT || 5433),
      username: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASS || 'aztewe',
      database: process.env.PG_DB || 'bg_legal',
      entities: [AuthUser],        // or use autoLoadEntities: true
      synchronize: false,          // true only in dev if you want auto schema sync
    }),

    AiModule,
    LegalModule,
    LegalChatModule,
    AdminModule,
    AdminLawsModule,
    AuthModule,
    ProceduresModule,
    DocumentsModule,
    IngestionModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
