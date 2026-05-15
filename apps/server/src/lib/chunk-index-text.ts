import type { ChunkData } from "../types/chunk";

/**
 * Canonical text used for both dense embedding input and FTS `chunk_fts.body`
 * so sparse and vector channels stay aligned (retrieval-enhancement-design §9).
 */
export function chunkToSparseIndexBody(chunk: ChunkData): string {
  const summary = chunk.import_summary?.trim();
  const head = summary
    ? `File: ${chunk.file_path}\nImports:\n${summary}\n\n${chunk.chunk_type}: ${chunk.chunk_name ?? "anonymous"}`
    : `File: ${chunk.file_path}\n${chunk.chunk_type}: ${chunk.chunk_name ?? "anonymous"}`;
  return `${head}\n\n${chunk.content}`;
}
