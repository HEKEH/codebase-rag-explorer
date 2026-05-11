import type { RetrievalFusionMode } from "@repo/types";

export interface RetrievalResult {
  chunk_id: string;
  file_path: string;
  content: string;
  chunk_type: string;
  chunk_name: string | null;
  score: number;
  fusion: RetrievalFusionMode;
}
