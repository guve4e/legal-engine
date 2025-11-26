// src/legal/pg/pg-legal.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { toSql } from 'pgvector';

export interface LawRow {
  id: number;
  ldoc_id: string;
  law_title: string;
  list_title: string;
  source_url: string;
}

export interface LawChunkRow {
  id: number;
  law_id: number;
  chunk_index: number;
  chunk_text: string;
  law_title: string;
  list_title: string;
  source_url: string;
}

@Injectable()
export class PgLegalRepository {
  constructor(
    @Inject('PG_POOL')
    private readonly pool: Pool,
  ) {}

  /**
   * Simple stats for monitoring / progress.
   */
  async getStats(): Promise<{ laws: number; chunks: number }> {
    const [lawsRes, chunksRes] = await Promise.all([
      this.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM laws;',
      ),
      this.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM law_chunks;',
      ),
    ]);

    return {
      laws: lawsRes.rows[0]?.count ?? 0,
      chunks: chunksRes.rows[0]?.count ?? 0,
    };
  }

  /**
   * List all laws (for dropdowns, filters, etc.).
   */
  async listLaws(): Promise<LawRow[]> {
    const sql = `
      SELECT id, ldoc_id, law_title, list_title, source_url
      FROM laws
      ORDER BY law_title;
    `;
    const res = await this.pool.query<LawRow>(sql);
    return res.rows;
  }

  /**
   * Vector similarity search over law_chunks with optional filter by law_id.
   *
   * @param embedding numerical embedding (1536-dim)
   * @param limit max rows to return
   * @param lawId optional law_id filter
   */
  async findChunksByEmbedding(
    embedding: number[],
    limit = 10,
    lawId?: number,
  ): Promise<LawChunkRow[]> {
    // toSql converts JS array -> pgvector literal string: '[0.12, -0.34, ...]'
    const embeddingLiteral = toSql(embedding);

    const params: any[] = [embeddingLiteral, limit];

    const whereClause = lawId ? 'WHERE lc.law_id = $3' : '';
    if (lawId) {
      params.push(lawId);
    }

    const sql = `
      SELECT
        lc.id,
        lc.law_id,
        lc.chunk_index,
        lc.chunk_text,
        l.law_title,
        l.list_title,
        l.source_url
      FROM law_chunks lc
      JOIN laws l ON l.id = lc.law_id
      ${whereClause}
      ORDER BY lc.embedding <=> $1::vector
      LIMIT $2;
    `;

    const res = await this.pool.query<LawChunkRow>(sql, params);
    return res.rows;
  }
}