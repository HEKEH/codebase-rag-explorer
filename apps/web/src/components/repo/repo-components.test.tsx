import { FormEvent } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RepoInput } from "./RepoInput";
import { RepoStatus } from "./RepoStatus";
import { App } from "@/App";
import { repoApi } from "@repo/api-client";

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

describe("repo components", () => {
  afterEach(() => {
    cleanup();
  });

  test("RepoInput triggers submit with current path", () => {
    const onPathChange = vi.fn();
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    const view = render(
      <RepoInput
        repoPath="/tmp/repo"
        isLoading={false}
        onRepoPathChange={onPathChange}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(view.getByPlaceholderText("输入本地路径或 Git URL"), {
      target: { value: "/next/path" }
    });
    fireEvent.submit(view.getByTestId("repo-input-form"));

    expect(onPathChange).toHaveBeenCalledWith("/next/path");
    expect(onSubmit).toHaveBeenCalled();
  });

  test("RepoStatus shows stats and enables build button", () => {
    const onBuildIndex = vi.fn();
    const view = render(
      <RepoStatus status="loaded" fileCount={12} chunkCount={0} canBuildIndex onBuildIndex={onBuildIndex} />
    );

    expect(view.getByText("状态：loaded")).toBeTruthy();
    expect(view.getByText("文件数：12")).toBeTruthy();
    expect(view.getByText("Chunk 数：0")).toBeTruthy();
    expect(view.getByRole("button", { name: "构建索引" })).not.toHaveAttribute("disabled");
  });

  test("App import flow stays available", async () => {
    vi.mocked(repoApi.import).mockResolvedValueOnce({
      repo_id: "repo-1",
      status: "loaded",
      file_count: 5
    });
    vi.mocked(repoApi.status).mockResolvedValue({
      repo_id: "repo-1",
      status: "loaded",
      file_count: 5,
      chunk_count: 0
    });

    const view = render(<App />);
    fireEvent.change(view.getByPlaceholderText("输入本地路径或 Git URL"), { target: { value: "/tmp/repo" } });
    fireEvent.click(view.getByRole("button", { name: "导入仓库" }));

    await waitFor(() => expect(view.getByText("状态：loaded")).toBeTruthy());
  });
});
