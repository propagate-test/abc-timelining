import { isNeo4jAvailable, initDriver } from '@/lib/db/neo4j';
import type { DocsIngestResult, DocsIngestStats, PageSnapshotEntry } from '@/lib/db/models/page';
import { logger } from '@/lib/logger';
import { fetchDocsSnapshot } from './client';
import { isDocsChecksumCurrent } from './pageVerify';
import {
  getDocsPageChecksums,
  syncDocsPagesFromSnapshotBatch,
  writeDocsIngestRun,
} from './pageService';

export interface RunDocsIngestOptions {
  batchSize?: number;
}

export interface ChangedPagesBatchSelection {
  batch: PageSnapshotEntry[];
  totalChanged: number;
  created: number;
  updated: number;
}

const DEFAULT_INGEST_BATCH_SIZE = 40;

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

/** Select changed/missing pages globally, then cap to batch size. */
export function selectChangedPagesBatch(
  pages: PageSnapshotEntry[],
  checksums: Map<string, string | null>,
  batchSize: number
): ChangedPagesBatchSelection {
  const needingSync: PageSnapshotEntry[] = [];
  let created = 0;
  let updated = 0;

  for (const page of pages) {
    const existingChecksum = checksums.get(page.slug) ?? null;
    if (isDocsChecksumCurrent(existingChecksum, page.checksum)) {
      continue;
    }

    needingSync.push(page);
    if (existingChecksum === null) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  return {
    batch: needingSync.slice(0, batchSize),
    totalChanged: needingSync.length,
    created,
    updated,
  };
}

function createEmptyStats(): DocsIngestStats {
  return {
    pages_checked: 0,
    pages_updated: 0,
    pages_created: 0,
  };
}

export async function runDocsIngest(options: RunDocsIngestOptions = {}): Promise<DocsIngestResult> {
  const emptyStats = createEmptyStats();

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
    const totalPages = pages.length;
    const batchSize = parseBatchSize(options.batchSize);

    const driver = await initDriver();
    const session = driver.session({ database: 'neo4j' });

    try {
      const existingChecksums = await getDocsPageChecksums(
        pages.map((page) => page.slug),
        session
      );

      const selection = selectChangedPagesBatch(pages, existingChecksums, batchSize);
      const batchCreated = selection.batch.filter(
        (page) => existingChecksums.get(page.slug) == null
      ).length;
      const batchUpdated = selection.batch.length - batchCreated;

      const stats: DocsIngestStats = {
        pages_checked: totalPages,
        pages_created: batchCreated,
        pages_updated: batchUpdated,
      };

      await syncDocsPagesFromSnapshotBatch(selection.batch, session);
      const ingestRunId = await writeDocsIngestRun(stats, session);

      const changedPagesSynced = selection.batch.length;
      const changedPagesRemaining = Math.max(0, selection.totalChanged - changedPagesSynced);
      const hasMore = changedPagesRemaining > 0;

      logger.info('Docs ingest complete', {
        stats,
        ingestRunId,
        batchSize,
        totalPages,
        changedPagesTotal: selection.totalChanged,
        changedPagesSynced,
        changedPagesRemaining,
        hasMore,
      });

      return {
        status: 'success',
        stats,
        ingestRunId,
        hasMore,
        totalPages,
        changedPagesTotal: selection.totalChanged,
        changedPagesSynced,
        changedPagesRemaining,
      };
    } finally {
      await session.close();
    }
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
