import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ReposPage } from "./ReposPage";
import { ApiError, repoApi } from "@repo/api-client";

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
    create: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn()
  }
}));

describe("ReposPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("supports list, create, remove and reload actions", async () => {
    vi.mocked(repoApi.list)
      .mockResolvedValueOnce([
        {
          repo_id: "repo-1",
          source_type: "local",
          source_value: "/tmp/repo-1",
          status: "indexed",
          file_count: 10,
          chunk_count: 120
        }
      ])
      .mockResolvedValueOnce([
        {
          repo_id: "repo-1",
          source_type: "local",
          source_value: "/tmp/repo-1",
          status: "indexed",
          file_count: 10,
          chunk_count: 120
        },
        {
          repo_id: "repo-2",
          source_type: "git",
          source_value: "https://example.com/repo-2.git",
          status: "loaded",
          file_count: 3,
          chunk_count: 0
        }
      ])
      .mockResolvedValueOnce([
        {
          repo_id: "repo-1",
          source_type: "local",
          source_value: "/tmp/repo-1",
          status: "indexed",
          file_count: 10,
          chunk_count: 120
        },
        {
          repo_id: "repo-2",
          source_type: "git",
          source_value: "https://example.com/repo-2.git",
          status: "loaded",
          file_count: 3,
          chunk_count: 0
        }
      ])
      .mockResolvedValueOnce([
        {
          repo_id: "repo-1",
          source_type: "local",
          source_value: "/tmp/repo-1",
          status: "indexed",
          file_count: 10,
          chunk_count: 120
        }
      ])
      .mockResolvedValue([
        {
          repo_id: "repo-1",
          source_type: "local",
          source_value: "/tmp/repo-1",
          status: "indexed",
          file_count: 10,
          chunk_count: 120
        }
      ]);
    vi.mocked(repoApi.create).mockResolvedValue({
      repo_id: "repo-2",
      status: "loaded",
      file_count: 3
    });
    vi.mocked(repoApi.remove).mockResolvedValue({
      repo_id: "repo-2",
      deleted: true
    });
    vi.mocked(repoApi.reload).mockResolvedValue({
      repo_id: "repo-1",
      status: "indexing",
      chunk_count: 0
    });

    const view = render(
      <MemoryRouter>
        <ReposPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(view.getByText("/tmp/repo-1")).toBeTruthy());

    fireEvent.change(view.getByPlaceholderText("输入本地路径或 Git URL"), {
      target: { value: "https://example.com/repo-2.git" }
    });
    fireEvent.click(view.getByRole("button", { name: "添加仓库" }));
    await waitFor(() => expect(repoApi.create).toHaveBeenCalledWith({ source_type: "git", source_value: "https://example.com/repo-2.git" }));
    await waitFor(() => expect(view.getByText("https://example.com/repo-2.git")).toBeTruthy());

    fireEvent.click(view.getByRole("button", { name: "构建索引 repo-2" }));
    await waitFor(() => expect(repoApi.reload).toHaveBeenCalledWith("repo-2"));

    fireEvent.click(view.getByRole("button", { name: "删除 repo-2" }));
    await waitFor(() => expect(repoApi.remove).toHaveBeenCalledWith("repo-2"));

    fireEvent.click(view.getByRole("button", { name: "重建索引 repo-1" }));
    await waitFor(() => expect(repoApi.reload).toHaveBeenCalledWith("repo-1"));
  });

  test("asks to reload when create returns duplicate repo code 1002", async () => {
    vi.mocked(repoApi.list)
      .mockResolvedValueOnce([
        {
          repo_id: "repo-1",
          source_type: "local",
          source_value: "/tmp/repo-1",
          status: "indexed",
          file_count: 10,
          chunk_count: 120
        }
      ])
      .mockResolvedValue([
        {
          repo_id: "repo-1",
          source_type: "local",
          source_value: "/tmp/repo-1",
          status: "indexed",
          file_count: 10,
          chunk_count: 120
        }
      ]);
    vi.mocked(repoApi.create).mockRejectedValueOnce(new ApiError(1002, "REPO_ALREADY_EXISTS"));
    vi.mocked(repoApi.reload).mockResolvedValue({
      repo_id: "repo-1",
      status: "indexing",
      chunk_count: 0
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(true);

    const view = render(
      <MemoryRouter>
        <ReposPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(view.getByText("/tmp/repo-1")).toBeTruthy());

    fireEvent.change(view.getByPlaceholderText("输入本地路径或 Git URL"), {
      target: { value: "/tmp/repo-1" }
    });
    fireEvent.click(view.getByRole("button", { name: "添加仓库" }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    await waitFor(() => expect(repoApi.reload).toHaveBeenCalledWith("repo-1"));
  });

  test("shows fallback message when duplicate repo refresh fails", async () => {
    vi.mocked(repoApi.list)
      .mockResolvedValueOnce([
        {
          repo_id: "repo-1",
          source_type: "local",
          source_value: "/tmp/repo-1",
          status: "indexed",
          file_count: 10,
          chunk_count: 120
        }
      ])
      .mockRejectedValueOnce(new Error("list failed"));
    vi.mocked(repoApi.create).mockRejectedValueOnce(new ApiError(1002, "REPO_ALREADY_EXISTS"));

    const view = render(
      <MemoryRouter>
        <ReposPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(view.getByText("/tmp/repo-1")).toBeTruthy());

    fireEvent.change(view.getByPlaceholderText("输入本地路径或 Git URL"), {
      target: { value: "/tmp/repo-1/" }
    });
    fireEvent.click(view.getByRole("button", { name: "添加仓库" }));

    await waitFor(() => expect(view.getByText("仓库已存在，但刷新仓库列表失败，请稍后重试。")).toBeTruthy());
  });

  test("does not reload when duplicate-confirm dialog is cancelled", async () => {
    vi.mocked(repoApi.list)
      .mockResolvedValueOnce([
        {
          repo_id: "repo-1",
          source_type: "local",
          source_value: "/tmp/repo-1",
          status: "indexed",
          file_count: 10,
          chunk_count: 120
        }
      ])
      .mockResolvedValueOnce([
        {
          repo_id: "repo-1",
          source_type: "local",
          source_value: "/tmp/repo-1",
          status: "indexed",
          file_count: 10,
          chunk_count: 120
        }
      ]);
    vi.mocked(repoApi.create).mockRejectedValueOnce(new ApiError(1002, "REPO_ALREADY_EXISTS"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);

    const view = render(
      <MemoryRouter>
        <ReposPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(view.getByText("/tmp/repo-1")).toBeTruthy());

    fireEvent.change(view.getByPlaceholderText("输入本地路径或 Git URL"), {
      target: { value: "/tmp/repo-1" }
    });
    fireEvent.click(view.getByRole("button", { name: "添加仓库" }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(repoApi.reload).not.toHaveBeenCalled();
    expect(view.getByText("已取消重载")).toBeTruthy();
  });

  test("shows disabled indexing button when repo is indexing", async () => {
    vi.mocked(repoApi.list).mockResolvedValueOnce([
      {
        repo_id: "repo-indexing",
        source_type: "local",
        source_value: "/tmp/repo-indexing",
        status: "indexing",
        file_count: 1,
        chunk_count: 0
      }
    ]);

    const view = render(
      <MemoryRouter>
        <ReposPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(view.getByText("/tmp/repo-indexing")).toBeTruthy());
    const indexingButton = view.getByRole("button", { name: "索引中... repo-indexing" });
    expect(indexingButton).toBeDisabled();
  });

  test("shows explicit message when deleting a non-existent repo", async () => {
    vi.mocked(repoApi.list).mockResolvedValueOnce([
      {
        repo_id: "repo-404",
        source_type: "local",
        source_value: "/tmp/repo-404",
        status: "indexed",
        file_count: 1,
        chunk_count: 1
      }
    ]);
    vi.mocked(repoApi.remove).mockRejectedValueOnce(new ApiError(1003, "REPO_NOT_FOUND"));

    const view = render(
      <MemoryRouter>
        <ReposPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(view.getByText("/tmp/repo-404")).toBeTruthy());

    fireEvent.click(view.getByRole("button", { name: "删除 repo-404" }));
    await waitFor(() =>
      expect(view.getByText("仓库不存在。请先到仓库管理页确认仓库仍在列表中，再重试当前操作。")).toBeTruthy()
    );
  });

  test("shows explicit message when reload conflicts with in-progress indexing", async () => {
    vi.mocked(repoApi.list).mockResolvedValueOnce([
      {
        repo_id: "repo-busy",
        source_type: "local",
        source_value: "/tmp/repo-busy",
        status: "indexed",
        file_count: 1,
        chunk_count: 1
      }
    ]);
    vi.mocked(repoApi.reload).mockRejectedValueOnce(new ApiError(1004, "REPO_RELOADING"));

    const view = render(
      <MemoryRouter>
        <ReposPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(view.getByText("/tmp/repo-busy")).toBeTruthy());

    fireEvent.click(view.getByRole("button", { name: "重建索引 repo-busy" }));
    await waitFor(() =>
      expect(view.getByText("仓库正在重载中。请稍后刷新状态，待索引完成后再继续操作。")).toBeTruthy()
    );
  });
});
