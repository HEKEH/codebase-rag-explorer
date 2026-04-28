import type { AskData, AskRequest } from "@repo/types";
import { apiClient } from "./api-client";

export const askApi = {
  ask: (input: AskRequest) =>
    apiClient.request<AskData>("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
};
