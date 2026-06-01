import { isNeo4jAvailable } from '@/lib/db/neo4j';
import type { DocsIngestResult, DocsIngestStats } from '@/lib/db/models/page';
import { logger } from '@/lib/logger';
import { fetchDocsSnapshot } from './client';
import { isDocsChecksumCurrent } from './pageVerify';
import {
  getDocsPageChecksums,
  syncDocsPageFromSnapshot,
  writeDocsIngestRun,
} from './pageService';

export interface RunDocsIngestOptions {
  cursor?: number;
  batchSize?: number;
}

const DEFAULT_INGEST_BATCH_SIZE = 20;

function parseBatchSize(batchSize?: number): number {
  if (typeof batchSize === 'number' && Number.isFinite(batchSize) && batchSize > 0) {
    return Math.max(1, Math.floor(batchSize));
  }

  const envBatch = Number.parseInt(process.env.DOCS_INGEST_BATCH_SIZE ?? '', 10);
  if (Number.isFinite(envBatch) && envBatch > 0) {
    return Math.max(1, envBatch);
  }

  return DEFAULT_INGEST_BATCH_SIZE;
}

export async function runDocsIngest(options: RunDocsIngestOptions = {}): Promise<DocsIngestResult> {
  const emptyStats: DocsIngestStats = {
    pages_checked: 0,
    pages_updated: 0,
    pages_created: 0,
  };

  const neo4jReady = await isNeo4jAvailable();
  if (!neo4jReady) {
    logger.warn('Neo4j not available. Skipping docs ingest.');
    return {
      status: 'skipped',
      message: 'Neo4j not configured.',
      stats: emptyStats,
    };
  }

  try {
    const pages = (await fetchDocsSnapshot()).sort((a, b) => a.slug.localeCompare(b.slug));
    const batchSize = parseBatchSize(options.batchSize);
    const totalPages = pages.length;
    const safeCursor =
      typeof options.cursor === 'number' && Number.isFinite(options.cursor) && options.cursor > 0
        ? Math.floor(options.cursor)
        : 0;
    const start = Math.min(safeCursor, totalPages);
    const end = Math.min(start + batchSize, totalPages);
    const batch = pages.slice(start, end);

    const stats: DocsIngestStats = {
      pages_checked: batch.length,
      pages_updated: 0,
      pages_created: 0,
    };

    const existingChecksums = await getDocsPageChecksums(batch.map((page) => page.slug));

    for (const page of batch) {
      const existingChecksum = existingChecksums.get(page.slug) ?? null;

      if (isDocsChecksumCurrent(existingChecksum, page.checksum)) {
        continue;
      }

      const isNew = existingChecksum === null;
      await syncDocsPageFromSnapshot(page);

      if (isNew) {
        stats.pages_created += 1;
      } else {
        stats.pages_updated += 1;
      }
    }

    const ingestRunId = await writeDocsIngestRun(stats);
    logger.info('Docs ingest complete', { stats, ingestRunId });

    const hasMore = end < totalPages;

    return {
      status: 'success',
      stats,
      ingestRunId,
      hasMore,
      nextCursor: hasMore ? end : undefined,
      totalPages,
      processedPages: batch.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Docs ingest failed', { error: message });
    return {
      status: 'error',
      message,
      stats: emptyStats,
    };
  }
}
