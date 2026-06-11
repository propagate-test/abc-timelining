import { NextRequest } from 'next/server';

jest.mock('@/services/ingest', () => ({
  runIngest: jest.fn(),
}));

jest.mock('@/services/pipeline/retry', () => ({
  runIngestRetry: jest.fn((opts) => {
    const { runIngest } = jest.requireMock('@/services/ingest');
    return runIngest({ ...opts, mode: 'retry' });
  }),
}));

import { GET, POST } from '@/app/api/story/ingest/route';
import { runIngest } from '@/services/ingest';

const mockedRunIngest = runIngest as jest.MockedFunction<typeof runIngest>;

describe('API /api/story/ingest', () => {
  const originalToken = process.env.PRIVATE_API_TOKEN;

  beforeEach(() => {
    mockedRunIngest.mockReset();
    process.env.PRIVATE_API_TOKEN = 'test-token';
  });

  afterAll(() => {
    process.env.PRIVATE_API_TOKEN = originalToken;
  });

  it('returns 401 for unauthenticated POST requests', async () => {
    const req = new NextRequest('http://localhost/api/story/ingest', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockedRunIngest).not.toHaveBeenCalled();
  });

  it('calls runIngestRetry for cron GET without explicit mode', async () => {
    const fakeResult = {
      status: 'success',
      processed_count: 1,
    };
    mockedRunIngest.mockResolvedValue(fakeResult);

    const req = new NextRequest('http://localhost/api/story/ingest', {
      method: 'GET',
      headers: { 'x-vercel-cron': '1' },
    });
    const res = await GET(req);

    expect(mockedRunIngest).toHaveBeenCalledWith({
      origin: 'http://localhost',
      limit: 10,
      mode: 'retry',
    });
    expect(res.status).toBe(200);
  });

  it('calls runIngest and returns result for chain GET', async () => {
    const fakeResult = {
      status: 'success',
      processed_count: 5,
    };
    mockedRunIngest.mockResolvedValue(fakeResult);

    const req = new NextRequest('http://localhost/api/story/ingest?mode=chain&limit=1', {
      method: 'GET',
      headers: { 'x-vercel-cron': '1' },
    });
    const res = await GET(req);

    expect(mockedRunIngest).toHaveBeenCalledWith({
      origin: 'http://localhost',
      limit: 1,
      mode: 'chain',
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      status: 'Ingest executed',
      result: fakeResult,
    });
  });

  it('calls runIngest for authenticated POST', async () => {
    const fakeResult = { status: 'success', processed_count: 1 };
    mockedRunIngest.mockResolvedValue(fakeResult);

    const req = new NextRequest('http://localhost/api/story/ingest', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
    const res = await POST(req);

    expect(mockedRunIngest).toHaveBeenCalledWith({
      origin: 'http://localhost',
      limit: undefined,
      mode: 'batch',
    });
    expect(res.status).toBe(200);
  });

  it('should handle runIngest errors gracefully', async () => {
    mockedRunIngest.mockRejectedValue(new Error('Something failed'));

    const res = await GET(
      new NextRequest('http://localhost/api/story/ingest', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })
    );

    expect(res.status).toBe(500);
  });
});
