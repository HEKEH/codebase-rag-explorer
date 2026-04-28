import type { BuildIndexData, BuildIndexRequest } from "@repo/types";
import { ApiClient } from "./client";

const client = new ApiClient("http://localhost:5001");

export const indexApi = {
  build: (input: BuildIndexRequest) =>
    client.request<BuildIndexData>("/api/index/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
};
