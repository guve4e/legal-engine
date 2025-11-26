// src/legal/embeddings.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class EmbeddingsService {
  private readonly openAiBaseUrl = 'https://api.openai.com/v1/embeddings';
  private readonly model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

  async embed(text: string): Promise<number[]> {
    try {
      const response = await axios.post(
        this.openAiBaseUrl,
        {
          input: text,
          model: this.model,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        },
      );

      const embedding = response.data.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned');
      }

      return embedding;
    } catch (err) {
      console.error('Embedding error:', err);
      throw new InternalServerErrorException('Failed to generate embedding');
    }
  }
}