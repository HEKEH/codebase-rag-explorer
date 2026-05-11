import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatPage } from "./ChatPage";
import { ApiError, askApi, chatApi, repoApi } from "@repo/api-client";
import type { RepoStatus } from "@repo/types";
import { getRepoStatusLabelZh } from "@/lib/repo-status-ui";

vi.mock("@repo/api-client", () => ({
  ApiError: class extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  },
  repoApi: {
    list: vi.fn(),
  },
  askApi: {
    ask: vi.fn(),
  },
  chatApi: {
    getHistory: vi.fn().mockResolvedValue({ repo_id: "", messages: [] }),
    saveMessage: vi
      .fn()
      .mockResolvedValue({ repo_id: "", message_id: "", saved: true as const }),
    clearHistory: vi.fn(),
  },
}));

function renderChatPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function getRepoSelectTrigger(view: ReturnType<typeof render>) {
  return view.getByRole("combobox");
}

/** Matches Radix Select option accessible name from ChatPage row layout. */
function repoChatSelectOptionName(
  repoId: string,
  sourceValue: string,
  status: RepoStatus,
): string {
  return `${sourceValue} ${getRepoStatusLabelZh(status)} ${repoId}`;
}

function selectRepo(
  view: ReturnType<typeof render>,
  repoId: string,
  sourceValue: string,
  status: RepoStatus,
) {
  fireEvent.click(getRepoSelectTrigger(view));
  fireEvent.click(
    view.getByRole("option", {
      name: repoChatSelectOptionName(repoId, sourceValue, status),
    }),
  );
}

function clickAlertDialogButton(
  view: ReturnType<typeof render>,
  name: string,
) {
  const dialog = view.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name }));
}

function getSelectedRepoText(view: ReturnType<typeof render>) {
  return getRepoSelectTrigger(view).textContent;
}

