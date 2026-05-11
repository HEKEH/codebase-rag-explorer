import type {
  ChatHistoryRole,
  ClearRepoChatHistoryData,
  GetRepoChatHistoryData,
  Reference,
  RetrievalFusionMode,
  SaveRepoChatMessageData,
} from "@repo/types";
import { apiClient } from "./api-client";

export const chatApi = {
  getHistory: (repoId: string) =>
    apiClient.request<GetRepoChatHistoryData>(
      `/api/repos/${encodeURIComponent(repoId)}/chat-history`,
      {
        method: "GET",
      },
    ),

  saveMessage: (
    repoId: string,
    role: ChatHistoryRole,
    content: string,
    references?: Reference[],
    retrieval_fusion?: RetrievalFusionMode,
  ) =>
    apiClient.request<SaveRepoChatMessageData>(
      `/api/repos/${encodeURIComponent(repoId)}/chat-history`,
      {
        method: "POST",
        body: JSON.stringify({
          role,
          content,
          references,
          retrieval_fusion,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      },
    ),

  clearHistory: (repoId: string) =>
    apiClient.request<ClearRepoChatHistoryData>(
      `/api/repos/${encodeURIComponent(repoId)}/chat-history`,
      {
        method: "DELETE",
      },
    ),
};
