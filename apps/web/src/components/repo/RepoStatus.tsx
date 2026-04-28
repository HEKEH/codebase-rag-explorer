import type { RepoStatus as RepoStatusType } from "@repo/types";

type RepoStatusProps = {
  status: RepoStatusType;
  fileCount: number;
  chunkCount: number;
  canBuildIndex: boolean;
  onBuildIndex: () => void;
};

export function RepoStatus({ status, fileCount, chunkCount, canBuildIndex, onBuildIndex }: RepoStatusProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span>状态：{status}</span>
      <span>文件数：{fileCount}</span>
      <span>Chunk 数：{chunkCount}</span>
      <button onClick={onBuildIndex} disabled={!canBuildIndex}>
        构建索引
      </button>
    </div>
  );
}
