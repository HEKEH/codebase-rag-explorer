import { Elysia, t } from "elysia";
import { ErrorCode, type BuildIndexData } from "@repo/types";
import { getRepoById } from "../db/repo.repository";
import { IndexService } from "../services/index.service";
import { AppError } from "../lib/errors";
import { success } from "../lib/response";

const indexService = new IndexService();

export const indexRoutes = new Elysia({ prefix: "/api/index" }).post(
  "/build",
  ({ body }) => {
    const repo = getRepoById(body.repo_id);
    if (!repo) {
      throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库不存在");
    }

    // Fire-and-forget background indexing. Real-time progress is read from /api/index/status.
    void indexService.buildIndex(body.repo_id).catch((error) => {
      console.error("[index/build] background indexing failed", error);
    });

    const data: BuildIndexData = {
      repo_id: body.repo_id,
      chunk_count: repo.chunkCount,
      status: "indexing"
    };
    return success(data);
  },
  {
    body: t.Object({
      repo_id: t.String()
    })
  }
).get(
  "/status",
  ({ query }) => {
    const repo = getRepoById(query.repo_id);
    if (!repo) {
      throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库不存在");
    }
    return success({
      repo_id: repo.id,
      status: repo.status,
      chunk_count: repo.chunkCount,
      file_count: repo.fileCount
    });
  },
  {
    query: t.Object({
      repo_id: t.String()
    })
  }
);
