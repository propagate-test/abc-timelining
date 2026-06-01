import { logger } from '@/lib/logger';
import { verifyCronOrInfraRequest } from '@/lib/private-auth';
import { buildPageVectoriseResult, runPageVectoriseTick } from '@/services/vectorise';
import { NextRequest, NextResponse } from 'next/server';

async function handlePageVectorise(request: NextRequest) {
  const authError = verifyCronOrInfraRequest(request);
  if (authError) {
    return authError;
  }

  logger.info('Page vectorise triggered.', { method: request.method });

  try {
    const tick = await runPageVectoriseTick();
    const result = await buildPageVectoriseResult(tick);

    logger.info('Page vectorise result', { result });

    return NextResponse.json(
      { status: 'Page vectorise executed', result },
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
  return handlePageVectorise(request);
}

export async function POST(request: NextRequest) {
  return handlePageVectorise(request);
}
