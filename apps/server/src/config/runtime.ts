import {
  CHUNK_MAX_LENGTH,
  CHUNK_OVERLAP,
  DEFAULT_RETRIEVAL_RRF_EXPLAIN_BM25_WEIGHT,
  DEFAULT_RETRIEVAL_RRF_K,
  DEFAULT_TOP_K,
  MAX_CONTEXT_TOKENS,
} from "@repo/constants";
import type { RetrievalFusionMode } from "@repo/types";

const DEFAULT_RETRIEVAL_BM25_TOP_N = Math.max(DEFAULT_TOP_K * 4, DEFAULT_TOP_K);

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/** When unset or invalid: use legacy `max(topK * 3, topK)` in RetrievalService. */
function parseOptionalPositiveInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function parseClampedFloat(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  if (trimmed === "") return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export type RetrievalSparseMode = "fts" | "full_table";

export type { RetrievalFusionMode };

export type RetrievalQueryModality = "auto" | "force_nl" | "force_pl";

export function parseRetrievalFusion(
  value: string | undefined,
): RetrievalFusionMode {
  const v = value?.trim().toLowerCase();
  if (v === "rrf") return "rrf";
  return "weighted";
}

function parseRetrievalQueryModality(
  value: string | undefined,
): RetrievalQueryModality {
  if (value === "force_nl") return "force_nl";
  if (value === "force_pl") return "force_pl";
  return "auto";
}

function parseRetrievalSparseMode(
  value: string | undefined,
): RetrievalSparseMode {
  if (value === "full_table") return "full_table";
  return "fts";
}

export const runtimeConfig = {
  chunkMaxLength: toPositiveInt(process.env.CHUNK_MAX_LENGTH, CHUNK_MAX_LENGTH),
  chunkOverlap: toPositiveInt(process.env.CHUNK_OVERLAP, CHUNK_OVERLAP),
  defaultTopK: toPositiveInt(process.env.DEFAULT_TOP_K, DEFAULT_TOP_K),
  maxContextTokens: toPositiveInt(
    process.env.MAX_CONTEXT_TOKENS,
    MAX_CONTEXT_TOKENS,
  ),
  retrievalBm25TopN: toPositiveInt(
    process.env.RETRIEVAL_BM25_TOP_N,
    DEFAULT_RETRIEVAL_BM25_TOP_N,
  ),
  retrievalSparseMode: parseRetrievalSparseMode(
    process.env.RETRIEVAL_SPARSE_MODE,
  ),
  /** Legacy min-max linear fusion vs RRF (Phase 2). Default keeps Phase 1 behavior. */
  retrievalFusion: parseRetrievalFusion(process.env.RETRIEVAL_FUSION),
  /**
   * Dense recall depth (vector search k). When null, RetrievalService uses
   * `max(topK * 3, topK)` to match pre–Phase-2 behavior.
   */
  retrievalDenseTopN: parseOptionalPositiveInt(
    process.env.RETRIEVAL_DENSE_TOP_N,
  ),
  retrievalRrfK: toPositiveInt(
    process.env.RETRIEVAL_RRF_K,
    DEFAULT_RETRIEVAL_RRF_K,
  ),
  /**
   * Scale for the BM25 / sparse rank term in RRF when intent is `explain`
   * (`locate` uses 1). Clamped to [0, 2].
   */
  retrievalRrfExplainBm25Weight: parseClampedFloat(
    process.env.RETRIEVAL_RRF_EXPLAIN_BM25_WEIGHT,
    DEFAULT_RETRIEVAL_RRF_EXPLAIN_BM25_WEIGHT,
    0,
    2,
  ),
  /** Wired for Phase 3; `auto` is a no-op until query routing lands. */
  retrievalQueryModality: parseRetrievalQueryModality(
    process.env.RETRIEVAL_QUERY_MODALITY,
  ),
};
