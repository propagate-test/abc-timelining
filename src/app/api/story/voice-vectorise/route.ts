import { logger } from '@/lib/logger';
import { originFromRequest } from '@/lib/internal-dispatch';
import { verifyCronOrInfraRequest } from '@/lib/private-auth';
import { pushTranscribeFailed } from '@/services/pipeline/failed-queue';
import { runVoiceVectoriseRetry } from '@/services/pipeline/retry';
import { transcribeStage } from '@/services/vectorise/voice/transcribe';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

async function handleVoiceVectorise(request: NextRequest) {
  const authError = verifyCronOrInfraRequest(request);
  if (authError) {
    return authError;
  }

  const voiceId = request.nextUrl.searchParams.get('voiceId');
  const mode = request.nextUrl.searchParams.get('mode');

  logger.info('Voice vectorise triggered.', { method: request.method, voiceId, mode });

  try {
    if (mode === 'retry') {
      const origin = originFromRequest(request);
      const result = await runVoiceVectoriseRetry({ origin });
      return NextResponse.json(
        { status: 'Voice vectorise retry executed', result },
        { status: 200 }
      );
    }

    if (voiceId) {
      const result = await transcribeStage(voiceId);
      if (result === 'failed') {
        await pushTranscribeFailed(voiceId, 'transcribe_stage_failed');
      }
      return NextResponse.json(
        {
          status: 'Voice transcribe executed',
          result: { voiceId, stage: result },
        },
        { status: 200 }
      );
    }

    const url = new URL(request.url);
    url.searchParams.set('mode', 'retry');
    const origin = originFromRequest(
      new NextRequest(url, { method: request.method, headers: request.headers })
    );
    const retryResult = await runVoiceVectoriseRetry({ origin });

    return NextResponse.json(
      { status: 'Voice vectorise retry executed', result: retryResult },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Unknown error occurred' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleVoiceVectorise(request);
}

export async function POST(request: NextRequest) {
  return handleVoiceVectorise(request);
}
