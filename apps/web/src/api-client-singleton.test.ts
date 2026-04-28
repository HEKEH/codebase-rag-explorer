import { afterEach, describe, expect, test, vi } from "vitest";
import { apiClient, askApi, indexApi, repoApi } from "@repo/api-client";

describe("api client singleton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("repo/index/ask APIs reuse one shared apiClient instance", async () => {
    const requestSpy = vi.spyOn(apiClient, "request").mockResolvedValue({} as never);

    await repoApi.import({ path: "/tmp/repo", type: "local" });
    await indexApi.build({ repo_id: "repo-1" });
    await askApi.ask({ repo_id: "repo-1", question: "What is IndexService?" });

    expect(requestSpy).toHaveBeenCalledTimes(3);
  });
});