describe("ChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(chatApi.getHistory).mockResolvedValue({
      repo_id: "",
      messages: [],
    });
    vi.mocked(chatApi.saveMessage).mockImplementation((repoId) =>
      Promise.resolve({
        repo_id: repoId,
        message_id: `test-msg-${crypto.randomUUID()}`,
        saved: true as const,
      }),
    );
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
        chunk_count: 40,
      },
      {
        repo_id: "repo-loaded",
        source_type: "local",
        source_value: "/tmp/loaded",
        status: "loaded",
        file_count: 2,
        chunk_count: 0,
      },
      {
        repo_id: "repo-indexing",
        source_type: "local",
        source_value: "/tmp/indexing",
        status: "indexing",
        file_count: 2,
        chunk_count: 0,
      },
      {
        repo_id: "repo-failed",
        source_type: "git",
        source_value: "https://example.com/failed.git",
        status: "failed",
        file_count: 10,
        chunk_count: 12,
      },
    ]);

    const view = renderChatPage();
    await waitFor(() => expect(getRepoSelectTrigger(view)).toBeTruthy());

    fireEvent.click(getRepoSelectTrigger(view));

    expect(
      view.getByRole("option", {
        name: repoChatSelectOptionName(
          "repo-indexed",
          "/tmp/indexed",
          "indexed",
        ),
      }),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(
      view.getByRole("option", {
        name: repoChatSelectOptionName("repo-loaded", "/tmp/loaded", "loaded"),
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      view.getByRole("option", {
        name: repoChatSelectOptionName(
          "repo-indexing",
          "/tmp/indexing",
          "indexing",
        ),
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      view.getByRole("option", {
        name: repoChatSelectOptionName(
          "repo-failed",
          "https://example.com/failed.git",
          "failed",
        ),
      }),
    ).toHaveAttribute("aria-disabled", "true");
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
        chunk_count: 1,
      },
      {
        repo_id: "repo-b",
        source_type: "local",
        source_value: "/tmp/b",
        status: "indexed",
        file_count: 1,
        chunk_count: 1,
      },
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
        chunk_count: 0,
      },
      {
        repo_id: "repo-indexed",
        source_type: "local",
        source_value: "/tmp/indexed",
        status: "indexed",
        file_count: 1,
        chunk_count: 1,
      },
    ]);

    const view = renderChatPage();
    await waitFor(() =>
      expect(getSelectedRepoText(view)).toContain("repo-indexed"),
    );
  });

  test("loads chat history from server when repo is selected", async () => {
    vi.mocked(repoApi.list).mockResolvedValue([
      {
        repo_id: "repo-history",
        source_type: "local",
        source_value: "/tmp/repo-history",
        status: "indexed",
        file_count: 4,
        chunk_count: 40,
      },
    ]);
    vi.mocked(chatApi.getHistory).mockResolvedValue({
      repo_id: "repo-history",
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: "Previous question",
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Previous answer",
          created_at: "2024-01-01T00:00:01Z",
        },
      ],
    });

    const view = renderChatPage();
    await waitFor(() => expect(getRepoSelectTrigger(view)).toBeTruthy());

    await waitFor(() =>
      expect(view.getByText("Previous question")).toBeTruthy(),
    );
    await waitFor(() => expect(view.getByText("Previous answer")).toBeTruthy());
    expect(chatApi.getHistory).toHaveBeenCalledWith("repo-history");
  });

  test("switches chat history when repo changes", async () => {
    vi.mocked(repoApi.list).mockResolvedValue([
      {
        repo_id: "repo-a",
        source_type: "local",
        source_value: "/tmp/repo-a",
        status: "indexed",
        file_count: 4,
        chunk_count: 40,
      },
      {
        repo_id: "repo-b",
        source_type: "local",
        source_value: "/tmp/repo-b",
        status: "indexed",
        file_count: 4,
        chunk_count: 40,
      },
    ]);
    vi.mocked(chatApi.getHistory)
      .mockResolvedValueOnce({
        repo_id: "repo-a",
        messages: [
          {
            id: "msg-a1",
            role: "user",
            content: "Q for A",
            created_at: "2024-01-01T00:00:00Z",
          },
          {
            id: "msg-a2",
            role: "assistant",
            content: "A for A",
            created_at: "2024-01-01T00:00:01Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        repo_id: "repo-b",
        messages: [
          {
            id: "msg-b1",
            role: "user",
            content: "Q for B",
            created_at: "2024-01-01T00:00:00Z",
          },
          {
            id: "msg-b2",
            role: "assistant",
            content: "A for B",
            created_at: "2024-01-01T00:00:01Z",
          },
        ],
      });

    const view = renderChatPage();
    await waitFor(() => expect(getRepoSelectTrigger(view)).toBeTruthy());

    await waitFor(() => expect(view.getByText("Q for A")).toBeTruthy());
    expect(view.queryByText("Q for B")).toBeNull();

    selectRepo(view, "repo-b", "/tmp/repo-b", "indexed");

    await waitFor(() => expect(view.getByText("Q for B")).toBeTruthy());
    expect(view.queryByText("Q for A")).toBeNull();

    expect(chatApi.getHistory).toHaveBeenCalledWith("repo-a");
    expect(chatApi.getHistory).toHaveBeenCalledWith("repo-b");
  });

  test("saves user message and assistant response to chat history", async () => {
    vi.mocked(repoApi.list).mockResolvedValue([
      {
        repo_id: "repo-save",
        source_type: "local",
        source_value: "/tmp/repo-save",
        status: "indexed",
        file_count: 4,
        chunk_count: 40,
      },
    ]);
    vi.mocked(chatApi.getHistory).mockResolvedValue({
      repo_id: "repo-save",
      messages: [],
    });
    vi.mocked(askApi.ask).mockResolvedValue({
      answer: "Saved answer",
      references: [],
      retrieval_fusion: "weighted",
    });

    const view = renderChatPage();
    await waitFor(() => expect(getRepoSelectTrigger(view)).toBeTruthy());

    fireEvent.change(view.getByPlaceholderText("请输入你的问题"), {
      target: { value: "New question" },
    });
    fireEvent.click(view.getByRole("button", { name: "提交问题" }));

    await waitFor(() => expect(view.getByText("New question")).toBeTruthy());
    await waitFor(() => expect(view.getByText("Saved answer")).toBeTruthy());

    expect(chatApi.saveMessage).toHaveBeenCalledTimes(2);
    expect(chatApi.saveMessage).toHaveBeenCalledWith(
      "repo-save",
      "user",
      "New question",
      undefined,
      undefined,
    );
    expect(chatApi.saveMessage).toHaveBeenCalledWith(
      "repo-save",
      "assistant",
      "Saved answer",
      [],
      "weighted",
    );
  });

  test("isolates messages by repo and clears only current repo history", async () => {
    vi.mocked(repoApi.list).mockResolvedValue([
      {
        repo_id: "repo-1",
        source_type: "local",
        source_value: "/tmp/repo-1",
        status: "indexed",
        file_count: 4,
        chunk_count: 40,
      },
      {
        repo_id: "repo-2",
        source_type: "local",
        source_value: "/tmp/repo-2",
        status: "indexed",
        file_count: 4,
        chunk_count: 40,
      },
    ]);
    vi.mocked(chatApi.getHistory)
      .mockResolvedValueOnce({ repo_id: "repo-1", messages: [] })
      .mockResolvedValueOnce({ repo_id: "repo-2", messages: [] });
    vi.mocked(askApi.ask)
      .mockResolvedValueOnce({
        answer: "Answer for repo-1",
        references: [],
        retrieval_fusion: "weighted",
      })
      .mockResolvedValueOnce({
        answer: "Answer for repo-2",
        references: [],
        retrieval_fusion: "weighted",
      });
    vi.mocked(chatApi.clearHistory).mockResolvedValue({
      repo_id: "repo-2",
      cleared: true,
    });

    const view = renderChatPage();
    await waitFor(() => expect(getRepoSelectTrigger(view)).toBeTruthy());

    fireEvent.change(view.getByPlaceholderText("请输入你的问题"), {
      target: { value: "Q1" },
    });
    fireEvent.click(view.getByRole("button", { name: "提交问题" }));
    await waitFor(() =>
      expect(view.getByText("Answer for repo-1")).toBeTruthy(),
    );

    selectRepo(view, "repo-2", "/tmp/repo-2", "indexed");
    fireEvent.change(view.getByPlaceholderText("请输入你的问题"), {
      target: { value: "Q2" },
    });
    fireEvent.click(view.getByRole("button", { name: "提交问题" }));
    await waitFor(() =>
      expect(view.getByText("Answer for repo-2")).toBeTruthy(),
    );
    expect(view.queryByText("Answer for repo-1")).toBeNull();

    fireEvent.click(view.getByRole("button", { name: "清空当前仓库聊天历史" }));
    await waitFor(() => expect(view.getByRole("alertdialog")).toBeTruthy());
    clickAlertDialogButton(view, "清空");
    await waitFor(() =>
      expect(chatApi.clearHistory).toHaveBeenCalledWith("repo-2"),
    );
    await waitFor(() =>
      expect(view.queryByText("Answer for repo-2")).toBeNull(),
    );

    selectRepo(view, "repo-1", "/tmp/repo-1", "indexed");
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
        chunk_count: 40,
      },
    ]);
    vi.mocked(chatApi.getHistory).mockResolvedValue({
      repo_id: "repo-1",
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: "Existing message",
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
    });
    const view = renderChatPage();
    await waitFor(() => expect(getSelectedRepoText(view)).toContain("repo-1"));
    await waitFor(() =>
      expect(view.getByText("Existing message")).toBeTruthy(),
    );

    fireEvent.click(view.getByRole("button", { name: "清空当前仓库聊天历史" }));
    await waitFor(() => expect(view.getByRole("alertdialog")).toBeTruthy());
    clickAlertDialogButton(view, "取消");
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
        chunk_count: 40,
      },
    ]);
    vi.mocked(askApi.ask).mockRejectedValueOnce(
      new ApiError(2001, "INDEX_NOT_BUILT"),
    );

    const view = renderChatPage();
    await waitFor(() => expect(getRepoSelectTrigger(view)).toBeTruthy());

    fireEvent.change(view.getByPlaceholderText("请输入你的问题"), {
      target: { value: "Why?" },
    });
    fireEvent.click(view.getByRole("button", { name: "提交问题" }));

    await waitFor(() =>
      expect(
        view.getByText(
          "仓库索引尚未完成。请先在仓库管理页执行“构建索引/重建索引”。",
        ),
      ).toBeTruthy(),
    );
  });
});
