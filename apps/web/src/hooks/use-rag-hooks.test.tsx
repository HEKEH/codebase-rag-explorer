import { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { askApi, indexApi, repoApi } from "@repo/api-client";
import {
  useAskQuestion,
  useBuildIndex,
  useImportRepo,
  useIndexStatus
} from "./use-rag-hooks";

vi.mock("@repo/api-client", () => ({
  repoApi: {
    import: vi.fn(),
    status: vi.fn()
  },
  indexApi: {
    build: vi.fn()
  },
  askApi: {
    ask: vi.fn()
  }
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("rag hooks", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("useImportRepo calls repo import api", async () => {
    vi.mocked(repoApi.import).mockResolvedValueOnce({
      repo_id: "repo-1",
      status: "loaded",
      file_count: 3
    });

    const { result } = renderHook(() => useImportRepo(), { wrapper: createWrapper() });
    result.current.mutate({ path: "/tmp/repo", type: "local" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(repoApi.import).toHaveBeenCalledWith({ path: "/tmp/repo", type: "local" });
  });

  test("useBuildIndex calls index build api", async () => {
    vi.mocked(indexApi.build).mockResolvedValueOnce({
      repo_id: "repo-1",
      status: "indexing",
      chunk_count: 0
    });

    const { result } = renderHook(() => useBuildIndex(), { wrapper: createWrapper() });
    result.current.mutate({ repo_id: "repo-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(indexApi.build).toHaveBeenCalledWith({ repo_id: "repo-1" });
  });

  test("useAskQuestion calls ask api and returns answer", async () => {
    vi.mocked(askApi.ask).mockResolvedValueOnce({
      answer: "IndexService builds embeddings.",
      references: []
    });

    const { result } = renderHook(() => useAskQuestion(), { wrapper: createWrapper() });
    result.current.mutate({ repo_id: "repo-1", question: "What does IndexService do?" });

    await waitFor(() => expect(result.current.data?.answer).toContain("embeddings"));
    expect(askApi.ask).toHaveBeenCalledWith({
      repo_id: "repo-1",
      question: "What does IndexService do?"
    });
  });

  test("useIndexStatus polls until status becomes indexed", async () => {
    vi.mocked(repoApi.status)
      .mockResolvedValueOnce({
        repo_id: "repo-1",
        status: "indexing",
        file_count: 10,
        chunk_count: 0
      })
      .mockResolvedValueOnce({
        repo_id: "repo-1",
        status: "indexed",
        file_count: 10,
        chunk_count: 220
      });

    const { result } = renderHook(() => useIndexStatus("repo-1", 10), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(repoApi.status).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data?.status).toBe("indexed"));
    expect(repoApi.status).toHaveBeenCalledTimes(2);
  });

  test("useIndexStatus does not request when repoId is blank string", async () => {
    const { result } = renderHook(() => useIndexStatus("   ", 10), {
      wrapper: createWrapper()
    });

    expect(result.current.fetchStatus).toBe("idle");
    await waitFor(() => expect(repoApi.status).not.toHaveBeenCalled());
  });
});
