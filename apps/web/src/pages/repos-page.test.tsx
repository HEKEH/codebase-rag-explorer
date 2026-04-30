import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ReposPage } from "./ReposPage";
import { repoApi } from "@repo/api-client";

vi.mock("@repo/api-client", () => ({
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

    fireEvent.click(view.getByRole("button", { name: "删除 repo-2" }));
    await waitFor(() => expect(repoApi.remove).toHaveBeenCalledWith("repo-2"));

    fireEvent.click(view.getByRole("button", { name: "重载 repo-1" }));
    await waitFor(() => expect(repoApi.reload).toHaveBeenCalledWith("repo-1"));
  });
});
