import { triggerResolve } from '@/services/resolve/triggerResolve';
import { dispatchOrganisingResolve } from '@/services/webhook/dispatchOrganisingResolve';
import { pushResolveFailed } from '@/services/pipeline/failed-queue';
import { logger } from '@/lib/logger';

jest.mock('@/services/webhook/dispatchOrganisingResolve', () => ({
  dispatchOrganisingResolve: jest.fn(),
}));

jest.mock('@/services/pipeline/failed-queue', () => ({
  pushResolveFailed: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedDispatch = dispatchOrganisingResolve as jest.MockedFunction<
  typeof dispatchOrganisingResolve
>;
const mockedPushFailed = pushResolveFailed as jest.MockedFunction<typeof pushResolveFailed>;

describe('triggerResolve', () => {
  beforeEach(() => {
    mockedDispatch.mockReset();
    mockedPushFailed.mockReset();
    jest.clearAllMocks();
  });

  it('no-ops for topics without a resolve route', async () => {
    await triggerResolve('entry-1', '_botEvaluation', { source: 'text' });
    expect(mockedDispatch).not.toHaveBeenCalled();
  });

  it('no-ops when topic is missing', async () => {
    await triggerResolve('entry-1', null, { source: 'text' });
    expect(mockedDispatch).not.toHaveBeenCalled();
  });

  it('dispatches for resolve-enabled topics', async () => {
    mockedDispatch.mockResolvedValue({ dispatched: true, url: 'https://example.com/resolve' });

    await triggerResolve('entry-1', '_botEnrolment', { source: 'text' });

    expect(mockedDispatch).toHaveBeenCalledWith('entry-1', '_botEnrolment');
  });

  it('queues and logs when dispatch fails', async () => {
    mockedDispatch.mockResolvedValue({
      dispatched: false,
      error: 'http_502',
      url: 'https://example.com/resolve',
    });

    await triggerResolve('entry-2', '_botDecidir', { source: 'voice', voiceId: 'voice-1' });

    expect(mockedPushFailed).toHaveBeenCalledWith('entry-2', '_botDecidir', 'http_502');
    expect(logger.warn).toHaveBeenCalledWith(
      'Resolve trigger dispatch failed; queued for retry',
      expect.objectContaining({
        entryId: 'entry-2',
        topic: '_botDecidir',
        source: 'voice',
        voiceId: 'voice-1',
        error: 'http_502',
      })
    );
  });

  it('does not warn when there is no resolve route', async () => {
    mockedDispatch.mockResolvedValue({ dispatched: false, error: 'no_resolve_route' });

    await triggerResolve('entry-3', '_botEnrolment', { source: 'text' });

    expect(mockedPushFailed).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
