import type { RepoStatus } from "@repo/types";

export interface RepoRecord {
  id: string;
  path: string;
  type: "local" | "git";
  status: RepoStatus;
  fileCount: number;
  chunkCount: number;
}

export interface SourceFileRecord {
  path: string;
  content: string;
}

const reposByPath = new Map<string, RepoRecord>();
const reposById = new Map<string, RepoRecord>();
const sourceFilesByRepoId = new Map<string, SourceFileRecord[]>();

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

export function saveSourceFiles(repoId: string, files: SourceFileRecord[]): void {
  sourceFilesByRepoId.set(repoId, files);
}

export function getSourceFiles(repoId: string): SourceFileRecord[] | undefined {
  return sourceFilesByRepoId.get(repoId);
}

export function updateRepoStatus(repoId: string, status: RepoRecord["status"]): void {
  const repo = reposById.get(repoId);
  if (!repo) return;
  repo.status = status;
  reposByPath.set(repo.path, repo);
  reposById.set(repo.id, repo);
}

export function updateRepoChunkCount(repoId: string, chunkCount: number): void {
  const repo = reposById.get(repoId);
  if (!repo) return;
  repo.chunkCount = chunkCount;
  reposByPath.set(repo.path, repo);
  reposById.set(repo.id, repo);
}
