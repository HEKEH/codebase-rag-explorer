import type {
  BuildIndexData,
  CreateRepoRequest,
  DeleteRepoData,
  ImportRepoData,
  ImportRepoRequest,
  IndexStatusData,
  RepoListItemData
} from "@repo/types";
import { apiClient } from "./api-client";

export const repoApi = {
  create: (input: CreateRepoRequest) =>
    apiClient.request<ImportRepoData>("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }),
  list: () => apiClient.request<RepoListItemData[]>("/api/repos"),
  remove: (repoId: string) =>
    apiClient.request<DeleteRepoData>(`/api/repos/${encodeURIComponent(repoId)}`, {
      method: "DELETE"
    }),
  reload: (repoId: string) =>
    apiClient.request<BuildIndexData>(`/api/repos/${encodeURIComponent(repoId)}/reload`, {
      method: "POST"
    }),
  status: (repoId: string) =>
    apiClient.request<IndexStatusData>(`/api/repos/${encodeURIComponent(repoId)}/status`),
  import: (input: ImportRepoRequest) =>
    apiClient.request<ImportRepoData>("/api/repo/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }),
  legacyStatus: (repoId: string) =>
    apiClient.request<IndexStatusData>(`/api/index/status?repo_id=${encodeURIComponent(repoId)}`)
};
