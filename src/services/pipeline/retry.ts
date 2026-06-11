import { initDriver } from '@/lib/db/neo4j';
import { logger } from '@/lib/logger';
import { dispatchInternalRoute } from '@/lib/internal-dispatch';
import { runIngest } from '@/services/ingest';
import {
  popResolveFailed,
  popTranscribeFailed,
} from '@/services/pipeline/failed-queue';
import { triggerResolve } from '@/services/resolve';
import { transcribeStage } from '@/services/vectorise/voice/transcribe';
import { pickVoiceIdsByStatus } from '@/services/vectorise/voice/neo4j';
import { runVectoriseTick } from '@/services/vectorise/voice/tick';
import neo4j from 'neo4j-driver';

const STALE_PENDING_MS = 2 * 60 * 1000;

export interface IngestRetryResult {
  status: string;
  processed_count?: number;
  failed_count?: number;
  remaining_count?: number;
}

export interface VoiceRetryResult {
  status: string;
  transcribe_retried: number;
  resolve_retried: number;
  vectorised: number;
  failed: number;
}

export async function runIngestRetry(options: {
  origin?: string;
  limit?: number;
}): Promise<IngestRetryResult> {
  return runIngest({
    origin: options.origin,
    limit: options.limit ?? 10,
    mode: 'retry',
  });
}

async function pickStalePendingVoiceIds(limit: number): Promise<string[]> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });
  const cutoff = new Date(Date.now() - STALE_PENDING_MS).toISOString();

  try {
    const result = await session.run(
      `
      MATCH (v:Voice)
      WHERE coalesce(v.processingStatus, 'pending') = 'pending'
        AND v.duration <= 180
      MATCH (e:Entry)-[:HAS_VOICE]->(v)
      WHERE e.date <= datetime($cutoff)
      RETURN v.id AS id
      ORDER BY e.date
      LIMIT $limit
      `,
      { cutoff, limit: neo4j.int(limit) }
    );
    return result.records.map((r) => r.get('id') as string);
  } finally {
    await session.close();
  }
}

async function pickPendingResolveEntryIds(limit: number): Promise<
  Array<{ entryId: string; topic: string | null }>
> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (e:Entry)-[:HAS_VOICE]->(v:Voice)
      WHERE coalesce(e.resolveStatus, 'pending') = 'pending'
        AND coalesce(v.processingStatus, 'pending') = 'transcribed'
      OPTIONAL MATCH (e)-[:FROM_CHAT]->(c:TelegramChat)
      RETURN e.id AS entryId, c.topic AS topic
      LIMIT $limit
      `,
      { limit: neo4j.int(limit) }
    );
    return result.records.map((r) => ({
      entryId: r.get('entryId') as string,
      topic: r.get('topic') as string | null,
    }));
  } finally {
    await session.close();
  }
}

export async function runVoiceVectoriseRetry(options: {
  origin?: string;
  limit?: number;
}): Promise<VoiceRetryResult> {
  const limit = options.limit ?? 5;
  let transcribeRetried = 0;
  let resolveRetried = 0;
  let failed = 0;

  const voiceIds = new Set<string>();

  for (let i = 0; i < limit; i++) {
    const record = await popTranscribeFailed();
    if (record) {
      voiceIds.add(record.voiceId);
    } else {
      break;
    }
  }

  const failedIds = await pickVoiceIdsByStatus('failed', limit);
  for (const id of failedIds) {
    voiceIds.add(id);
  }

  const staleIds = await pickStalePendingVoiceIds(limit);
  for (const id of staleIds) {
    voiceIds.add(id);
  }

  for (const voiceId of voiceIds) {
    if (options.origin) {
      const dispatch = await dispatchInternalRoute(
        options.origin,
        `/api/story/voice-vectorise?voiceId=${encodeURIComponent(voiceId)}&mode=chain`,
        { chain: true }
      );
      if (dispatch.ok) {
        transcribeRetried++;
      } else {
        failed++;
      }
    } else {
      const result = await transcribeStage(voiceId);
      if (result === 'transcribed') {
        transcribeRetried++;
      } else if (result === 'failed') {
        failed++;
      }
    }
  }

  for (let i = 0; i < limit; i++) {
    const record = await popResolveFailed();
    if (!record) break;
    await triggerResolve(record.entryId, record.topic, { source: 'voice' });
    resolveRetried++;
  }

  const pendingResolve = await pickPendingResolveEntryIds(limit);
  for (const { entryId, topic } of pendingResolve) {
    if (!topic) continue;
    await triggerResolve(entryId, topic, { source: 'voice' });
    resolveRetried++;
  }

  const vectorise = await runVectoriseTick();

  logger.info('Voice vectorise retry complete', {
    transcribeRetried,
    resolveRetried,
    vectorised: vectorise.vectorised,
    failed: failed + vectorise.failed,
  });

  return {
    status: 'success',
    transcribe_retried: transcribeRetried,
    resolve_retried: resolveRetried,
    vectorised: vectorise.vectorised,
    failed: failed + vectorise.failed,
  };
}
