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
  ldoc_id: string;
  score: number; // smaller = closer (pgvector <=>)
}

@Injectable()
export class PgLegalRepository {
  constructor(
    @Inject('PG_POOL')
    private readonly pool: Pool,
    @Inject('LOGGER_SERVICE') private readonly logger: any,
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
   * @param embedding numerical embedding (same dim as pgvector column)
   * @param limit max rows to return
   * @param lawId optional law_id filter
   */
  async findChunksByEmbedding(
    embedding: number[],
    limit = 10,
    lawId?: number,
  ): Promise<LawChunkRow[]> {
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
      l.source_url,
      l.ldoc_id,
      (lc.embedding <=> $1::vector) AS score
    FROM law_chunks lc
    JOIN laws l ON l.id = lc.law_id
    ${whereClause}
    ORDER BY lc.embedding <=> $1::vector
    LIMIT $2;
  `;

    const t0 = Date.now();
    const res = await this.pool.query<LawChunkRow>(sql, params);
    const ms = Date.now() - t0;

    // ✅ actionable log (after res/ms exist)
    this.logger?.log?.(
      `[PG][vector] ms=${ms} rows=${res.rowCount} lawId=${lawId ?? 'ALL'} limit=${limit}`,
    );

    // Optional: if slow, run explain occasionally (guarded by env var)
    const explainEnabled = process.env.PG_EXPLAIN_VECTOR === '1';
    const slowThreshold = +(process.env.PG_SLOW_MS || 250);

    if (explainEnabled && ms >= slowThreshold) {
      try {
        const explainSql = `EXPLAIN (ANALYZE, BUFFERS) ${sql}`;
        const ex = await this.pool.query(explainSql, params);
        const plan = ex.rows.map((r: any) => r['QUERY PLAN']).join('\n');

        this.logger?.warn?.(`[PG][vector][EXPLAIN] slow ms=${ms}\n${plan}`);
      } catch (e: any) {
        this.logger?.error?.(
          `[PG][vector][EXPLAIN] failed: ${e?.message || e}`,
          e?.stack,
        );
      }
    }

    return res.rows;
  }

  async findChunksByEmbeddingForLaws(
    embedding: number[],
    limit: number,
    lawIds?: number[],
  ): Promise<LawChunkRow[]> {
    const embeddingLiteral = toSql(embedding);

    const hasLawIds = Array.isArray(lawIds) && lawIds.length > 0;

    const sqlAll = `
    SELECT
      lc.id,
      lc.law_id,
      lc.chunk_index,
      lc.chunk_text,
      l.law_title,
      l.list_title,
      l.source_url,
      l.ldoc_id,
      (lc.embedding <=> $1::vector) AS score
    FROM law_chunks lc
    JOIN laws l ON l.id = lc.law_id
    ORDER BY lc.embedding <=> $1::vector
    LIMIT $2;
  `;

    const sqlFiltered = `
    SELECT
      lc.id,
      lc.law_id,
      lc.chunk_index,
      lc.chunk_text,
      l.law_title,
      l.list_title,
      l.source_url,
      l.ldoc_id,
      (lc.embedding <=> $1::vector) AS score
    FROM law_chunks lc
    JOIN laws l ON l.id = lc.law_id
    WHERE lc.law_id = ANY($3::int[])
    ORDER BY lc.embedding <=> $1::vector
    LIMIT $2;
  `;

    const sql = hasLawIds ? sqlFiltered : sqlAll;
    const params = hasLawIds
      ? [embeddingLiteral, limit, lawIds]
      : [embeddingLiteral, limit];

    const t0 = Date.now();
    const res = await this.pool.query<LawChunkRow>(sql, params);
    const ms = Date.now() - t0;

    this.logger?.log?.(
      `[PG][vector][BATCH] ms=${ms} rows=${res.rowCount} laws=${hasLawIds ? lawIds!.length : 'ALL'} limit=${limit}`,
    );

    return res.rows;
  }
}
