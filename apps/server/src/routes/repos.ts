import { Elysia, t } from "elysia";
import { ErrorCode, type ImportRepoRequest } from "@repo/types";
import { deleteRepoById, listRepos } from "../db/repo.repository";
import { AppError } from "../lib/errors";
import { RepoService } from "../services/repo.service";
import { withRequestLogger } from "../lib/logger";
import { success } from "../lib/response";
import { clearSourceFiles } from "../store/repo.store";

const repoService = new RepoService();

export const reposRoutes = new Elysia({ prefix: "/api/repos" }).post(
  "/",
  async ({ body, set }) => {
    const requestId = typeof set.headers["x-request-id"] === "string" ? set.headers["x-request-id"] : undefined;
    const startedAt = Date.now();
    const requestLogger = withRequestLogger({ requestId });
    requestLogger.info({
      event: "repos.create.requested",
      sourceType: body.source_type,
      sourceValue: body.source_value,
      autoReload: body.auto_reload ?? false
    });

    const data = await repoService.importRepo({
      type: body.source_type,
      path: body.source_value
    } satisfies ImportRepoRequest, { requestId });

    requestLogger.info({
      event: "repos.create.succeeded",
      repoId: data.repo_id,
      fileCount: data.file_count,
      status: data.status,
      durationMs: Date.now() - startedAt
    });

    return success(data);
  },
  {
    body: t.Object({
      source_type: t.Union([t.Literal("local"), t.Literal("git")]),
      source_value: t.String(),
      auto_reload: t.Optional(t.Boolean())
    })
  }
).get(
  "/",
  ({ set }) => {
    const requestId = typeof set.headers["x-request-id"] === "string" ? set.headers["x-request-id"] : undefined;
    const requestLogger = withRequestLogger({ requestId });
    requestLogger.info({ event: "repos.list.requested" });
    const repos = listRepos().map((repo) => ({
      repo_id: repo.id,
      source_type: repo.type,
      source_value: repo.path,
      status: repo.status,
      file_count: repo.fileCount,
      chunk_count: repo.chunkCount
    }));
    requestLogger.info({ event: "repos.list.succeeded", count: repos.length });
    return success(repos);
  }
).delete(
  "/:repo_id",
  ({ params, set }) => {
    const requestId = typeof set.headers["x-request-id"] === "string" ? set.headers["x-request-id"] : undefined;
    const requestLogger = withRequestLogger({ requestId });
    requestLogger.info({ event: "repos.delete.requested", repoId: params.repo_id });
    const deletedCount = deleteRepoById(params.repo_id);
    if (deletedCount === 0) {
      throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
    }
    clearSourceFiles(params.repo_id);
    requestLogger.info({ event: "repos.delete.succeeded", repoId: params.repo_id });
    return success({
      repo_id: params.repo_id,
      deleted: true as const
    });
  },
  {
    params: t.Object({
      repo_id: t.String()
    })
  }
);
