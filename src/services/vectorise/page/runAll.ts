import { logger } from '@/lib/logger';
import { isNeo4jAvailable } from '@/lib/db/neo4j';
import type { VectoriseStageResult } from '../shared/types';
import { pickPagesNeedingVectorisation } from './neo4j';
import { vectorisePageStage } from './stage';

const DEFAULT_PICK_BATCH = 200;

export interface RunAllPageVectorisationOptions {
  /** Max slugs loaded per outer loop (inner loop runs until queue empty). */
  pickBatchSize?: number;
  onProgress?: (slug: string, result: VectoriseStageResult) => void;
}

export interface RunAllPageVectorisationResult {
  vectorised: number;
  skipped: number;
  failed: number;
  rounds: number;
}

export async function runAllPagesVectorisation(
  options: RunAllPageVectorisationOptions = {}
): Promise<RunAllPageVectorisationResult> {
  const pickBatchSize = options.pickBatchSize ?? DEFAULT_PICK_BATCH;
  const counts = { vectorised: 0, skipped: 0, failed: 0, rounds: 0 };

  const neo4jReady = await isNeo4jAvailable();
  if (!neo4jReady) {
    logger.warn('Neo4j not available. Skipping page vectorise run.');
    return counts;
  }

  while (true) {
    const slugs = await pickPagesNeedingVectorisation(pickBatchSize);
    if (slugs.length === 0) {
      break;
    }

    counts.rounds += 1;
    logger.info('Page vectorise batch', { round: counts.rounds, count: slugs.length });

    for (const slug of slugs) {
      const result = await vectorisePageStage(slug);
      options.onProgress?.(slug, result);
      if (result === 'vectorised') counts.vectorised += 1;
      else if (result === 'skipped') counts.skipped += 1;
      else counts.failed += 1;
    }
  }

  return counts;
}
