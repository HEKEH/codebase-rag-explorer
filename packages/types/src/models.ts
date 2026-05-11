import type { RepoStatus } from "./enums";

/** Retrieval fusion strategy; affects how reference `score` should be interpreted. */
export type RetrievalFusionMode = "weighted" | "rrf";

export interface Repo {
  id: string;
  path: string;
  type: "local" | "git";
  status: RepoStatus;
  fileCount: number;
  chunkCount: number;
}

export interface Reference {
  chunk_id: string;
  file_path: string;
  snippet: string;
  /**
   * Relevance-style weight for ordering within one response.
   * With `rrf` fusion, scores are min–max normalized within the returned reference set (0–1).
   * With `weighted` fusion, scores come from normalized dense+lexical linear combination (typical 0–1 range).
   * Do not compare absolute values across `retrieval_fusion` modes.
   */
  score: number;
}

/** Persisted chat row roles; `error` is a system notice (e.g. ask failed), not sent to the LLM as assistant text. */
export type ChatHistoryRole = "user" | "assistant" | "error";

export interface Message {
  id: string;
  timestamp: number;
  role: ChatHistoryRole;
  content: string;
  references?: Reference[];
  /** Set for assistant replies when persisted via the envelope format; explains reference score scale. */
  retrieval_fusion?: RetrievalFusionMode;
}
