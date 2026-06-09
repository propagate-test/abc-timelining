import { runDocsPageVerification } from '@/services/docs/pageVerify';
import { redis } from '@/lib/redis';
import { countPagesNeedingVectorisation } from '@/services/vectorise/page/neo4j';
import {
  countOutstanding as countVoiceOutstanding,
  countPipelineByStatus,
} from '@/services/vectorise/voice/neo4j';
import type { VoicePipelineCounts } from '@/services/vectorise/voice/types';
import { INGEST_BACKLOG_QUEUE } from '@organising-config';

export type PipelineStage = 'ingest' | 'vectorise';

export interface IngestBacklog {
  available: boolean;
  queueName: string;
  queued: number;
}

export interface VoiceVectoriseBacklog {
  outstanding: number;
  counts: VoicePipelineCounts;
}

export interface PageVectoriseBacklog {
  outstanding: number;
}

export interface DocsSyncBacklog {
  totalPages: number;
  fullySynced: number;
  needsAttention: number;
  staleChecksum: number;
  missingFromNeo4j: number;
  noChunks: number;
  pendingVectorise: number;
}

export interface PipelineBacklogSummary {
  ingest: IngestBacklog;
  voice: VoiceVectoriseBacklog;
  page: PageVectoriseBacklog;
  docsSync: DocsSyncBacklog | null;
}

export interface PipelineBacklogOptions {
  includeDocsSync?: boolean;
}

export async function getIngestBacklog(): Promise<IngestBacklog> {
  try {
    const queued = await redis.llen(INGEST_BACKLOG_QUEUE);
    return { available: true, queueName: INGEST_BACKLOG_QUEUE, queued };
  } catch {
    return { available: false, queueName: INGEST_BACKLOG_QUEUE, queued: 0 };
  }
}

export async function getVoiceVectoriseBacklog(): Promise<VoiceVectoriseBacklog> {
  const [outstanding, counts] = await Promise.all([
    countVoiceOutstanding(),
    countPipelineByStatus(),
  ]);
  return { outstanding, counts };
}

export async function getPageVectoriseBacklog(): Promise<PageVectoriseBacklog> {
  const outstanding = await countPagesNeedingVectorisation();
  return { outstanding };
}

export async function getDocsSyncBacklog(): Promise<DocsSyncBacklog | null> {
  if (!process.env.DOCS_APP_URL?.trim()) {
    return null;
  }

  const report = await runDocsPageVerification();
  const { summary } = report;

  return {
    totalPages: summary.totalPages,
    fullySynced: summary.fullySynced,
    needsAttention: summary.needsAttention,
    staleChecksum: summary.staleChecksum,
    missingFromNeo4j: summary.missingFromNeo4j,
    noChunks: summary.noChunks,
    pendingVectorise: summary.pendingVectorise,
  };
}

export async function getPipelineBacklogSummary(
  options: PipelineBacklogOptions = {}
): Promise<PipelineBacklogSummary> {
  const includeDocsSync = options.includeDocsSync ?? true;

  const [ingest, voice, page, docsSync] = await Promise.all([
    getIngestBacklog(),
    getVoiceVectoriseBacklog(),
    getPageVectoriseBacklog(),
    includeDocsSync ? getDocsSyncBacklog() : Promise.resolve(null),
  ]);

  return { ingest, voice, page, docsSync };
}

export function pipelineHasBacklog(summary: PipelineBacklogSummary): boolean {
  if (summary.ingest.available && summary.ingest.queued > 0) return true;
  if (summary.voice.outstanding > 0) return true;
  if (summary.page.outstanding > 0) return true;
  if (summary.docsSync != null && summary.docsSync.needsAttention > 0) return true;
  return false;
}

export function pipelineHasFailures(summary: PipelineBacklogSummary): boolean {
  if (summary.voice.counts.failed > 0) return true;
  return false;
}
