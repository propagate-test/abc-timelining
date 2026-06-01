import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export function verifyInfraRequest(request: NextRequest): NextResponse | null {
  const expected = process.env.PRIVATE_API_TOKEN;
  if (!expected) {
    logger.warn('Infra auth rejected: PRIVATE_API_TOKEN not configured', { path: request.nextUrl.pathname });
    return NextResponse.json({ error: 'PRIVATE_API_TOKEN not configured' }, { status: 500 });
  }

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    logger.warn('Infra auth rejected: missing or invalid Authorization header', {
      path: request.nextUrl.pathname,
      hasAuthHeader: !!header,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = header.slice('Bearer '.length);
  if (token !== expected) {
    logger.warn('Infra auth rejected: token mismatch', {
      path: request.nextUrl.pathname,
      tokenLen: token.length,
      expectedLen: expected.length,
      tokenTrimmed: token.trim() === token,
      expectedTrimmed: expected.trim() === expected,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/** Allows Vercel cron invocations or Bearer PRIVATE_API_TOKEN. */
export function verifyCronOrInfraRequest(request: NextRequest): NextResponse | null {
  const cronHeader = request.headers.get('x-vercel-cron');
  const cronSchedule = request.headers.get('x-vercel-cron-schedule');
  const userAgent = request.headers.get('user-agent') ?? '';
  const path = request.nextUrl.pathname;

  if (cronHeader === '1') {
    logger.info('Cron auth accepted', { path, method: request.method, via: 'x-vercel-cron' });
    return null;
  }

  // Vercel docs: cron invocations include x-vercel-cron-schedule and user-agent vercel-cron/1.0
  if (cronSchedule != null && userAgent.startsWith('vercel-cron/')) {
    logger.info('Cron auth accepted', { path, method: request.method, via: 'x-vercel-cron-schedule', schedule: cronSchedule });
    return null;
  }

  return verifyInfraRequest(request);
}
