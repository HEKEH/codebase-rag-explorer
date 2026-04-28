import type { ImportRepoData, ImportRepoRequest, IndexStatusData } from "@repo/types";
import { ApiClient } from "./client";

const client = new ApiClient("http://localhost:5001");

export const repoApi = {
  import: (input: ImportRepoRequest) =>
    client.request<ImportRepoData>("/api/repo/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }),
  status: (repoId: string) =>
    client.request<IndexStatusData>(`/api/index/status?repo_id=${encodeURIComponent(repoId)}`)
};
