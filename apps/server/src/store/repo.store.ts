import type { RepoStatus } from "@repo/types";

export interface RepoRecord {
  id: string;
  path: string;
  type: "local" | "git";
  status: RepoStatus;
  fileCount: number;
  chunkCount: number;
}

const reposByPath = new Map<string, RepoRecord>();
const reposById = new Map<string, RepoRecord>();

export function getRepoByPath(path: string): RepoRecord | undefined {
  return reposByPath.get(path);
}

export function saveRepo(repo: RepoRecord): void {
  reposByPath.set(repo.path, repo);
  reposById.set(repo.id, repo);
}

export function getRepoById(id: string): RepoRecord | undefined {
  return reposById.get(id);
}
