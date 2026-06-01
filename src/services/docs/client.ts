import type { PageSnapshotEntry } from '@/lib/db/models/page';
import { logger } from '@/lib/logger';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export async function fetchDocsSnapshot(): Promise<PageSnapshotEntry[]> {
  const docsAppUrl = requireEnv('DOCS_APP_URL').replace(/\/$/, '');
  const token = requireEnv('PRIVATE_API_TOKEN');

  const snapshotUrl = `${docsAppUrl}/api/pages/snapshot`;
  const res = await fetch(snapshotUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    logger.warn('Docs snapshot request failed', { url: snapshotUrl, status: res.status, tokenLen: token.length });
    throw new Error(`snapshot failed: ${res.status}`);
  }

  const pages = (await res.json()) as PageSnapshotEntry[];
  if (!Array.isArray(pages)) {
    throw new Error('snapshot response is not an array');
  }

  return pages;
}

/** Page body text, or null when docs has no content for this slug (404). */
export async function fetchDocsPageContent(slug: string): Promise<string | null> {
  const docsAppUrl = requireEnv('DOCS_APP_URL').replace(/\/$/, '');
  const token = requireEnv('PRIVATE_API_TOKEN');

  const serveUrl = `${docsAppUrl}/api/serve/${encodeURIComponent(slug)}`;
  const res = await fetch(serveUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`serve failed for ${slug}: ${res.status}`);
  }

  return res.text();
}
