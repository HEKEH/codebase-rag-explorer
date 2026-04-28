import type { AskData, AskRequest } from "@repo/types";
import { ApiClient } from "./client";

const client = new ApiClient("http://localhost:5001");

export const askApi = {
  ask: (input: AskRequest) =>
    client.request<AskData>("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
};
