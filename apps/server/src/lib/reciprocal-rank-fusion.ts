export type ReciprocalRankFusionOptions = {
  /**
   * Scale on the dense-list RRF term (BM25 list uses `bm25Weight`).
   * Default `1`; raise for NL→PL (dense-primary), lower for PL→PL (BM25-primary).
   */
  denseWeight?: number;
  /**
   * Scale on the BM25 / second-list term (dense term uses `denseWeight`).
   * Use `1` for symmetric RRF (e.g. locate); below `1` for dense-primary + BM25 boost (e.g. explain).
   */
  bm25Weight?: number;
};

/**
 * Two-list reciprocal rank fusion (RRF):
 * score(d) = w_dense·1/(k+r_dense) + w_bm25·1/(k+r_bm25)
 * with 1-based ranks; first occurrence wins if an id repeats in a list.
 */
export function reciprocalRankFusionTwoList(
  denseOrderedChunkIds: readonly string[],
  bm25OrderedChunkIds: readonly string[],
  k: number,
  options?: ReciprocalRankFusionOptions,
): { orderedChunkIds: string[]; scores: Map<string, number> } {
  const bm25Weight = options?.bm25Weight ?? 1;
  const denseWeight = options?.denseWeight ?? 1;
  const denseRank = new Map<string, number>();
  for (let i = 0; i < denseOrderedChunkIds.length; i++) {
    const id = denseOrderedChunkIds[i]!;
    if (id.length === 0) continue;
    if (!denseRank.has(id)) denseRank.set(id, i + 1);
  }

  const bm25Rank = new Map<string, number>();
  for (let i = 0; i < bm25OrderedChunkIds.length; i++) {
    const id = bm25OrderedChunkIds[i]!;
    if (id.length === 0) continue;
    if (!bm25Rank.has(id)) bm25Rank.set(id, i + 1);
  }

  const ids = new Set<string>();
  for (const id of denseOrderedChunkIds) {
    if (id.length > 0) ids.add(id);
  }
  for (const id of bm25OrderedChunkIds) {
    if (id.length > 0) ids.add(id);
  }

  const scores = new Map<string, number>();
  for (const id of ids) {
    let s = 0;
    const dr = denseRank.get(id);
    if (dr !== undefined) s += (denseWeight * 1) / (k + dr);
    const br = bm25Rank.get(id);
    if (br !== undefined) s += (bm25Weight * 1) / (k + br);
    scores.set(id, s);
  }

  const orderedChunkIds = Array.from(ids).sort((a, b) => {
    const sa = scores.get(a) ?? 0;
    const sb = scores.get(b) ?? 0;
    if (sb !== sa) return sb - sa;
    return a.localeCompare(b);
  });

  return { orderedChunkIds, scores };
}
