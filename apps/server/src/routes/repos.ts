import { Elysia, t } from "elysia";
import {
  ErrorCode,
  type ChatHistoryRole,
  type ClearRepoChatHistoryData,
  type CreateRepoRequest,
  type DeleteRepoData,
  type GetRepoChatHistoryData,
  type ImportRepoRequest,
  type IndexStatusData,
  type Reference,
  type RepoListItemData,
  type SaveRepoChatMessageData,
} from "@repo/types";
import {
  clearChatHistoryByRepoId,
  getChatHistoryByRepoId,
  saveChatMessage,
} from "../db/chat-history.repository";
import { deleteRepoById, getRepoById, listRepos } from "../db/repo.repository";
import { AppError } from "../lib/errors";
import { RepoService } from "../services/repo.service";
import { IndexService } from "../services/index.service";
import { withRequestLogger } from "../lib/logger";
import { success } from "../lib/response";
import { clearSourceFiles, getSourceFiles } from "../store/repo.store";

const repoService = new RepoService();
const indexService = new IndexService();

export const reposRoutes = new Elysia({ prefix: "/api/repos" })
  .post(
    "/",
    async ({ body, set }) => {
      const requestId =
        typeof set.headers["x-request-id"] === "string"
          ? set.headers["x-request-id"]
          : undefined;
      const startedAt = Date.now();
      const requestLogger = withRequestLogger({ requestId });
      requestLogger.info({
        event: "repos.create.requested",
        sourceType: body.source_type,
        sourceValue: body.source_value,
        autoReload: body.auto_reload ?? false,
      });

      const createPayload: CreateRepoRequest = {
        source_type: body.source_type,
        source_value: body.source_value,
        auto_reload: body.auto_reload,
      };
      const data = await repoService.importRepo(
        {
          type: createPayload.source_type,
          path: createPayload.source_value,
        } satisfies ImportRepoRequest,
        { requestId },
      );

      requestLogger.info({
        event: "repos.create.succeeded",
        repo_id: data.repo_id,
        fileCount: data.file_count,
        status: data.status,
        durationMs: Date.now() - startedAt,
      });

      return success(data);
    },
    {
      body: t.Object({
        source_type: t.Union([t.Literal("local"), t.Literal("git")]),
        source_value: t.String(),
        auto_reload: t.Optional(t.Boolean()),
      }),
    },
  )
  .get("/", ({ set }) => {
    const requestId =
      typeof set.headers["x-request-id"] === "string"
        ? set.headers["x-request-id"]
        : undefined;
    const requestLogger = withRequestLogger({ requestId });
    requestLogger.info({ event: "repos.list.requested" });
    const repos: RepoListItemData[] = listRepos().map((repo) => ({
      repo_id: repo.id,
      source_type: repo.type,
      source_value: repo.path,
      status: repo.status,
      file_count: repo.fileCount,
      chunk_count: repo.chunkCount,
    }));
    requestLogger.info({ event: "repos.list.succeeded", count: repos.length });
    return success(repos);
  })
  .delete(
    "/:repo_id",
    ({ params, set }) => {
      const requestId =
        typeof set.headers["x-request-id"] === "string"
          ? set.headers["x-request-id"]
          : undefined;
      const requestLogger = withRequestLogger({ requestId });
      requestLogger.info({
        event: "repos.delete.requested",
        repo_id: params.repo_id,
      });
      const deletedCount = deleteRepoById(params.repo_id);
      if (deletedCount === 0) {
        throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
      }
      clearSourceFiles(params.repo_id);
      requestLogger.info({
        event: "repos.delete.succeeded",
        repo_id: params.repo_id,
      });
      const data: DeleteRepoData = {
        repo_id: params.repo_id,
        deleted: true as const,
      };
      return success(data);
    },
    {
      params: t.Object({
        repo_id: t.String(),
      }),
    },
  )
  .post(
    "/:repo_id/reload",
    async ({ params, set }) => {
      const requestId =
        typeof set.headers["x-request-id"] === "string"
          ? set.headers["x-request-id"]
          : undefined;
      const requestLogger = withRequestLogger({ requestId });
      requestLogger.info({
        event: "repos.reload.requested",
        repo_id: params.repo_id,
      });
      const repo = getRepoById(params.repo_id);
      if (!repo) {
        throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
      }
      if (repo.status === "indexing") {
        throw new AppError(
          ErrorCode.REPO_RELOADING,
          "仓库正在重载，请稍后再试",
        );
      }
      if (!getSourceFiles(params.repo_id)) {
        requestLogger.info({
          event: "repos.reload.source_files.recover.started",
          repo_id: params.repo_id,
          sourceType: repo.type,
        });
        const restored = await repoService.ensureSourceFiles(repo, {
          requestId,
        });
        if (!restored) {
          requestLogger.warn({
            event: "repos.reload.source_files.recover.failed",
            repo_id: params.repo_id,
            sourceType: repo.type,
          });
          throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库源文件未加载");
        }
        requestLogger.info({
          event: "repos.reload.source_files.recover.succeeded",
          repo_id: params.repo_id,
          sourceType: repo.type,
          fileCount: getSourceFiles(params.repo_id)?.length ?? 0,
        });
      }

      // Fire-and-forget: caller observes progress via status API polling.
      void indexService
        .buildIndex(params.repo_id, { requestId })
        .catch((error) => {
          requestLogger.error({
            event: "repos.reload.background.failed",
            repo_id: params.repo_id,
            error,
          });
        });

      const data = {
        repo_id: params.repo_id,
        status: "indexing" as const,
      };
      return success(data);
    },
    {
      params: t.Object({
        repo_id: t.String(),
      }),
    },
  )
  .get(
    "/:repo_id/status",
    ({ params, set }) => {
      const requestId =
        typeof set.headers["x-request-id"] === "string"
          ? set.headers["x-request-id"]
          : undefined;
      const requestLogger = withRequestLogger({ requestId });
      requestLogger.info({
        event: "repos.status.requested",
        repo_id: params.repo_id,
      });
      const repo = getRepoById(params.repo_id);
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
      params: t.Object({
        repo_id: t.String(),
      }),
    },
  )
  .get(
    "/:repo_id/chat-history",
    ({ params, set }) => {
      const requestId =
        typeof set.headers["x-request-id"] === "string"
          ? set.headers["x-request-id"]
          : undefined;
      const requestLogger = withRequestLogger({ requestId });
      requestLogger.info({
        event: "repos.chat_history.get.requested",
        repo_id: params.repo_id,
      });
      const repo = getRepoById(params.repo_id);
      if (!repo) {
        throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
      }
      const records = getChatHistoryByRepoId(params.repo_id);
      const messages = records.map((record) => {
        let references: Reference[] | undefined;
        if (record.referencesJson) {
          try {
            references = JSON.parse(record.referencesJson) as Reference[];
          } catch {
            references = undefined;
          }
        }
        return {
          id: record.id,
          role: record.role,
          content: record.content,
          references,
          created_at: record.createdAt,
        };
      });
      requestLogger.info({
        event: "repos.chat_history.get.succeeded",
        repo_id: params.repo_id,
        messageCount: messages.length,
      });
      const data: GetRepoChatHistoryData = {
        repo_id: params.repo_id,
        messages,
      };
      return success(data);
    },
    {
      params: t.Object({
        repo_id: t.String(),
      }),
    },
  )
  .post(
    "/:repo_id/chat-history",
    ({ params, body, set }) => {
      const requestId =
        typeof set.headers["x-request-id"] === "string"
          ? set.headers["x-request-id"]
          : undefined;
      const requestLogger = withRequestLogger({ requestId });
      requestLogger.info({
        event: "repos.chat_history.save.requested",
        repo_id: params.repo_id,
      });
      const repo = getRepoById(params.repo_id);
      if (!repo) {
        throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
      }
      const typedBody = body as {
        role: ChatHistoryRole;
        content: string;
        references?: Reference[];
      };
      const referencesJson =
        typedBody.role !== "error" && typedBody.references
          ? JSON.stringify(typedBody.references)
          : undefined;
      const messageId = saveChatMessage(
        params.repo_id,
        typedBody.role,
        typedBody.content,
        referencesJson,
      );
      requestLogger.info({
        event: "repos.chat_history.save.succeeded",
        repo_id: params.repo_id,
        messageId,
      });
      const data: SaveRepoChatMessageData = {
        repo_id: params.repo_id,
        message_id: messageId,
        saved: true as const,
      };
      return success(data);
    },
    {
      params: t.Object({
        repo_id: t.String(),
      }),
      body: t.Object({
        role: t.Union([
          t.Literal("user"),
          t.Literal("assistant"),
          t.Literal("error"),
        ]),
        content: t.String(),
        references: t.Optional(
          t.Array(
            t.Object({
              chunk_id: t.String(),
              file_path: t.String(),
              snippet: t.String(),
              score: t.Number(),
            }),
          ),
        ),
      }),
    },
  )
  .delete(
    "/:repo_id/chat-history",
    ({ params, set }) => {
      const requestId =
        typeof set.headers["x-request-id"] === "string"
          ? set.headers["x-request-id"]
          : undefined;
      const requestLogger = withRequestLogger({ requestId });
      requestLogger.info({
        event: "repos.chat_history.clear.requested",
        repo_id: params.repo_id,
      });
      const repo = getRepoById(params.repo_id);
      if (!repo) {
        throw new AppError(ErrorCode.REPO_NOT_FOUND, "仓库不存在");
      }
      clearChatHistoryByRepoId(params.repo_id);
      requestLogger.info({
        event: "repos.chat_history.clear.succeeded",
        repo_id: params.repo_id,
      });
      const data: ClearRepoChatHistoryData = {
        repo_id: params.repo_id,
        cleared: true as const,
      };
      return success(data);
    },
    {
      params: t.Object({
        repo_id: t.String(),
      }),
    },
  );
