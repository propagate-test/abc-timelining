import axios from 'axios';
import { organisingDomainForTopic } from '@organising-config';
import { logger } from '@/lib/logger';

type WebhookPayload = {
  message?: {
    reply_to_message?: {
      forum_topic_created?: {
        name?: string;
      };
    };
  };
};

export function topicFromWebhookPayload(payload: WebhookPayload): string | undefined {
  return payload.message?.reply_to_message?.forum_topic_created?.name;
}

export { organisingDomainForTopic };

export async function forwardToOrganisingWebhook(
  domain: string,
  path: string,
  payload: unknown
): Promise<void> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `https://${domain}${normalizedPath}`;

  try {
    await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });
    logger.info('Forwarded message to organising webhook', { domain });
  } catch (error) {
    logger.error('Failed to forward message to organising webhook', { domain, error });
  }
}
