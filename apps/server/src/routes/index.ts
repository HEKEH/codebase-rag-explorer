import { Elysia, t } from "elysia";
import { IndexService } from "../services/index.service";
import { success } from "../lib/response";

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
);
