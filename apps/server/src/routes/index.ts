import { Elysia, t } from "elysia";
import { IndexService } from "../services/index.service";
import { success } from "../lib/response";
import { getRepoById } from "../store/repo.store";
import { AppError } from "../lib/errors";
import { ErrorCode } from "@repo/types";

const indexService = new IndexService();

export const indexRoutes = new Elysia({ prefix: "/api/index" }).post(
  "/build",
  async ({ body }) => {
    const data = await indexService.buildIndex(body.repo_id);
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
