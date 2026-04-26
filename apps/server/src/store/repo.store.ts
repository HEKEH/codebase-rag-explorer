export interface SourceFileRecord {
  path: string;
  content: string;
}

const sourceFilesByRepoId = new Map<string, SourceFileRecord[]>();

export function saveSourceFiles(repoId: string, files: SourceFileRecord[]): void {
  sourceFilesByRepoId.set(repoId, files);
}

export function getSourceFiles(repoId: string): SourceFileRecord[] | undefined {
  return sourceFilesByRepoId.get(repoId);
}
