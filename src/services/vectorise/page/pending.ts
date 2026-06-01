import type { DateTime } from 'neo4j-driver';

function isDateTimeBefore(a: DateTime, b: DateTime): boolean {
  const parts = (d: DateTime) =>
    [d.year, d.month, d.day, d.hour, d.minute, d.second, d.nanosecond] as const;
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] < right[i]) return true;
    if (left[i] > right[i]) return false;
  }
  return false;
}

/** Cypher predicate (without WHERE) for pages that still need a vectorise attempt. */
export const PAGE_NEEDS_VECTORISATION_PREDICATE = `
  (
    p.embeddings_updated_at IS NULL
    OR p.embeddings_updated_at < p.last_modified
  )
  AND (
    p.vectorise_status IS NULL
    OR p.vectorise_status <> 'skipped'
    OR p.last_modified > p.vectorise_skipped_at
  )
`;

export function isPageVectorisePending(state: {
  embeddingsUpdatedAt: DateTime | null;
  lastModified: DateTime | null;
  vectoriseStatus: string | null;
  vectoriseSkippedAt: DateTime | null;
}): boolean {
  const needsEmbeddings =
    state.embeddingsUpdatedAt == null ||
    (state.lastModified != null && state.embeddingsUpdatedAt < state.lastModified);

  if (!needsEmbeddings) {
    return false;
  }

  if (state.vectoriseStatus === 'skipped' && state.vectoriseSkippedAt != null && state.lastModified != null) {
    return isDateTimeBefore(state.vectoriseSkippedAt, state.lastModified);
  }

  if (state.vectoriseStatus === 'skipped') {
    return false;
  }

  return true;
}

export function isPageVectoriseSkipped(state: {
  vectoriseStatus: string | null;
  vectorisePending: boolean;
}): boolean {
  return state.vectoriseStatus === 'skipped' && !state.vectorisePending;
}
