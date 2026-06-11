import { GET, POST } from '@/app/api/story/voice-vectorise/route';
import { runVoiceVectoriseRetry } from '@/services/pipeline/retry';
import { transcribeStage } from '@/services/vectorise/voice/transcribe';
import { NextRequest } from 'next/server';

jest.mock('@/services/pipeline/retry', () => ({
  runVoiceVectoriseRetry: jest.fn(),
}));

jest.mock('@/services/vectorise/voice/transcribe', () => ({
  transcribeStage: jest.fn(),
}));

jest.mock('@/services/pipeline/failed-queue', () => ({
  pushTranscribeFailed: jest.fn(),
}));

const mockedRetry = runVoiceVectoriseRetry as jest.MockedFunction<typeof runVoiceVectoriseRetry>;
const mockedTranscribe = transcribeStage as jest.MockedFunction<typeof transcribeStage>;

function buildRequest(method: 'GET' | 'POST', query = '') {
  return new NextRequest(`http://localhost:3000/api/story/voice-vectorise${query}`, {
    method,
    headers: { 'x-vercel-cron': '1' },
  });
}

describe('API /api/story/voice-vectorise', () => {
  beforeEach(() => {
    mockedRetry.mockReset();
    mockedTranscribe.mockReset();
  });

  it('runs retry sweeper on cron GET', async () => {
    mockedRetry.mockResolvedValue({
      status: 'success',
      transcribe_retried: 1,
      resolve_retried: 0,
      vectorised: 2,
      failed: 0,
    });

    const res = await GET(buildRequest('GET'));
    expect(res.status).toBe(200);
    expect(mockedRetry).toHaveBeenCalled();
  });

  it('transcribes a single voice when voiceId is provided', async () => {
    mockedTranscribe.mockResolvedValue('transcribed');

    const res = await POST(buildRequest('POST', '?voiceId=voice-1&mode=chain'));
    expect(res.status).toBe(200);
    expect(mockedTranscribe).toHaveBeenCalledWith('voice-1');
    expect(mockedRetry).not.toHaveBeenCalled();
  });

  it('handles retry errors gracefully', async () => {
    mockedRetry.mockRejectedValue(new Error('Something failed'));

    const res = await GET(buildRequest('GET'));
    expect(res.status).toBe(500);
  });
});
