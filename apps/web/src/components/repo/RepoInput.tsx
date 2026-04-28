import type { FormEvent } from "react";

type RepoInputProps = {
  repoPath: string;
  isLoading: boolean;
  onRepoPathChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function RepoInput({ repoPath, isLoading, onRepoPathChange, onSubmit }: RepoInputProps) {
  return (
    <form data-testid="repo-input-form" onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <input
        value={repoPath}
        onChange={(event) => onRepoPathChange(event.target.value)}
        placeholder="输入本地路径或 Git URL"
        style={{ flex: 1, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}
      />
      <button type="submit" disabled={isLoading || !repoPath.trim()}>
        导入仓库
      </button>
    </form>
  );
}
