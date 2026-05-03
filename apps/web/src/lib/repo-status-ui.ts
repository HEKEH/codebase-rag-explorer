import type { RepoStatus } from "@repo/types";

export function getRepoStatusBadgeVariant(status: RepoStatus) {
  switch (status) {
    case "indexed":
      return "default";
    case "indexing":
      return "secondary";
    case "loaded":
      return "outline";
    case "failed":
      return "destructive";
    default:
      return "secondary";
  }
}

/** Human-readable status for UI badges (Chinese). */
export function getRepoStatusLabelZh(status: RepoStatus): string {
  switch (status) {
    case "idle":
      return "空闲";
    case "loaded":
      return "已加载";
    case "indexing":
      return "索引中";
    case "indexed":
      return "已索引";
    case "failed":
      return "失败";
    default:
      return status;
  }
}
