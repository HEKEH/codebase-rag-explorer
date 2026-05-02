import type { RepoStatus } from "./enums";

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
}
