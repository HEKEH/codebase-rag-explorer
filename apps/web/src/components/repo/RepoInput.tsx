import type { FormEvent } from "react";
import { FolderGit2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type RepoInputProps = {
  repoPath: string;
  isLoading: boolean;
  onRepoPathChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function RepoInput({ repoPath, isLoading, onRepoPathChange, onSubmit }: RepoInputProps) {
  return (
    <form data-testid="repo-input-form" onSubmit={onSubmit} className="flex gap-3">
      <Input
        value={repoPath}
        onChange={(event) => onRepoPathChange(event.target.value)}
        placeholder="输入本地路径或 Git URL"
        className="flex-1"
      />
      <Button type="submit" disabled={isLoading || !repoPath.trim()}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FolderGit2 className="h-4 w-4" />
        )}
        <span className="ml-2">添加仓库</span>
      </Button>
    </form>
  );
}
