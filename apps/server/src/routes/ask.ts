import { Elysia, t } from "elysia";
import { success } from "../lib/response";
import { AskService } from "../services/ask.service";

const askService = new AskService();

export const askRoutes = new Elysia({ prefix: "/api" }).post(
  "/ask",
  async ({ body }) => {
    const data = await askService.ask(body.repo_id, body.question, body.top_k);
    return success(data);
  },
  {
    body: t.Object({
      repo_id: t.String(),
      question: t.String(),
      top_k: t.Optional(t.Number({ minimum: 1, maximum: 20 }))
    })
  }
);
