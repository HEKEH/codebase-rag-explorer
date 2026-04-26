import { Elysia, t } from "elysia";
import type { ImportRepoRequest } from "@repo/types";
import { RepoService } from "../services/repo.service";
import { success } from "../lib/response";

const repoService = new RepoService();

export const repoRoutes = new Elysia({ prefix: "/api/repo" }).post(
  "/import",
  async ({ body }) => {
    const data = await repoService.importRepo(body as ImportRepoRequest);
    return success(data);
  },
  {
    body: t.Object({
      path: t.String(),
      type: t.Union([t.Literal("local"), t.Literal("git")])
    })
  }
);
