import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenAiEmbeddingsService {
  private readonly client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async embedOne(text: string, model = 'text-embedding-3-small'): Promise<number[]> {
    const input = text.trim();
    if (!input) return [];

    const maxRetries = +(process.env.EMBED_MAX_RETRIES || 5);
    const baseSleepMs = +(process.env.EMBED_RETRY_SLEEP_MS || 800);

    let lastErr: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const resp = await this.client.embeddings.create({ model, input });
        return resp.data[0].embedding as number[];
      } catch (e: any) {
        lastErr = e;
        const sleep = baseSleepMs * attempt;
        await new Promise((r) => setTimeout(r, sleep));
      }
    }

    throw lastErr;
  }
}