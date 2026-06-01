import { verifyCronOrInfraRequest } from '@/lib/private-auth';
import { logger } from '@/lib/logger';
import { parsePositiveInt } from '@/lib/internal-continuation';
import { runDocsIngest } from '@/services/docs/ingest';
import { NextRequest, NextResponse } from 'next/server';

async function handleIngest(request: NextRequest) {
  const authError = verifyCronOrInfraRequest(request);
  if (authError) {
    return authError;
  }

  const batchSize = parsePositiveInt(request.nextUrl.searchParams.get('batchSize'));

  logger.info('Docs ingest triggered', { method: request.method, batchSize });

  try {
    const result = await runDocsIngest({ batchSize });

    if (result.status === 'error') {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Docs ingest route failed', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleIngest(request);
}

export async function POST(request: NextRequest) {
  return handleIngest(request);
}
