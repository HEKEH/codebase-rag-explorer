import { ErrorCode } from "@repo/types";
import { Elysia, t } from "elysia";
import { AppError } from "../lib/errors";
import { withRequestLogger } from "../lib/logger";
import { success } from "../lib/response";
import { AskService } from "../services/ask.service";

const askService = new AskService();

export const askRoutes = new Elysia({ prefix: "/api" }).post(
  "/ask",
  async ({ body, set }) => {
    const requestId = typeof set.headers["x-request-id"] === "string" ? set.headers["x-request-id"] : undefined;
    const startedAt = Date.now();
    const requestLogger = withRequestLogger({ requestId });
    requestLogger.info({
      event: "ask.requested",
      repoId: body.repo_id,
      topK: body.top_k
    });
    try {
      const data = await askService.ask(body.repo_id, body.question, body.top_k, { requestId });
      requestLogger.info({
        event: "ask.succeeded",
        repoId: body.repo_id,
        references: data.references.length,
        answerLength: data.answer.length,
        durationMs: Date.now() - startedAt
      });
      return success(data);
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.NO_RELEVANT_CODE) {
        requestLogger.warn({
          event: "ask.no_relevant_code",
          repoId: body.repo_id,
          durationMs: Date.now() - startedAt
        });
        return {
          code: ErrorCode.NO_RELEVANT_CODE,
          message: error.message,
          data: {
            answer: error.message,
            references: []
          }
        };
      }
      requestLogger.error({
        event: "ask.failed",
        repoId: body.repo_id,
        durationMs: Date.now() - startedAt,
        error
      });
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
