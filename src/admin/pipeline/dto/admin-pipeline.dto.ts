// ============================================================================
// FILE: src/admin/pipeline/dto/admin-pipeline.dto.ts
// ============================================================================

export type RegistryDocType = 'LAW' | 'KODEKS' | 'NAREDBA' | 'PRAVILNIK';

export interface AdminPipelineStatsDto {
  registry: {
    total: number;
    expected: number;
    scraped: number;
    embedded: number;
    pendingEmbed: number;
    errors: number;
    notScraped: number;
    notExpected: number;
  };
  lawsTable: {
    total: number;
    withChunks: number;
    withoutChunks: number;
  };
  chunksTable: {
    totalChunks: number;
    distinctLaws: number;
  };
}

export interface AdminRegistryQueueItemDto {
  id: number;
  ldocId: number;
  title: string;
  docType: RegistryDocType;
  sourceUrl: string;
  expected: boolean;
  scraped: boolean;
  embedded: boolean;
  lastSeenAt: string | null;
  lastIngestedAt: string | null;
  lastContentHash: string | null;
  lastError: string | null;
}

export interface AdminRegistryQueueDto {
  page: number;
  pageSize: number;
  total: number;
  items: AdminRegistryQueueItemDto[];
}

export type RegistryQueueFilter =
  | 'pending-embed' // expected=true, scraped=true, embedded=false
  | 'not-scraped'   // expected=true, scraped=false
  | 'errors'        // last_error not null
  | 'all';


export type PipelineRegistryState =
  | 'all'
  | 'pending'
  | 'scraped'
  | 'embedded'
  | 'failed'
  | 'missing'
  | 'errors';

export interface AdminPipelineRegistryRowDto {
  id: number;
  ldocId: number;
  title: string;
  docType: string;
  sourceUrl: string;
  expected: boolean;
  scraped: boolean;
  embedded: boolean;
  lastError: string | null;
  lastSeenAt: string | null;
  lastIngestedAt: string | null;
}

export interface AdminPipelineRegistryListDto {
  items: AdminPipelineRegistryRowDto[];
  page: number;
  pageSize: number;
  total: number;
}