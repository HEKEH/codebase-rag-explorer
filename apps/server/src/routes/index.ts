import { Elysia, t } from "elysia";
import {
  ErrorCode,
  type BuildIndexData,
  type IndexStatusData,
} from "@repo/types";
import { getRepoById } from "../db/repo.repository";
import { IndexService } from "../services/index.service";
import { AppError } from "../lib/errors";
import { withRequestLogger } from "../lib/logger";
import { success } from "../lib/response";

const indexService = new IndexService();

export const indexRoutes = new Elysia({ prefix: "/api/index" })
  .post(
    "/build",
    ({ body, set }) => {
      const requestId =
        typeof set.headers["x-request-id"] === "string"
          ? set.headers["x-request-id"]
          : undefined;
      const requestLogger = withRequestLogger({ requestId });
      requestLogger.info({
        event: "index.build.requested",
        repoId: body.repo_id,
      });
      const repo = getRepoById(body.repo_id);
      if (!repo) {
        throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
      }
      if (repo.status === "indexing" || repo.status === "indexed") {
        throw new AppError(
          ErrorCode.INDEX_ALREADY_EXISTS,
          "索引已存在或正在构建",
        );
      }

      // Fire-and-forget background indexing. Real-time progress is read from /api/index/status.
      void indexService
        .buildIndex(body.repo_id, { requestId })
        .catch((error) => {
          requestLogger.error({
            event: "index.build.background.failed",
            repoId: body.repo_id,
            error,
          });
        });

      const data: BuildIndexData = {
        repo_id: body.repo_id,
        chunk_count: repo.chunkCount,
        status: "indexing",
      };
      return success(data);
    },
    {
      body: t.Object({
        repo_id: t.String(),
      }),
    },
  )
  .get(
    "/status",
    ({ query, set }) => {
      const requestId =
        typeof set.headers["x-request-id"] === "string"
          ? set.headers["x-request-id"]
          : undefined;
      const requestLogger = withRequestLogger({ requestId });
      requestLogger.debug({
        event: "index.status.requested",
        repoId: query.repo_id,
      });
      const repo = getRepoById(query.repo_id);
      if (!repo) {
        throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
      }
      const data: IndexStatusData = {
        repo_id: repo.id,
        status: repo.status,
        chunk_count: repo.chunkCount,
        file_count: repo.fileCount,
      };
      return success(data);
    },
    {
      query: t.Object({
        repo_id: t.String(),
      }),
    },
  );
