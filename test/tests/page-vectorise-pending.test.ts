import { isPageVectorisePending, isPageVectoriseSkipped } from '@/services/vectorise/page/pending';
import type { DateTime } from 'neo4j-driver';

function dt(iso: string): DateTime {
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
    hour: 0,
    minute: 0,
    second: 0,
    nanosecond: 0,
    timeZoneOffsetSeconds: 0,
  } as DateTime;
}

describe('isPageVectorisePending', () => {
  it('is pending when embeddings were never updated', () => {
    expect(
      isPageVectorisePending({
        embeddingsUpdatedAt: null,
        lastModified: dt('2026-01-01'),
        vectoriseStatus: null,
        vectoriseSkippedAt: null,
      })
    ).toBe(true);
  });

  it('is not pending when skipped for the current last_modified', () => {
    expect(
      isPageVectorisePending({
        embeddingsUpdatedAt: null,
        lastModified: dt('2026-01-01'),
        vectoriseStatus: 'skipped',
        vectoriseSkippedAt: dt('2026-01-02'),
      })
    ).toBe(false);
  });

  it('is pending again when last_modified moves past skip time', () => {
    expect(
      isPageVectorisePending({
        embeddingsUpdatedAt: null,
        lastModified: dt('2026-01-03'),
        vectoriseStatus: 'skipped',
        vectoriseSkippedAt: dt('2026-01-02'),
      })
    ).toBe(true);
  });
});

describe('isPageVectoriseSkipped', () => {
  it('is skipped when status is skipped and not pending', () => {
    expect(
      isPageVectoriseSkipped({
        vectoriseStatus: 'skipped',
        vectorisePending: false,
      })
    ).toBe(true);
  });
});
