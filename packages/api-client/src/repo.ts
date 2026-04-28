import type { ImportRepoData, ImportRepoRequest, IndexStatusData } from "@repo/types";
import { apiClient } from "./api-client";

export const repoApi = {
  import: (input: ImportRepoRequest) =>
    apiClient.request<ImportRepoData>("/api/repo/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }),
  status: (repoId: string) =>
    apiClient.request<IndexStatusData>(`/api/index/status?repo_id=${encodeURIComponent(repoId)}`)
};
