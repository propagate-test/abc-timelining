import { resolveRouteForTopic } from '@organising-config';
import { logger } from '@/lib/logger';
import { pushResolveFailed } from '@/services/pipeline/failed-queue';
import { dispatchOrganisingResolve } from '@/services/webhook/dispatchOrganisingResolve';

export interface TriggerResolveContext {
  source: 'text' | 'voice';
  voiceId?: string;
}

export async function triggerResolve(
  entryId: string,
  topic: string | null | undefined,
  context?: TriggerResolveContext
): Promise<void> {
  if (!topic || !resolveRouteForTopic(topic)) {
    return;
  }

  const result = await dispatchOrganisingResolve(entryId, topic);
  if (!result.dispatched && result.error !== 'no_resolve_route') {
    await pushResolveFailed(entryId, topic, result.error ?? 'dispatch_failed');
    logger.warn('Resolve trigger dispatch failed; queued for retry', {
      entryId,
      topic,
      source: context?.source,
      voiceId: context?.voiceId,
      error: result.error,
    });
  }
}
