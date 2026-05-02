import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatPage } from "./ChatPage";
import { ApiError, askApi, chatApi, repoApi } from "@repo/api-client";

vi.mock("@repo/api-client", () => ({
  ApiError: class extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  },
  repoApi: {
    list: vi.fn()
  },
  askApi: {
    ask: vi.fn()
  },
  chatApi: {
    clearHistory: vi.fn()
  }
}));

function renderChatPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function getRepoSelectTrigger(view: ReturnType<typeof render>) {
  return view.getByRole("combobox");
}

function selectRepo(view: ReturnType<typeof render>, repoId: string, repoText: string) {
  fireEvent.click(getRepoSelectTrigger(view));
  fireEvent.click(view.getByRole("option", { name: repoText }));
}

function getSelectedRepoText(view: ReturnType<typeof render>) {
  return getRepoSelectTrigger(view).textContent;
}

describe("ChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("shows all repos and only enables indexed options", async () => {
    vi.mocked(repoApi.list).mockResolvedValue([
      {
        repo_id: "repo-indexed",
        source_type: "local",
        source_value: "/tmp/indexed",
        status: "indexed",
        file_count: 4,
        chunk_count: 40
      },
      {
        repo_id: "repo-loaded",
        source_type: "local",
        source_value: "/tmp/loaded",
        status: "loaded",
        file_count: 2,
        chunk_count: 0
      },
      {
        repo_id: "repo-indexing",
        source_type: "local",
        source_value: "/tmp/indexing",
        status: "indexing",
        file_count: 2,
        chunk_count: 0
      },
      {
        repo_id: "repo-failed",
        source_type: "git",
        source_value: "https://example.com/failed.git",
        status: "failed",
        file_count: 10,
        chunk_count: 12
      }
    ]);

    const view = renderChatPage();
    await waitFor(() => expect(getRepoSelectTrigger(view)).toBeTruthy());

    fireEvent.click(getRepoSelectTrigger(view));

    expect(view.getByRole("option", { name: "repo-indexed (/tmp/indexed) [indexed]" })).not.toHaveAttribute("aria-disabled", "true");
    expect(view.getByRole("option", { name: "repo-loaded (/tmp/loaded) [loaded]" })).toHaveAttribute("aria-disabled", "true");
    expect(view.getByRole("option", { name: "repo-indexing (/tmp/indexing) [indexing]" })).toHaveAttribute("aria-disabled", "true");
    expect(view.getByRole("option", { name: "repo-failed (https://example.com/failed.git) [failed]" })).toHaveAttribute("aria-disabled", "true");
  });

  test("restores selected repo from localStorage", async () => {
    window.localStorage.setItem("lastOpenedRepoId", "repo-b");
    vi.mocked(repoApi.list).mockResolvedValue([
      {
        repo_id: "repo-a",
        source_type: "local",
        source_value: "/tmp/a",
        status: "indexed",
        file_count: 1,
        chunk_count: 1
      },
      {
        repo_id: "repo-b",
        source_type: "local",
        source_value: "/tmp/b",
        status: "indexed",
        file_count: 1,
        chunk_count: 1
      }
    ]);

    const view = renderChatPage();
    await waitFor(() => expect(getSelectedRepoText(view)).toContain("repo-b"));
  });

  test("falls back to first available non-disabled repo when localStorage repo is missing", async () => {
    window.localStorage.setItem("lastOpenedRepoId", "repo-missing");
    vi.mocked(repoApi.list).mockResolvedValue([
      {
        repo_id: "repo-indexing",
        source_type: "local",
        source_value: "/tmp/indexing",
        status: "indexing",
        file_count: 1,
        chunk_count: 0
      },
      {
        repo_id: "repo-indexed",
        source_type: "local",
        source_value: "/tmp/indexed",
        status: "indexed",
        file_count: 1,
        chunk_count: 1
      }
    ]);

    const view = renderChatPage();
    await waitFor(() => expect(getSelectedRepoText(view)).toContain("repo-indexed"));
  });

  test("isolates messages by repo and clears only current repo history", async () => {
    vi.mocked(repoApi.list).mockResolvedValue([
      {
        repo_id: "repo-1",
        source_type: "local",
        source_value: "/tmp/repo-1",
        status: "indexed",
        file_count: 4,
        chunk_count: 40
      },
      {
        repo_id: "repo-2",
        source_type: "local",
        source_value: "/tmp/repo-2",
        status: "indexed",
        file_count: 4,
        chunk_count: 40
      }
    ]);
    vi.mocked(askApi.ask)
      .mockResolvedValueOnce({
        answer: "Answer for repo-1",
        references: []
      })
      .mockResolvedValueOnce({
        answer: "Answer for repo-2",
        references: []
      });
    vi.mocked(chatApi.clearHistory).mockResolvedValue({
      repo_id: "repo-2",
      cleared: true
    });

    const view = renderChatPage();
    await waitFor(() => expect(getRepoSelectTrigger(view)).toBeTruthy());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    fireEvent.change(view.getByPlaceholderText("请输入你的问题"), { target: { value: "Q1" } });
    fireEvent.click(view.getByRole("button", { name: "提交问题" }));
    await waitFor(() => expect(view.getByText("Answer for repo-1")).toBeTruthy());

    selectRepo(view, "repo-2", "repo-2 (/tmp/repo-2) [indexed]");
    fireEvent.change(view.getByPlaceholderText("请输入你的问题"), { target: { value: "Q2" } });
    fireEvent.click(view.getByRole("button", { name: "提交问题" }));
    await waitFor(() => expect(view.getByText("Answer for repo-2")).toBeTruthy());
    expect(view.queryByText("Answer for repo-1")).toBeNull();

    fireEvent.click(view.getByRole("button", { name: "清空当前仓库聊天历史" }));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(chatApi.clearHistory).toHaveBeenCalledWith("repo-2"));
    await waitFor(() => expect(view.queryByText("Answer for repo-2")).toBeNull());

    selectRepo(view, "repo-1", "repo-1 (/tmp/repo-1) [indexed]");
    expect(view.getByText("Answer for repo-1")).toBeTruthy();
  });

  test("does not clear history when confirm dialog is cancelled", async () => {
    vi.mocked(repoApi.list).mockResolvedValue([
      {
        repo_id: "repo-1",
        source_type: "local",
        source_value: "/tmp/repo-1",
        status: "indexed",
        file_count: 4,
        chunk_count: 40
      }
    ]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const view = renderChatPage();
    await waitFor(() => expect(getSelectedRepoText(view)).toContain("repo-1"));

    fireEvent.click(view.getByRole("button", { name: "清空当前仓库聊天历史" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(chatApi.clearHistory).not.toHaveBeenCalled();
  });

  test("shows explicit guidance when asking before index is built", async () => {
    vi.mocked(repoApi.list).mockResolvedValue([
      {
        repo_id: "repo-1",
        source_type: "local",
        source_value: "/tmp/repo-1",
        status: "indexed",
        file_count: 4,
        chunk_count: 40
      }
    ]);
    vi.mocked(askApi.ask).mockRejectedValueOnce(new ApiError(2001, "INDEX_NOT_BUILT"));

    const view = renderChatPage();
    await waitFor(() => expect(getRepoSelectTrigger(view)).toBeTruthy());

    fireEvent.change(view.getByPlaceholderText("请输入你的问题"), { target: { value: "Why?" } });
    fireEvent.click(view.getByRole("button", { name: "提交问题" }));

    await waitFor(() =>
      expect(view.getByText("仓库索引尚未完成。请先在仓库管理页执行“构建索引/重建索引”。")).toBeTruthy()
    );
  });
});
