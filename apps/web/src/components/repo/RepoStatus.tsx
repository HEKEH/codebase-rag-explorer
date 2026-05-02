import { RefreshCw, Loader2, Database, FileCode } from "lucide-react";
import type { RepoStatus as RepoStatusType } from "@repo/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type RepoStatusProps = {
  status: RepoStatusType;
  fileCount: number;
  chunkCount: number;
  canBuildIndex: boolean;
  onBuildIndex: () => void;
};

function getStatusBadgeVariant(status: RepoStatusType) {
  switch (status) {
    case "idle":
      return "secondary";
    case "loaded":
      return "outline";
    case "indexing":
      return "secondary";
    case "indexed":
      return "default";
    case "failed":
      return "destructive";
    default:
      return "secondary";
  }
}

function getStatusLabel(status: RepoStatusType) {
  return status;
}

export function RepoStatus({ status, fileCount, chunkCount, canBuildIndex, onBuildIndex }: RepoStatusProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          状态：{getStatusLabel(status)}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          文件数：{fileCount}
        </span>
        <span className="text-sm text-muted-foreground">
          Chunk 数：{chunkCount}
        </span>
      </div>
      {canBuildIndex && (
        <Button variant="secondary" onClick={onBuildIndex} className="w-fit">
          <RefreshCw className="h-4 w-4" />
          <span className="ml-2">构建索引</span>
        </Button>
      )}
    </div>
  );
}
