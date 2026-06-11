import { logger } from '@/lib/logger';
import { originFromRequest } from '@/lib/internal-dispatch';
import { verifyCronOrInfraRequest } from '@/lib/private-auth';
import { runIngest, type IngestMode } from '@/services/ingest';
import { runIngestRetry } from '@/services/pipeline/retry';
import { NextRequest, NextResponse } from 'next/server';

function parseIngestMode(value: string | null): IngestMode {
  if (value === 'chain' || value === 'retry' || value === 'batch') {
    return value;
  }
  return 'batch';
}

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

async function handleIngest(request: NextRequest) {
  const authError = verifyCronOrInfraRequest(request);
  if (authError) {
    return authError;
  }

  const mode = parseIngestMode(request.nextUrl.searchParams.get('mode'));
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

  logger.info('Ingest triggered.', { method: request.method, mode, limit });

  try {
    const origin = originFromRequest(request);

    if (mode === 'retry') {
      const result = await runIngestRetry({ origin, limit: limit ?? 10 });
      logger.info('Ingest retry result', { result });
      return NextResponse.json({ status: 'Ingest retry executed', result }, { status: 200 });
    }

    const result = await runIngest({ origin, limit, mode });
    logger.info('Ingest result', { result });

    return NextResponse.json({ status: 'Ingest executed', result }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Unknown error occurred' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('mode') === null) {
    const url = new URL(request.url);
    url.searchParams.set('mode', 'retry');
    return handleIngest(new NextRequest(url, { method: request.method, headers: request.headers }));
  }
  return handleIngest(request);
}

export async function POST(request: NextRequest) {
  return handleIngest(request);
}
