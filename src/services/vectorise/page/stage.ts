import { logger } from '@/lib/logger';
import { fetchDocsPageContent } from '@/services/docs/client';
import { chunkText } from '../shared/chunk';
import { embedTexts } from '../shared/embed';
import type { VectoriseStageResult } from '../shared/types';
import { markPageVectoriseSkipped, markPageVectorised, upsertPageChunks } from './neo4j';
import type { PageVectoriseSkipReason } from './types';
import type { PageChunkInput } from './types';

function tokenCount(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

function buildPageChunkInputs(slug: string, chunks: string[], embeddings: number[][]): PageChunkInput[] {
  return chunks.map((content, chunk_index) => ({
    id: `${slug}::chunk::${chunk_index}`,
    content,
    embedding: embeddings[chunk_index],
    chunk_index,
    token_count: tokenCount(content),
  }));
}

async function skipPageWithoutVectorisableContent(
  slug: string,
  reason: PageVectoriseSkipReason
): Promise<VectoriseStageResult> {
  logger.warn('Page has no vectorisable content, skipping', { slug, reason });
  await markPageVectoriseSkipped(slug, reason);
  return 'skipped';
}

export async function vectorisePageStage(slug: string): Promise<VectoriseStageResult> {
  try {
    const content = await fetchDocsPageContent(slug);

    if (content === null) {
      return skipPageWithoutVectorisableContent(slug, 'not_found');
    }

    if (!content.trim()) {
      return skipPageWithoutVectorisableContent(slug, 'empty');
    }

    const chunks = await chunkText(content);
    if (chunks.length === 0) {
      return skipPageWithoutVectorisableContent(slug, 'no_chunks');
    }

    const embeddings = await embedTexts(chunks);
    const chunkInputs = buildPageChunkInputs(slug, chunks, embeddings);

    await upsertPageChunks(slug, chunkInputs);
    await markPageVectorised(slug);
    logger.info('Page vectorised', { slug, chunkCount: chunks.length });
    return 'vectorised';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Page vectorise stage failed', { slug, error: message });
    return 'failed';
  }
}
