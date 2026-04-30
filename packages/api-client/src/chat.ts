import type { ClearRepoChatHistoryData } from "@repo/types";
import { apiClient } from "./api-client";

export const chatApi = {
  clearHistory: (repoId: string) =>
    apiClient.request<ClearRepoChatHistoryData>(`/api/repos/${encodeURIComponent(repoId)}/chat-history`, {
      method: "DELETE"
    })
};
