import { ErrorCode } from "@repo/types";
import { Elysia, t } from "elysia";
import { AppError } from "../lib/errors";
import { success } from "../lib/response";
import { AskService } from "../services/ask.service";

const askService = new AskService();

export const askRoutes = new Elysia({ prefix: "/api" }).post(
  "/ask",
  async ({ body }) => {
    try {
      const data = await askService.ask(body.repo_id, body.question, body.top_k);
      return success(data);
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.NO_RELEVANT_CODE) {
        return {
          code: ErrorCode.NO_RELEVANT_CODE,
          message: error.message,
          data: {
            answer: error.message,
            references: []
          }
        };
      }
      throw error;
    }
  },
  {
    body: t.Object({
      repo_id: t.String(),
      question: t.String(),
      top_k: t.Optional(t.Number({ minimum: 1, maximum: 20 }))
    })
  }
);
