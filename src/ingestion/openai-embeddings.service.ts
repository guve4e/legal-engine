// src/ingestion/openai-embeddings.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { AiUsageService } from '../ai/ai-usage.service';

@Injectable()
export class OpenAiEmbeddingsService {
  private readonly logger = new Logger(OpenAiEmbeddingsService.name);

  constructor(
    private readonly openai: OpenAI,              // ✅ use injected singleton
    private readonly aiUsage: AiUsageService,     // ✅ meter usage
  ) {}

  async embedOne(
    text: string,
    model = 'text-embedding-3-small',
  ): Promise<number[]> {
    const input = text.trim();
    if (!input) return [];

    const maxRetries = +(process.env.EMBED_MAX_RETRIES || 5);
    const baseSleepMs = +(process.env.EMBED_RETRY_SLEEP_MS || 800);

    let lastErr: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const resp = await this.openai.embeddings.create({ model, input });

        // ✅ meter usage if available
        const usage = (resp as any).usage;
        if (usage) {
          const inputTokens =
            usage.prompt_tokens ??
            usage.input_tokens ??
            usage.total_tokens ??
            0;

          const totalTokens = usage.total_tokens ?? inputTokens;

          const costUsd = this.aiUsage.computeCostUsd(model, inputTokens, 0);

          await this.aiUsage.record({
            kind: 'embedding',
            model,
            inputTokens,
            outputTokens: 0,
            totalTokens,
            costUsd,
            extra: {
              chars: input.length,
              attempt,
            },
          });
        } else {
          // still record *something* so you can see calls happening even if usage isn't returned
          await this.aiUsage.record({
            kind: 'embedding',
            model,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: null,
            extra: {
              chars: input.length,
              attempt,
              note: 'no-usage-returned',
            },
          });
        }

        return resp.data[0].embedding as number[];
      } catch (e: any) {
        lastErr = e;

        // optional: record failed attempts too (helps debugging / rate-limit storms)
        await this.aiUsage.record({
          kind: 'embedding_error',
          model,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: null,
          extra: {
            attempt,
            message: String(e?.message || e).slice(0, 500),
          },
        });

        const sleep = baseSleepMs * attempt;
        await new Promise((r) => setTimeout(r, sleep));
      }
    }

    this.logger.error(
      `embedOne failed after ${maxRetries} attempts: ${String(lastErr?.message || lastErr)}`,
    );

    throw lastErr;
  }
}