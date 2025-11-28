// src/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { OpenAI } from 'openai';

@Module({
  providers: [
    {
      provide: OpenAI,
      useFactory: () => {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          // We still allow the app to start, AiService will guard calls.
          // You can also throw here if you prefer hard-fail on missing key.
          console.warn(
            '[AiModule] WARNING: OPENAI_API_KEY is not set. AiService will use fallback answers.',
          );
        }

        return new OpenAI({
          apiKey,
        });
      },
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}