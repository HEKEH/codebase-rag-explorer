import type { ErrorCode, RepoStatus } from "./enums";
import type { Reference } from "./models";

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

export type ApiSuccess<T> = ApiResponse<T> & { code: 0; data: T };

export type ApiErrorResponse = ApiResponse<null> & {
  code: ErrorCode;
  data: null;
};

export interface ImportRepoRequest {
  path: string;
  type: "local" | "git";
}

export interface CreateRepoRequest {
  source_type: "local" | "git";
  source_value: string;
  auto_reload?: boolean;
}

export interface BuildIndexRequest {
  repo_id: string;
}

export interface AskRequest {
  repo_id: string;
  question: string;
  top_k?: number;
}

export interface ImportRepoData {
  repo_id: string;
  file_count: number;
  status: "loaded";
}

export interface BuildIndexData {
  repo_id: string;
  chunk_count: number;
  status: "indexing";
}

export interface DeleteRepoData {
  repo_id: string;
  deleted: true;
}

export interface ClearRepoChatHistoryData {
  repo_id: string;
  cleared: true;
}

export interface IndexStatusData {
  repo_id: string;
  status: RepoStatus;
  chunk_count: number;
  file_count: number;
}

export interface AskData {
  answer: string;
  references: Reference[];
}
