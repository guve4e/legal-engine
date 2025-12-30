import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { toSql } from 'pgvector';

export interface LawRow {
  id: number;
  ldoc_id: string;
  law_title: string;
  list_title: string;
  source_url: string;
  content_hash: string | null;
  scraped_at: string | null;
  chunked_at: string | null;
  embedded_at: string | null;
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

export type LawRegistryRow = {
  ldoc_id: string;
  title: string;
  source_url: string;
  last_content_hash: string | null;
};

@Injectable()
export class PgLegalRepository {
  constructor(
    @Inject('PG_POOL')
    private readonly pool: Pool,
    @Inject('LOGGER_SERVICE') private readonly logger: any,
  ) {}

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

  async listLaws(): Promise<LawRow[]> {
    const sql = `
      SELECT id, ldoc_id, law_title, list_title, source_url, content_hash, scraped_at, chunked_at, embedded_at
      FROM laws
      ORDER BY law_title;
    `;
    const res = await this.pool.query<LawRow>(sql);
    return res.rows;
  }

  // ---------------------------
  // Registry helpers (NEW)
  // ---------------------------

  /**
   * Returns registry docs that are ready for ingestion:
   * - expected=true
   * - scraped=true (parsed JSON should exist)
   * - embedded=false (pending embed)
   *
   * We intentionally DO NOT include "has error" rows unless you want retries.
   * If you want to include them, remove the last_error predicate.
   */
  async listRegistryToIngest(limit = 1): Promise<LawRegistryRow[]> {
    const n = Math.max(1, Number(limit || 1));

    const sql = `
      SELECT ldoc_id, title, source_url, last_content_hash
      FROM law_registry
      WHERE expected = true
        AND scraped = true
        AND embedded = false
      ORDER BY
        -- oldest ingested first (or never ingested)
        COALESCE(last_ingested_at, to_timestamp(0)) ASC,
        -- stable tie-break
        ldoc_id ASC
      LIMIT $1;
    `;

    const res = await this.pool.query<LawRegistryRow>(sql, [n]);
    return res.rows;
  }

  async markRegistryIngestedOk(ldocId: string, contentHash: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE law_registry
      SET ingested = true,
          embedded = true,
          last_content_hash = $2,
          last_ingested_at = now(),
          last_error = NULL,
          updated_at = now()
      WHERE ldoc_id = $1;
      `,
      [ldocId, contentHash],
    );
  }

  async markRegistryIngestedError(ldocId: string, err: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE law_registry
      SET
          ingested = false,
          embedded = false,
          last_error = $2,
          updated_at = now()
      WHERE ldoc_id = $1;
      `,
      [ldocId, err],
    );
  }

  // ---------------------------
  // Ingestion helpers
  // ---------------------------

  async getLawByLdocId(ldocId: string): Promise<LawRow | null> {
    const res = await this.pool.query<LawRow>(
      `
      SELECT id, ldoc_id, law_title, list_title, source_url, content_hash, scraped_at, chunked_at, embedded_at
      FROM laws
      WHERE ldoc_id = $1
      LIMIT 1;
      `,
      [ldocId],
    );
    return res.rows[0] ?? null;
  }

  async upsertLawForIngestion(input: {
    ldocId: string;
    listTitle: string;
    lawTitle: string;
    sourceUrl: string;
    contentHash: string;
  }): Promise<number> {
    const res = await this.pool.query<{ id: number }>(
      `
      INSERT INTO laws (ldoc_id, list_title, law_title, source_url, content_hash, scraped_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (ldoc_id) DO UPDATE
        SET list_title   = EXCLUDED.list_title,
            law_title    = EXCLUDED.law_title,
            source_url   = EXCLUDED.source_url,
            content_hash = EXCLUDED.content_hash,
            scraped_at   = now()
      RETURNING id;
      `,
      [
        input.ldocId,
        input.listTitle,
        input.lawTitle,
        input.sourceUrl,
        input.contentHash,
      ],
    );
    return res.rows[0].id;
  }

  async replaceLawChunks(
    lawId: number,
    chunks: { index: number; text: string; embedding: number[] }[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM law_chunks WHERE law_id = $1;', [lawId]);
      await client.query(
        'UPDATE laws SET chunked_at = now(), embedded_at = NULL WHERE id = $1;',
        [lawId],
      );

      if (chunks.length > 0) {
        const BATCH = 200;

        for (let start = 0; start < chunks.length; start += BATCH) {
          const batch = chunks.slice(start, start + BATCH);

          const valuesSql: string[] = [];
          const params: any[] = [];
          let p = 1;

          for (const c of batch) {
            const embLiteral = toSql(c.embedding);
            valuesSql.push(`($${p++}, $${p++}, $${p++}, $${p++}::vector)`);
            params.push(lawId, c.index, c.text, embLiteral);
          }

          await client.query(
            `
            INSERT INTO law_chunks (law_id, chunk_index, chunk_text, embedding)
            VALUES ${valuesSql.join(', ')};
            `,
            params,
          );
        }
      }

      await client.query('UPDATE laws SET embedded_at = now() WHERE id = $1;', [
        lawId,
      ]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ---------------------------
  // Vector search
  // ---------------------------

  async findChunksByEmbedding(
    embedding: number[],
    limit = 10,
    lawId?: number,
  ): Promise<LawChunkRow[]> {
    const embeddingLiteral = toSql(embedding);

    const params: any[] = [embeddingLiteral, limit];

    const whereClause = lawId ? 'WHERE lc.law_id = $3' : '';
    if (lawId) params.push(lawId);

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

    this.logger?.log?.(
      `[PG][vector] ms=${ms} rows=${res.rowCount} lawId=${lawId ?? 'ALL'} limit=${limit}`,
    );

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