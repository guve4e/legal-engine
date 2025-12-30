// ============================================================================
// FILE: src/admin/pipeline/admin-pipeline.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  AdminPipelineStatsDto,
  AdminRegistryQueueDto,
  AdminRegistryQueueItemDto,
  RegistryQueueFilter,
  RegistryDocType,
  PipelineRegistryState,
  AdminPipelineRegistryListDto,
  AdminPipelineRegistryRowDto,
} from './dto/admin-pipeline.dto';

import { latinToCyrillicBg, cyrillicToLatinBg } from './transliterate-bg';

@Injectable()
export class AdminPipelineRepository {
  private readonly pgPool: Pool;

  constructor() {
    this.pgPool = new Pool({
      connectionString: process.env.PG_CONNECTION_STRING,
    });
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Adds a forgiving search predicate for BG titles:
   * - matches input as-is
   * - plus latin->cyr and cyr->latin variants
   *
   * IMPORTANT: this mutates `values` and pushes a full OR-group into `where`.
   */
  private buildSearchWhere(args: {
    q?: string;
    values: any[];
    where: string[];
    includeSourceUrl?: boolean;
  }) {
    const { q, values, where, includeSourceUrl } = args;
    if (!q || !q.trim()) return;

    const q0 = q.trim();
    const qCyr = latinToCyrillicBg(q0);
    const qLat = cyrillicToLatinBg(q0);

    values.push(`%${q0}%`);
    const i1 = values.length;

    const parts: string[] = [
      `title ILIKE $${i1}`,
      `CAST(ldoc_id AS text) ILIKE $${i1}`,
    ];

    if (includeSourceUrl) {
      parts.push(`source_url ILIKE $${i1}`);
    }

    if (qCyr !== q0) {
      values.push(`%${qCyr}%`);
      parts.push(`title ILIKE $${values.length}`);
    }

    if (qLat !== q0) {
      values.push(`%${qLat}%`);
      parts.push(`title ILIKE $${values.length}`);
    }

    where.push(`(${parts.join(' OR ')})`);
  }

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  async getStats(): Promise<AdminPipelineStatsDto> {
    const registrySql = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE expected = true)::int AS expected,
        COUNT(*) FILTER (WHERE scraped = true)::int AS scraped,
        COUNT(*) FILTER (WHERE embedded = true)::int AS embedded,
        COUNT(*) FILTER (WHERE expected = true AND scraped = true AND embedded = false)::int AS pending_embed,
        COUNT(*) FILTER (WHERE last_error IS NOT NULL AND last_error <> '')::int AS errors,
        COUNT(*) FILTER (WHERE expected = true AND scraped = false)::int AS not_scraped,
        COUNT(*) FILTER (WHERE expected = false)::int AS not_expected
      FROM law_registry;
    `;

    const lawsSql = `
      WITH per_law AS (
        SELECT l.id, COUNT(c.id) AS chunk_count
        FROM laws l
        LEFT JOIN law_chunks c ON c.law_id = l.id
        GROUP BY l.id
      )
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN chunk_count > 0 THEN 1 ELSE 0 END)::int AS with_chunks,
        SUM(CASE WHEN chunk_count = 0 THEN 1 ELSE 0 END)::int AS without_chunks
      FROM per_law;
    `;

    const chunksSql = `
      SELECT
        COUNT(*)::bigint AS total_chunks,
        COUNT(DISTINCT law_id)::bigint AS distinct_laws
      FROM law_chunks;
    `;

    const [r1, r2, r3] = await Promise.all([
      this.pgPool.query(registrySql),
      this.pgPool.query(lawsSql),
      this.pgPool.query(chunksSql),
    ]);

    const reg = r1.rows[0];
    const laws = r2.rows[0];
    const chunks = r3.rows[0];

    return {
      registry: {
        total: Number(reg.total),
        expected: Number(reg.expected),
        scraped: Number(reg.scraped),
        embedded: Number(reg.embedded),
        pendingEmbed: Number(reg.pending_embed),
        errors: Number(reg.errors),
        notScraped: Number(reg.not_scraped),
        notExpected: Number(reg.not_expected),
      },
      lawsTable: {
        total: Number(laws.total),
        withChunks: Number(laws.with_chunks),
        withoutChunks: Number(laws.without_chunks),
      },
      chunksTable: {
        totalChunks: Number(chunks.total_chunks),
        distinctLaws: Number(chunks.distinct_laws),
      },
    };
  }

  // --------------------------------------------------------------------------
  // Queue list
  // --------------------------------------------------------------------------

  async listRegistryQueue(input: {
    filter: RegistryQueueFilter;
    docType?: RegistryDocType;
    q?: string;
    page: number;
    pageSize: number;
  }): Promise<AdminRegistryQueueDto> {
    const { filter, docType, q, page, pageSize } = input;

    const values: any[] = [];
    const where: string[] = [];

    // search (with translit)
    this.buildSearchWhere({
      q,
      values,
      where,
      includeSourceUrl: true,
    });

    // filter
    if (filter === 'pending-embed') {
      where.push('expected = true AND scraped = true AND embedded = false');
    } else if (filter === 'not-scraped') {
      where.push('expected = true AND scraped = false');
    } else if (filter === 'errors') {
      where.push("last_error IS NOT NULL AND last_error <> ''");
    } else if (filter === 'all') {
      // nothing extra
    }

    // docType
    if (docType) {
      values.push(docType);
      where.push(`doc_type = $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*)::int AS total FROM law_registry ${whereSql};`;
    const totalRes = await this.pgPool.query(countSql, values);
    const total = Number(totalRes.rows[0]?.total ?? 0);

    const offset = (page - 1) * pageSize;
    values.push(pageSize, offset);
    const limitIdx = values.length - 1;

    const listSql = `
      SELECT
        id,
        ldoc_id,
        title,
        doc_type,
        source_url,
        expected,
        scraped,
        embedded,
        last_seen_at,
        last_ingested_at,
        last_content_hash,
        last_error
      FROM law_registry
      ${whereSql}
      ORDER BY
        CASE WHEN expected = true AND scraped = true AND embedded = false THEN 0 ELSE 1 END,
        COALESCE(last_ingested_at, to_timestamp(0)) ASC,
        title ASC
      LIMIT $${limitIdx} OFFSET $${limitIdx + 1};
    `;

    const listRes = await this.pgPool.query(listSql, values);

    const items: AdminRegistryQueueItemDto[] = listRes.rows.map((r) => ({
      id: Number(r.id),
      ldocId: Number(r.ldoc_id),
      title: String(r.title ?? ''),
      docType: (r.doc_type as RegistryDocType) ?? 'LAW',
      sourceUrl: String(r.source_url ?? ''),
      expected: Boolean(r.expected),
      scraped: Boolean(r.scraped),
      embedded: Boolean(r.embedded),
      lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
      lastIngestedAt: r.last_ingested_at
        ? new Date(r.last_ingested_at).toISOString()
        : null,
      lastContentHash: r.last_content_hash ? String(r.last_content_hash) : null,
      lastError: r.last_error ? String(r.last_error) : null,
    }));

    return { page, pageSize, total, items };
  }

  // --------------------------------------------------------------------------
  // Re-embed
  // --------------------------------------------------------------------------

  async markForReembed(ldocId: number): Promise<void> {
    await this.pgPool.query(
      `
      UPDATE law_registry
      SET
        embedded = false,
        ingested = false,
        last_error = NULL,
        updated_at = now()
      WHERE ldoc_id = $1;
      `,
      [ldocId],
    );
  }

  async markForReembedBulk(input: {
    state: PipelineRegistryState;
    limit: number;
    q?: string;
    docType?: string;
  }): Promise<number> {
    const { state, limit, q, docType } = input;

    const values: any[] = [];
    const where: string[] = [];

    // search (with translit)
    this.buildSearchWhere({
      q,
      values,
      where,
      includeSourceUrl: true,
    });

    // docType
    if (docType && docType.trim()) {
      values.push(docType.trim().toUpperCase());
      const i = values.length;
      where.push(`doc_type = $${i}`);
    }

    // state mapping
    switch (state) {
      case 'pending':
        where.push(`expected = true AND scraped = true AND embedded = false`);
        break;
      case 'scraped':
        where.push(`expected = true AND scraped = true`);
        break;
      case 'embedded':
        where.push(`expected = true AND embedded = true`);
        break;
      case 'failed':
      case 'errors':
        where.push(`last_error IS NOT NULL AND last_error <> ''`);
        break;
      case 'missing':
        where.push(`expected = false`);
        break;
      case 'all':
      default:
        break;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    values.push(limit);
    const limitIdx = values.length;

    const sql = `
      WITH todo AS (
        SELECT ldoc_id
        FROM law_registry
        ${whereSql}
        ORDER BY
          COALESCE(last_ingested_at, to_timestamp(0)) ASC,
          COALESCE(last_seen_at, to_timestamp(0)) DESC,
          ldoc_id ASC
        LIMIT $${limitIdx}
      )
      UPDATE law_registry lr
      SET
        embedded = false,
        ingested = false,
        last_error = NULL,
        updated_at = now()
      FROM todo
      WHERE lr.ldoc_id = todo.ldoc_id
      RETURNING lr.ldoc_id;
    `;

    const res = await this.pgPool.query(sql, values);
    return Number(res.rowCount ?? 0);
  }

  // --------------------------------------------------------------------------
  // Registry list
  // --------------------------------------------------------------------------

  async listRegistry(params: {
    page: number;
    pageSize: number;
    state?: PipelineRegistryState;
    q?: string;
    docType?: string;
  }): Promise<AdminPipelineRegistryListDto> {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(params.pageSize || 50)));
    const state: PipelineRegistryState = (params.state || 'all') as any;

    const values: any[] = [];
    const where: string[] = [];

    // search (with translit)
    this.buildSearchWhere({
      q: params.q,
      values,
      where,
      includeSourceUrl: true,
    });

    if (params.docType && params.docType.trim()) {
      values.push(params.docType.trim().toUpperCase());
      const i = values.length;
      where.push(`doc_type = $${i}`);
    }

    switch (state) {
      case 'pending':
        where.push(`expected = true AND scraped = true AND embedded = false`);
        break;
      case 'scraped':
        where.push(`expected = true AND scraped = true`);
        break;
      case 'embedded':
        where.push(`expected = true AND embedded = true`);
        break;
      case 'failed':
      case 'errors':
        where.push(`last_error IS NOT NULL AND last_error <> ''`);
        break;
      case 'missing':
        where.push(`expected = false`);
        break;
      case 'all':
      default:
        break;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM law_registry
      ${whereSql};
    `;
    const countRes = await this.pgPool.query(countSql, values);
    const total = Number(countRes.rows?.[0]?.total ?? 0);

    const offset = (page - 1) * pageSize;
    values.push(pageSize, offset);
    const limitIdx = values.length - 1;

    const listSql = `
      SELECT
        id,
        ldoc_id,
        title,
        doc_type,
        source_url,
        expected,
        scraped,
        embedded,
        last_error,
        last_seen_at,
        last_ingested_at
      FROM law_registry
      ${whereSql}
      ORDER BY
        doc_type ASC,
        title ASC,
        ldoc_id ASC
      LIMIT $${limitIdx} OFFSET $${limitIdx + 1};
    `;

    const listRes = await this.pgPool.query(listSql, values);

    const items: AdminPipelineRegistryRowDto[] = listRes.rows.map((r) => ({
      id: Number(r.id),
      ldocId: Number(r.ldoc_id),
      title: String(r.title ?? ''),
      docType: String(r.doc_type ?? 'UNKNOWN'),
      sourceUrl: String(r.source_url ?? ''),
      expected: Boolean(r.expected),
      scraped: Boolean(r.scraped),
      embedded: Boolean(r.embedded),
      lastError: r.last_error ? String(r.last_error) : null,
      lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
      lastIngestedAt: r.last_ingested_at
        ? new Date(r.last_ingested_at).toISOString()
        : null,
    }));

    return { items, page, pageSize, total };
  }
}