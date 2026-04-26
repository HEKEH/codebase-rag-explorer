import { Elysia, t } from "elysia";
import { success } from "../lib/response";
import { RetrievalService } from "../services/retrieval.service";

const retrievalService = new RetrievalService();

export const retrievalRoutes = new Elysia({ prefix: "/api/retrieval" }).post(
  "/search",
  async ({ body }) => {
    const results = await retrievalService.retrieve(body.question, body.repo_id, body.top_k);
    return success(results);
  },
  {
    body: t.Object({
      repo_id: t.String(),
      question: t.String(),
      top_k: t.Optional(t.Number({ minimum: 1, maximum: 20 }))
    })
  }
);
