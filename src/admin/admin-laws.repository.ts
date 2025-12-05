// legal/admin-laws.repository.ts
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  LawListItemDto,
  LawDetailDto,
  LawChunkDto,
  AdminLawsStatsDto,
} from '../legal/dto/admin-laws.dto';

@Injectable()
export class AdminLawsRepository {
  private readonly pgPool: Pool;

  constructor() {
    this.pgPool = new Pool({
      connectionString: process.env.PG_CONNECTION_STRING, // adjust name to your env var
      // or host/port/user/password/database if you prefer
    });
  }

  async findLaws(params: {
    q?: string;
    hasChunks?: boolean | null;
    page: number;
    pageSize: number;
  }): Promise<{ items: LawListItemDto[]; total: number }> {
    const { q, hasChunks, page, pageSize } = params;

    const values: any[] = [];
    const whereParts: string[] = [];
    const havingParts: string[] = [];

    if (q && q.trim()) {
      values.push(`%${q.trim()}%`);
      const idx = values.length;
      whereParts.push(
        `(l.law_title ILIKE $${idx} OR l.list_title ILIKE $${idx} OR CAST(l.ldoc_id AS text) ILIKE $${idx})`,
      );
    }

    if (hasChunks === true) {
      havingParts.push('COUNT(c.id) > 0');
    } else if (hasChunks === false) {
      havingParts.push('COUNT(c.id) = 0');
    }

    const whereSql = whereParts.length
      ? `WHERE ${whereParts.join(' AND ')}`
      : '';
    const havingSql = havingParts.length
      ? `HAVING ${havingParts.join(' AND ')}`
      : '';

    const countSql = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT l.id
        FROM laws l
        LEFT JOIN law_chunks c ON c.law_id = l.id
        ${whereSql}
        GROUP BY l.id
        ${havingSql}
      ) sub;
    `;
    const countRes = await this.pgPool.query(countSql, values);
    const total = Number(countRes.rows[0]?.total ?? 0);

    const offset = (page - 1) * pageSize;
    values.push(pageSize, offset);
    const limitIdx = values.length - 1;

    const listSql = `
  SELECT
    l.id,
    l.ldoc_id,
    l.law_title,
    l.list_title,
    l.source_url,
    COUNT(c.id) AS chunk_count,
    CASE 
      WHEN l.law_title ILIKE 'Правилник%' 
        OR l.list_title ILIKE 'Правилник%' 
      THEN 'PRAVILNIK'
      ELSE 'LAW'
    END AS doc_type
  FROM laws l
  LEFT JOIN law_chunks c ON c.law_id = l.id
  ${whereSql}
  GROUP BY l.id, l.ldoc_id, l.law_title, l.list_title, l.source_url
  ${havingSql}
  ORDER BY l.law_title
  LIMIT $${limitIdx} OFFSET $${limitIdx + 1};
`;
    const listRes = await this.pgPool.query(listSql, values);

    const items: LawListItemDto[] = listRes.rows.map((row) => ({
      id: row.id,
      ldocId: row.ldoc_id,
      lawTitle: row.law_title,
      listTitle: row.list_title,
      sourceUrl: row.source_url,
      chunkCount: Number(row.chunk_count),
      docType: (row.doc_type as 'LAW' | 'PRAVILNIK' | 'OTHER') ?? 'OTHER',
    }));

    return { items, total };
  }

  async findLawDetail(id: number): Promise<LawDetailDto | null> {
    const lawSql = `
      SELECT
        l.id,
        l.ldoc_id,
        l.law_title,
        l.list_title,
        l.source_url,
        COUNT(c.id) AS chunk_count
      FROM laws l
      LEFT JOIN law_chunks c ON c.law_id = l.id
      WHERE l.id = $1
      GROUP BY l.id, l.ldoc_id, l.law_title, l.list_title, l.source_url;
    `;
    const lawRes = await this.pgPool.query(lawSql, [id]);
    const row = lawRes.rows[0];
    if (!row) return null;

    const chunksSql = `
      SELECT id, chunk_index, content
      FROM law_chunks
      WHERE law_id = $1
      ORDER BY chunk_index ASC;
    `;
    const chunksRes = await this.pgPool.query(chunksSql, [id]);

    const chunks: LawChunkDto[] = chunksRes.rows.map((c) => ({
      id: c.id,
      index: c.chunk_index,
      content: c.content,
    }));

    return {
      id: row.id,
      ldocId: row.ldoc_id,
      lawTitle: row.law_title,
      listTitle: row.list_title,
      sourceUrl: row.source_url,
      chunkCount: Number(row.chunk_count),
      chunks,
    };
  }

  async getStats(): Promise<AdminLawsStatsDto> {
    // subquery: each law with its chunk_count + derived doc_type
    const baseSql = `
      SELECT
        l.id,
        COUNT(c.id) AS chunk_count,
        CASE 
          WHEN l.law_title ILIKE 'Правилник%' 
            OR l.list_title ILIKE 'Правилник%' 
          THEN 'PRAVILNIK'
          ELSE 'LAW'
        END AS doc_type
      FROM laws l
      LEFT JOIN law_chunks c ON c.law_id = l.id
      GROUP BY l.id, l.law_title, l.list_title
    `;

    // totals
    const totalsSql = `
      SELECT
        COUNT(*) AS total_laws,
        SUM(CASE WHEN chunk_count > 0 THEN 1 ELSE 0 END) AS total_with_chunks,
        SUM(CASE WHEN chunk_count = 0 THEN 1 ELSE 0 END) AS total_without_chunks
      FROM (${baseSql}) t;
    `;
    const totalsRes = await this.pgPool.query(totalsSql);
    const t = totalsRes.rows[0];

    // by type
    const byTypeSql = `
      SELECT doc_type, COUNT(*) AS cnt
      FROM (${baseSql}) t
      GROUP BY doc_type;
    `;
    const byTypeRes = await this.pgPool.query(byTypeSql);

    const byType: AdminLawsStatsDto['byType'] = {
      LAW: 0,
      PRAVILNIK: 0,
      OTHER: 0,
    };

    for (const row of byTypeRes.rows) {
      const key = row.doc_type as 'LAW' | 'PRAVILNIK' | 'OTHER';
      if (byType[key] !== undefined) {
        byType[key] = Number(row.cnt);
      } else {
        byType.OTHER += Number(row.cnt);
      }
    }

    return {
      totalLaws: Number(t.total_laws),
      totalWithChunks: Number(t.total_with_chunks),
      totalWithoutChunks: Number(t.total_without_chunks),
      byType,
    };
  }
}
