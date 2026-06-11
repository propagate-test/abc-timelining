import {
  INGEST_FAILED_QUEUE,
  RESOLVE_FAILED_QUEUE,
  TRANSCRIBE_FAILED_QUEUE,
} from '@organising-config';
import {
  countIngestFailed,
  popIngestFailed,
  pushIngestFailed,
  pushResolveFailed,
  pushTranscribeFailed,
} from '@/services/pipeline/failed-queue';

const store: Record<string, string[]> = {
  [INGEST_FAILED_QUEUE]: [],
  [TRANSCRIBE_FAILED_QUEUE]: [],
  [RESOLVE_FAILED_QUEUE]: [],
};

jest.mock('@/lib/redis', () => ({
  redis: {
    lpush: jest.fn(async (key: string, value: string) => {
      store[key].unshift(value);
      return store[key].length;
    }),
    rpop: jest.fn(async (key: string) => {
      return store[key].pop() ?? null;
    }),
    llen: jest.fn(async (key: string) => store[key].length),
  },
}));

describe('failed-queue', () => {
  beforeEach(() => {
    store[INGEST_FAILED_QUEUE] = [];
    store[TRANSCRIBE_FAILED_QUEUE] = [];
    store[RESOLVE_FAILED_QUEUE] = [];
  });

  it('pushes and pops ingest failed records', async () => {
    await pushIngestFailed('{"message":{}}', 'neo4j error', 42);
    expect(await countIngestFailed()).toBe(1);

    const record = await popIngestFailed();
    expect(record).toMatchObject({
      raw: '{"message":{}}',
      error: 'neo4j error',
      messageId: 42,
    });
    expect(await countIngestFailed()).toBe(0);
  });

  it('pushes transcribe and resolve failed records', async () => {
    await pushTranscribeFailed('voice-1', 'whisper failed', 'entry-1');
    await pushResolveFailed('entry-1', '_botAgendar', 'http_502');

    const transcribe = await store[TRANSCRIBE_FAILED_QUEUE][0];
    const resolve = await store[RESOLVE_FAILED_QUEUE][0];

    expect(JSON.parse(transcribe)).toMatchObject({
      voiceId: 'voice-1',
      error: 'whisper failed',
      entryId: 'entry-1',
    });
    expect(JSON.parse(resolve)).toMatchObject({
      entryId: 'entry-1',
      topic: '_botAgendar',
      error: 'http_502',
    });
  });
});
