import { Elysia, t } from "elysia";
import { ErrorCode, type ImportRepoRequest } from "@repo/types";
import { clearChatHistoryByRepoId } from "../db/chat-history.repository";
import { deleteRepoById, getRepoById, listRepos } from "../db/repo.repository";
import { AppError } from "../lib/errors";
import { RepoService } from "../services/repo.service";
import { IndexService } from "../services/index.service";
import { withRequestLogger } from "../lib/logger";
import { success } from "../lib/response";
import { clearSourceFiles } from "../store/repo.store";

const repoService = new RepoService();
const indexService = new IndexService();

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
).post(
  "/:repo_id/reload",
  ({ params, set }) => {
    const requestId = typeof set.headers["x-request-id"] === "string" ? set.headers["x-request-id"] : undefined;
    const requestLogger = withRequestLogger({ requestId });
    requestLogger.info({ event: "repos.reload.requested", repoId: params.repo_id });
    const repo = getRepoById(params.repo_id);
    if (!repo) {
      throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
    }
    if (repo.status === "indexing") {
      throw new AppError(ErrorCode.REPO_RELOADING, "仓库正在重载，请稍后再试");
    }

    // Fire-and-forget: caller observes progress via status API polling.
    void indexService.buildIndex(params.repo_id, { requestId }).catch((error) => {
      requestLogger.error({
        event: "repos.reload.background.failed",
        repoId: params.repo_id,
        error
      });
    });

    return success({
      repo_id: params.repo_id,
      status: "indexing" as const
    });
  },
  {
    params: t.Object({
      repo_id: t.String()
    })
  }
).get(
  "/:repo_id/status",
  ({ params, set }) => {
    const requestId = typeof set.headers["x-request-id"] === "string" ? set.headers["x-request-id"] : undefined;
    const requestLogger = withRequestLogger({ requestId });
    requestLogger.info({ event: "repos.status.requested", repoId: params.repo_id });
    const repo = getRepoById(params.repo_id);
    if (!repo) {
      throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
    }

    return success({
      repo_id: repo.id,
      status: repo.status,
      chunk_count: repo.chunkCount,
      file_count: repo.fileCount
    });
  },
  {
    params: t.Object({
      repo_id: t.String()
    })
  }
).delete(
  "/:repo_id/chat-history",
  ({ params, set }) => {
    const requestId = typeof set.headers["x-request-id"] === "string" ? set.headers["x-request-id"] : undefined;
    const requestLogger = withRequestLogger({ requestId });
    requestLogger.info({ event: "repos.chat_history.clear.requested", repoId: params.repo_id });
    const repo = getRepoById(params.repo_id);
    if (!repo) {
      throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
    }
    clearChatHistoryByRepoId(params.repo_id);
    requestLogger.info({ event: "repos.chat_history.clear.succeeded", repoId: params.repo_id });
    return success({
      repo_id: params.repo_id,
      cleared: true as const
    });
  },
  {
    params: t.Object({
      repo_id: t.String()
    })
  }
);
