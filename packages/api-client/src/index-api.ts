import type { BuildIndexData, BuildIndexRequest } from "@repo/types";
import { apiClient } from "./api-client";

export const indexApi = {
  build: (input: BuildIndexRequest) =>
    apiClient.request<BuildIndexData>("/api/index/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
};
