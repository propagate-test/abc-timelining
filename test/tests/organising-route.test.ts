import {
  buildOrganisingResolveUrl,
  channelSpecForTopic,
  INGEST_BACKLOG_QUEUE,
  INGEST_FAILED_QUEUE,
  organisingDomainForTopic,
  organisingKeyForTopic,
  resolveRouteForTopic,
  resolveTopics,
  webhookRouteForTopic,
} from '@organising-config';
import {
  forwardToOrganisingWebhook,
  organisingDomainForTopic as routeDomainForTopic,
  topicFromWebhookPayload,
} from '@/services/webhook/organisingRoute';

describe('organising config', () => {
  it('defines the ingest backlog queue name', () => {
    expect(INGEST_BACKLOG_QUEUE).toBe('timelining::ingest::backlog');
    expect(INGEST_FAILED_QUEUE).toBe('timelining::ingest::failed');
  });

  it('lists resolve-enabled topics', () => {
    expect(resolveTopics()).toEqual(
      expect.arrayContaining(['_botEnrolment', '_botDecidir', '_botAgendar'])
    );
  });

  it('builds resolve URLs from config', () => {
    expect(
      buildOrganisingResolveUrl('register.prisma.events', '/api/webhook/resolve', 'entry-1')
    ).toBe('https://register.prisma.events/api/webhook/resolve?entryId=entry-1');

    expect(resolveRouteForTopic('_botDecidir')).toEqual({
      domain: 'enact.prisma.events',
      path: '/api/webhook/resolve/decide',
    });

    expect(resolveRouteForTopic('_botAgendar')).toEqual({
      domain: 'enact.prisma.events',
      path: '/api/webhook/resolve/schedule',
    });

    expect(resolveRouteForTopic('_botEnrolment')).toEqual({
      domain: 'register.prisma.events',
      path: '/api/webhook/resolve',
    });
  });

  it('maps configured channels to organising keys', () => {
    expect(organisingKeyForTopic('_botDecidir')).toBe('enact');
    expect(organisingKeyForTopic('_botAgendar')).toBe('enact');
    expect(organisingKeyForTopic('_botEnrolment')).toBe('enrol');
  });

  it('returns organising domains for configured channels', () => {
    expect(organisingDomainForTopic('_botDecidir')).toBe('enact.prisma.events');
    expect(organisingDomainForTopic('_botEnrolment')).toBe('register.prisma.events');
    expect(organisingDomainForTopic('_botDecidiendo')).toBeNull();
  });

  it('returns per-channel webhook routes only where configured', () => {
    expect(webhookRouteForTopic('_botEnrolment')).toEqual({
      domain: 'register.prisma.events',
      path: '/api/webhook',
    });
    expect(webhookRouteForTopic('_botAgendar')).toBeNull();
    expect(webhookRouteForTopic('_botDecidir')).toBeNull();
  });

  it('exposes full channel specs with webhook and resolve', () => {
    expect(channelSpecForTopic('_botEnrolment')).toEqual(
      expect.objectContaining({
        key: 'enrol',
        channel: '_botEnrolment',
        webhook: { path: '/api/webhook' },
        resolve: { path: '/api/webhook/resolve' },
      })
    );
  });
});

describe('organisingRoute', () => {
  it('extracts forum topic from webhook payload', () => {
    expect(
      topicFromWebhookPayload({
        message: {
          reply_to_message: {
            forum_topic_created: { name: '_botDecidir' },
          },
        },
      })
    ).toBe('_botDecidir');
  });

  it('returns organising domains via route helper', () => {
    expect(routeDomainForTopic('_botAgendar')).toBe('enact.prisma.events');
    expect(routeDomainForTopic('_botDecidiendo')).toBeNull();
  });
});

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { ok: true } }),
}));

describe('forwardToOrganisingWebhook', () => {
  it('posts to the app base webhook URL', async () => {
    const axios = jest.requireMock('axios');
    await forwardToOrganisingWebhook('register.prisma.events', '/api/webhook', { message: { id: 1 } });
    expect(axios.post).toHaveBeenCalledWith(
      'https://register.prisma.events/api/webhook',
      { message: { id: 1 } },
      expect.objectContaining({ timeout: 5000 })
    );
  });
});
