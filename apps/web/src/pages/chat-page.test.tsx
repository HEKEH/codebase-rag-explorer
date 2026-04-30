import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatPage } from "./ChatPage";
import { askApi, chatApi, repoApi } from "@repo/api-client";

vi.mock("@repo/api-client", () => ({
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

function getRepoSelect(view: ReturnType<typeof render>) {
  return view.getByLabelText("选择仓库", { selector: "select" }) as HTMLSelectElement;
}

describe("ChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  test("shows all repos and disables indexing/failed options", async () => {
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
    await waitFor(() => expect(getRepoSelect(view)).toBeTruthy());

    expect(view.getByRole("option", { name: "repo-indexed (/tmp/indexed) [indexed]" })).not.toHaveAttribute("disabled");
    expect(view.getByRole("option", { name: "repo-indexing (/tmp/indexing) [indexing]" })).toHaveAttribute("disabled");
    expect(view.getByRole("option", { name: "repo-failed (https://example.com/failed.git) [failed]" })).toHaveAttribute("disabled");
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
    await waitFor(() => expect(view.getByRole("option", { name: "repo-b (/tmp/b) [indexed]" })).toBeTruthy());

    expect(getRepoSelect(view)).toHaveValue("repo-b");
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
    await waitFor(() => expect(view.getByRole("option", { name: "repo-indexed (/tmp/indexed) [indexed]" })).toBeTruthy());

    expect(getRepoSelect(view)).toHaveValue("repo-indexed");
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
    await waitFor(() => expect(getRepoSelect(view)).toBeTruthy());

    fireEvent.change(view.getByPlaceholderText("请输入你的问题"), { target: { value: "Q1" } });
    fireEvent.click(view.getByRole("button", { name: "提交问题" }));
    await waitFor(() => expect(view.getByText("Answer for repo-1")).toBeTruthy());

    fireEvent.change(getRepoSelect(view), { target: { value: "repo-2" } });
    fireEvent.change(view.getByPlaceholderText("请输入你的问题"), { target: { value: "Q2" } });
    fireEvent.click(view.getByRole("button", { name: "提交问题" }));
    await waitFor(() => expect(view.getByText("Answer for repo-2")).toBeTruthy());
    expect(view.queryByText("Answer for repo-1")).toBeNull();

    fireEvent.click(view.getByRole("button", { name: "清空当前仓库聊天历史" }));
    await waitFor(() => expect(chatApi.clearHistory).toHaveBeenCalledWith("repo-2"));
    await waitFor(() => expect(view.queryByText("Answer for repo-2")).toBeNull());

    fireEvent.change(getRepoSelect(view), { target: { value: "repo-1" } });
    expect(view.getByText("Answer for repo-1")).toBeTruthy();
  });
});
