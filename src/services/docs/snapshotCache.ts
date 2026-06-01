import type { PageSnapshotEntry } from '@/lib/db/models/page';
import { fetchDocsSnapshot } from './client';
import { syncDocsPageFromSnapshot } from './pageService';

let snapshotBySlug: Map<string, PageSnapshotEntry> | null = null;

export function resetDocsSnapshotCache(): void {
  snapshotBySlug = null;
}

export async function loadDocsSnapshotMap(): Promise<Map<string, PageSnapshotEntry>> {
  if (!snapshotBySlug) {
    const pages = await fetchDocsSnapshot();
    snapshotBySlug = new Map(pages.map((p) => [p.slug, p]));
  }
  return snapshotBySlug;
}

export async function getDocsSnapshotEntry(slug: string): Promise<PageSnapshotEntry | undefined> {
  const map = await loadDocsSnapshotMap();
  return map.get(slug);
}

/** Align Neo4j page metadata with docs snapshot after vectorise used live content. */
export async function syncDocsPageMetadataFromSnapshot(slug: string): Promise<boolean> {
  const entry = await getDocsSnapshotEntry(slug);
  if (!entry) {
    return false;
  }
  await syncDocsPageFromSnapshot(entry);
  return true;
}
