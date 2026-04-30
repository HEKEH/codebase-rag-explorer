export enum ErrorCode {
  SUCCESS = 0,
  REPO_LOAD_FAILED = 1001,
  REPO_ALREADY_EXISTS = 1002,
  REPO_NOT_FOUND = 1003,
  REPO_RELOADING = 1004,
  INDEX_NOT_BUILT = 2001,
  INDEX_ALREADY_EXISTS = 2002,
  NO_RELEVANT_CODE = 3001,
  EMBEDDING_FAILED = 4001,
  LLM_FAILED = 4002,
  INTERNAL_ERROR = 5000
}

export type RepoStatus = "idle" | "loaded" | "indexing" | "indexed" | "failed";
