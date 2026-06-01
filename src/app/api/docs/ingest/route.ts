import { verifyCronOrInfraRequest } from '@/lib/private-auth';
import { logger } from '@/lib/logger';
import { runDocsIngest } from '@/services/docs/ingest';
import { NextRequest, NextResponse } from 'next/server';

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

async function triggerNextIngestBatch(
  request: NextRequest,
  nextCursor: number | undefined,
  batchSize: number | undefined
): Promise<boolean> {
  if (nextCursor == null) return false;

  const token = process.env.PRIVATE_API_TOKEN;
  if (!token) {
    logger.warn('Docs ingest continuation skipped: PRIVATE_API_TOKEN is not configured');
    return false;
  }

  const continuationUrl = new URL('/api/docs/ingest', request.nextUrl.origin);
  continuationUrl.searchParams.set('cursor', String(nextCursor));
  if (batchSize != null) {
    continuationUrl.searchParams.set('batchSize', String(batchSize));
  }

  try {
    const response = await fetch(continuationUrl.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-ingest-chain': '1',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      logger.warn('Docs ingest continuation trigger failed', {
        url: continuationUrl.toString(),
        status: response.status,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('Docs ingest continuation trigger threw', {
      url: continuationUrl.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function handleIngest(request: NextRequest) {
  const authError = verifyCronOrInfraRequest(request);
  if (authError) {
    return authError;
  }

  const cursor = parsePositiveInt(request.nextUrl.searchParams.get('cursor')) ?? 0;
  const batchSize = parsePositiveInt(request.nextUrl.searchParams.get('batchSize'));
  const isChained = request.headers.get('x-ingest-chain') === '1';

  logger.info('Docs ingest triggered', { method: request.method, cursor, batchSize, isChained });

  try {
    const result = await runDocsIngest({ cursor, batchSize });

    if (result.status === 'error') {
      return NextResponse.json(result, { status: 500 });
    }

    let retriggered = false;
    if (result.status === 'success' && result.hasMore && result.nextCursor != null) {
      retriggered = await triggerNextIngestBatch(request, result.nextCursor, batchSize);
      logger.info('Docs ingest continuation status', {
        retriggered,
        nextCursor: result.nextCursor,
        totalPages: result.totalPages,
      });
    }

    const responsePayload = { ...result, retriggered };
    return NextResponse.json(responsePayload, { status: 200 });
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
