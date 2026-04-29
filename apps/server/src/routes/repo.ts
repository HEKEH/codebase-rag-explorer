import { Elysia, t } from "elysia";
import type { ImportRepoRequest } from "@repo/types";
import { RepoService } from "../services/repo.service";
import { withRequestLogger } from "../lib/logger";
import { success } from "../lib/response";

const repoService = new RepoService();

export const repoRoutes = new Elysia({ prefix: "/api/repo" }).post(
  "/import",
  async ({ body, set }) => {
    const requestId = typeof set.headers["x-request-id"] === "string" ? set.headers["x-request-id"] : undefined;
    const startedAt = Date.now();
    const requestLogger = withRequestLogger({ requestId });
    requestLogger.info({
      event: "repo.import.requested",
      type: body.type,
      path: body.path
    });
    const data = await repoService.importRepo(body as ImportRepoRequest, { requestId });
    requestLogger.info({
      event: "repo.import.succeeded",
      repoId: data.repo_id,
      fileCount: data.file_count,
      status: data.status,
      durationMs: Date.now() - startedAt
    });
    return success(data);
  },
  {
    body: t.Object({
      path: t.String(),
      type: t.Union([t.Literal("local"), t.Literal("git")])
    })
  }
);
