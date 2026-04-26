import {
  CHUNK_MAX_LENGTH,
  CHUNK_OVERLAP,
  DEFAULT_TOP_K,
  MAX_CONTEXT_TOKENS
} from "@repo/constants";

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export const runtimeConfig = {
  chunkMaxLength: toPositiveInt(process.env.CHUNK_MAX_LENGTH, CHUNK_MAX_LENGTH),
  chunkOverlap: toPositiveInt(process.env.CHUNK_OVERLAP, CHUNK_OVERLAP),
  defaultTopK: toPositiveInt(process.env.DEFAULT_TOP_K, DEFAULT_TOP_K),
  maxContextTokens: toPositiveInt(process.env.MAX_CONTEXT_TOKENS, MAX_CONTEXT_TOKENS)
};
