import { resolveRouteForTopic } from '@organising-config';
import { logger } from '@/lib/logger';
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
    logger.warn('Resolve trigger dispatch failed; domain app resolve backlog will retry', {
      entryId,
      topic,
      source: context?.source,
      voiceId: context?.voiceId,
      error: result.error,
    });
  }
}
