jest.mock('@/services/ingest', () => ({
  runIngest: jest.fn(),
}));

jest.mock('@/services/vectorise/voice/tick', () => ({
  runVectoriseTick: jest.fn(),
}));

jest.mock('@/services/vectorise/voice/transcribe', () => ({
  transcribeStage: jest.fn(),
}));

jest.mock('@/services/vectorise/voice/neo4j', () => ({
  pickVoiceIdsByStatus: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/lib/internal-dispatch', () => ({
  dispatchInternalRoute: jest.fn(),
}));

jest.mock('@/services/pipeline/failed-queue', () => ({
  popTranscribeFailed: jest.fn().mockResolvedValue(null),
  popResolveFailed: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/services/resolve/triggerResolve', () => ({
  triggerResolve: jest.fn(),
}));

jest.mock('@/lib/db/neo4j', () => ({
  initDriver: jest.fn(),
}));

import { runIngestRetry } from '@/services/pipeline/retry';
import { runIngest } from '@/services/ingest';

const mockedRunIngest = runIngest as jest.MockedFunction<typeof runIngest>;

describe('runIngestRetry', () => {
  beforeEach(() => {
    mockedRunIngest.mockReset();
  });

  it('delegates to runIngest with retry mode', async () => {
    mockedRunIngest.mockResolvedValue({
      status: 'success',
      processed_count: 2,
      failed_count: 0,
    });

    const result = await runIngestRetry({ origin: 'https://example.com', limit: 5 });

    expect(mockedRunIngest).toHaveBeenCalledWith({
      origin: 'https://example.com',
      limit: 5,
      mode: 'retry',
    });
    expect(result.processed_count).toBe(2);
  });
});
