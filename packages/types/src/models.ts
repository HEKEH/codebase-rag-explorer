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

export interface Message {
  role: "user" | "assistant";
  content: string;
  references?: Reference[];
}
