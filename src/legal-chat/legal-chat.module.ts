import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { LegalChatController } from './legal-chat.controller';
import { LegalChatService } from './legal-chat.service';

import {
  Conversation,
  ConversationSchema,
} from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';

import { ConversationRepository } from './conversation.repository';
import { MessageRepository } from './message.repository';

import { LEGAL_QA_SERVICE } from './legal-chat.types';
import { LegalChatPgQaService } from './legal-chat.pg-qa.service';

import { AiModule } from '../ai/ai.module';
import { LegalModule } from '../legal/legal.module';
import { PgModule } from '../pg/pg.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    AiModule,
    LegalModule,
    PgModule,
  ],
  controllers: [LegalChatController],
  providers: [
    LegalChatService,
    ConversationRepository,
    MessageRepository,
    {
      provide: LEGAL_QA_SERVICE,
      useClass: LegalChatPgQaService,
    },
  ],
  exports: [LegalChatService],
})
export class LegalChatModule {}