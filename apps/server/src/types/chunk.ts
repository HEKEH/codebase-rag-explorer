export type ChunkType = "function" | "class" | "generic";

export interface ChunkData {
  id: string;
  repo_id: string;
  file_path: string;
  content: string;
  chunk_type: ChunkType;
  chunk_name: string | null;
  start_line: number;
  end_line: number;
  /** File-level import block (indexing only; not persisted on `chunks` rows). */
  import_summary?: string;
}
