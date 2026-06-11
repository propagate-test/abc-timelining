import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

const DEFAULT_DISPATCH_TIMEOUT_MS = 5000;
const CHAIN_DISPATCH_TIMEOUT_MS = 15000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function originFromRequest(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');

  if (host) {
    return `${proto}://${host}`;
  }

  return request.nextUrl.origin;
}

export interface DispatchInternalRouteResult {
  ok: boolean;
  url: string;
  status?: number;
  error?: string;
}

export async function dispatchInternalRoute(
  origin: string,
  path: string,
  options?: { chain?: boolean }
): Promise<DispatchInternalRouteResult> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${origin}${normalizedPath}`;
  const token = requireEnv('PRIVATE_API_TOKEN');
  const timeoutMs = options?.chain ? CHAIN_DISPATCH_TIMEOUT_MS : DEFAULT_DISPATCH_TIMEOUT_MS;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      logger.warn('Internal route dispatch failed', { url, status: response.status });
      return { ok: false, url, status: response.status, error: `http_${response.status}` };
    }

    logger.info('Internal route dispatched', { url });
    return { ok: true, url };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    logger.warn('Internal route dispatch failed', { url, error: message });
    return { ok: false, url, error: message };
  }
}
