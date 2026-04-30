import { Elysia, t } from "elysia";
import type { ImportRepoRequest } from "@repo/types";
import { RepoService } from "../services/repo.service";
import { withRequestLogger } from "../lib/logger";
import { success } from "../lib/response";

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
);
