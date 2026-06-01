import { selectChangedPagesBatch } from '@/services/docs/ingest';
import type { PageSnapshotEntry } from '@/lib/db/models/page';

function page(slug: string, checksum: string): PageSnapshotEntry {
  return {
    slug,
    title: slug,
    checksum,
    created_at: '2024-01-01T00:00:00Z',
    last_modified: '2024-01-01T00:00:00Z',
    commit_history: [],
    authors: [],
  };
}

describe('selectChangedPagesBatch', () => {
  it('includes missing and stale pages only', () => {
    const pages = [page('a', 'sha:a'), page('b', 'sha:b'), page('c', 'sha:c')];
    const checksums = new Map<string, string | null>([
      ['a', 'sha:a'],
      ['b', 'sha:old'],
      ['c', null],
    ]);

    const result = selectChangedPagesBatch(pages, checksums, 40);

    expect(result.totalChanged).toBe(2);
    expect(result.batch.map((p) => p.slug)).toEqual(['b', 'c']);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
  });

  it('caps batch to batch size while reporting full changed total', () => {
    const pages = Array.from({ length: 50 }, (_, i) => page(`p-${i}`, `sha:${i}`));
    const checksums = new Map<string, string | null>(
      pages.map((p) => [p.slug, null] as const)
    );

    const result = selectChangedPagesBatch(pages, checksums, 40);

    expect(result.totalChanged).toBe(50);
    expect(result.batch).toHaveLength(40);
    expect(result.created).toBe(50);
    expect(result.updated).toBe(0);
  });

  it('returns empty batch when all pages are current', () => {
    const pages = [page('a', 'sha:a'), page('b', 'sha:b')];
    const checksums = new Map<string, string | null>([
      ['a', 'sha:a'],
      ['b', 'sha:b'],
    ]);

    const result = selectChangedPagesBatch(pages, checksums, 40);

    expect(result.totalChanged).toBe(0);
    expect(result.batch).toHaveLength(0);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });
});
