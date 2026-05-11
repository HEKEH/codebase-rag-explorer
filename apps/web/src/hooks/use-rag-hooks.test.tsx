import { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { askApi, chatApi, indexApi, repoApi } from "@repo/api-client";
import {
  useAskQuestion,
  useBuildIndex,
  useClearRepoChatHistory,
  useCreateRepo,
  useImportRepo,
  useIndexStatus,
  useReloadRepo,
} from "./use-rag-hooks";

vi.mock("@repo/api-client", () => ({
  repoApi: {
    create: vi.fn(),
    status: vi.fn(),
    reload: vi.fn(),
  },
  indexApi: {
    build: vi.fn(),
  },
  askApi: {
    ask: vi.fn(),
  },
  chatApi: {
    clearHistory: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
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
    vi.mocked(repoApi.create).mockResolvedValueOnce({
      repo_id: "repo-1",
      status: "loaded",
      file_count: 3,
    });

    const { result } = renderHook(() => useImportRepo(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ path: "/tmp/repo", type: "local" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(repoApi.create).toHaveBeenCalledWith({
      source_type: "local",
      source_value: "/tmp/repo",
    });
  });

  test("useCreateRepo covers loading/success states", async () => {
    let resolveCreate:
      | ((value: {
          repo_id: string;
          status: "loaded";
          file_count: number;
        }) => void)
      | null = null;
    vi.mocked(repoApi.create).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const { result } = renderHook(() => useCreateRepo(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      source_type: "local",
      source_value: "/tmp/repo-2",
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(resolveCreate).not.toBeNull();
    resolveCreate!({ repo_id: "repo-2", status: "loaded", file_count: 4 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(repoApi.create).toHaveBeenCalledWith({
      source_type: "local",
      source_value: "/tmp/repo-2",
    });
  });

  test("useCreateRepo exposes error state", async () => {
    vi.mocked(repoApi.create).mockRejectedValueOnce(new Error("create failed"));

    const { result } = renderHook(() => useCreateRepo(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      source_type: "git",
      source_value: "https://example.com/repo.git",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("create failed");
  });

  test("useBuildIndex calls index build api", async () => {
    vi.mocked(indexApi.build).mockResolvedValueOnce({
      repo_id: "repo-1",
      status: "indexing",
      chunk_count: 0,
    });

    const { result } = renderHook(() => useBuildIndex(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ repo_id: "repo-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(indexApi.build).toHaveBeenCalledWith({ repo_id: "repo-1" });
  });

  test("useAskQuestion calls ask api and returns answer", async () => {
    vi.mocked(askApi.ask).mockResolvedValueOnce({
      answer: "IndexService builds embeddings.",
      references: [],
      retrieval_fusion: "weighted",
    });

    const { result } = renderHook(() => useAskQuestion(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      repo_id: "repo-1",
      question: "What does IndexService do?",
    });

    await waitFor(() =>
      expect(result.current.data?.answer).toContain("embeddings"),
    );
    expect(askApi.ask).toHaveBeenCalledWith({
      repo_id: "repo-1",
      question: "What does IndexService do?",
    });
  });

  test("useReloadRepo covers success and error states", async () => {
    vi.mocked(repoApi.reload)
      .mockResolvedValueOnce({
        repo_id: "repo-1",
        status: "indexing",
        chunk_count: 0,
      })
      .mockRejectedValueOnce(new Error("reload failed"));

    const successHook = renderHook(() => useReloadRepo(), {
      wrapper: createWrapper(),
    });
    successHook.result.current.mutate("repo-1");
    await waitFor(() =>
      expect(successHook.result.current.isSuccess).toBe(true),
    );
    expect(repoApi.reload).toHaveBeenCalledWith("repo-1");

    const errorHook = renderHook(() => useReloadRepo(), {
      wrapper: createWrapper(),
    });
    errorHook.result.current.mutate("repo-2");
    await waitFor(() => expect(errorHook.result.current.isError).toBe(true));
    expect(errorHook.result.current.error?.message).toBe("reload failed");
  });

  test("useClearRepoChatHistory covers success and error states", async () => {
    vi.mocked(chatApi.clearHistory)
      .mockResolvedValueOnce({
        repo_id: "repo-1",
        cleared: true,
      })
      .mockRejectedValueOnce(new Error("clear failed"));

    const successHook = renderHook(() => useClearRepoChatHistory(), {
      wrapper: createWrapper(),
    });
    successHook.result.current.mutate("repo-1");
    await waitFor(() =>
      expect(successHook.result.current.isSuccess).toBe(true),
    );
    expect(chatApi.clearHistory).toHaveBeenCalledWith("repo-1");

    const errorHook = renderHook(() => useClearRepoChatHistory(), {
      wrapper: createWrapper(),
    });
    errorHook.result.current.mutate("repo-2");
    await waitFor(() => expect(errorHook.result.current.isError).toBe(true));
    expect(errorHook.result.current.error?.message).toBe("clear failed");
  });

  test("useIndexStatus polls until status becomes indexed", async () => {
    vi.mocked(repoApi.status)
      .mockResolvedValueOnce({
        repo_id: "repo-1",
        status: "indexing",
        file_count: 10,
        chunk_count: 0,
      })
      .mockResolvedValueOnce({
        repo_id: "repo-1",
        status: "indexed",
        file_count: 10,
        chunk_count: 220,
      });

    const { result } = renderHook(() => useIndexStatus("repo-1", 10), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(repoApi.status).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data?.status).toBe("indexed"));
    expect(repoApi.status).toHaveBeenCalledTimes(2);
  });

  test("useIndexStatus does not request when repoId is blank string", async () => {
    const { result } = renderHook(() => useIndexStatus("   ", 10), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    await waitFor(() => expect(repoApi.status).not.toHaveBeenCalled());
  });
});
