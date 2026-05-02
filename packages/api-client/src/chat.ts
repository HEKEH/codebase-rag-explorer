import type {
  ClearRepoChatHistoryData,
  GetRepoChatHistoryData,
  Reference,
  SaveRepoChatMessageData
} from "@repo/types";
import { apiClient } from "./api-client";

export const chatApi = {
  getHistory: (repoId: string) =>
    apiClient.request<GetRepoChatHistoryData>(`/api/repos/${encodeURIComponent(repoId)}/chat-history`, {
      method: "GET"
    }),

  saveMessage: (repoId: string, role: "user" | "assistant", content: string, references?: Reference[]) =>
    apiClient.request<SaveRepoChatMessageData>(`/api/repos/${encodeURIComponent(repoId)}/chat-history`, {
      method: "POST",
      body: JSON.stringify({
        role,
        content,
        references
      }),
      headers: {
        "Content-Type": "application/json"
      }
    }),

  clearHistory: (repoId: string) =>
    apiClient.request<ClearRepoChatHistoryData>(`/api/repos/${encodeURIComponent(repoId)}/chat-history`, {
      method: "DELETE"
    })
};
