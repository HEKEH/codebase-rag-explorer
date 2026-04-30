import { afterEach, describe, expect, test, vi } from "vitest";
import { apiClient, askApi, chatApi, repoApi } from "@repo/api-client";

describe("api client singleton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

test("repo/chat/ask APIs reuse one shared apiClient instance", async () => {
    const requestSpy = vi.spyOn(apiClient, "request").mockResolvedValue({} as never);

  await repoApi.create({ source_type: "local", source_value: "/tmp/repo" });
  await repoApi.list();
  await repoApi.remove("repo-1");
  await repoApi.reload("repo-1");
  await repoApi.status("repo-1");
  await chatApi.clearHistory("repo-1");
    await askApi.ask({ repo_id: "repo-1", question: "What is IndexService?" });

  expect(requestSpy).toHaveBeenCalledTimes(7);
  });
});
