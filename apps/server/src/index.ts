import { Elysia } from "elysia";
import { randomUUID } from "node:crypto";
import { cors } from "@elysiajs/cors";
import { ErrorCode, type ApiResponse } from "@repo/types";
import { AppError } from "./lib/errors";
import { fail } from "./lib/response";
import { getDb, closeDb } from "./db/connection";
import { repoRoutes } from "./routes/repo";
import { indexRoutes } from "./routes/index";
import { askRoutes } from "./routes/ask";
import { logger } from "./lib/logger";

const corsOrigin = (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export function createApp() {
  getDb();
  return new Elysia()
    .onRequest(({ request, set }) => {
      const requestId = request.headers.get("x-request-id")
        ?? request.headers.get("X-Request-Id")
        ?? randomUUID();
      set.headers["x-request-id"] = requestId;
      logger.info({
        event: "http.request.start",
        requestId,
        method: request.method,
        path: new URL(request.url).pathname
      });
    })
    .use(cors({
      origin: corsOrigin,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-request-id", "X-Request-Id"]
    }))
    .onError(({ request, error, set }) => {
      const path = new URL(request.url).pathname;
      const requestId = set.headers["x-request-id"];
      logger.error({
        event: "http.request.error",
        requestId,
        method: request.method,
        path,
        status: set.status,
        error
      });
      if (error instanceof AppError) {
        return fail(error.code, error.message);
      }
      return fail(ErrorCode.INTERNAL_ERROR, "服务器内部错误");
    })
    .onAfterHandle(({ request, set }) => {
      const requestId = set.headers["x-request-id"];
      logger.info({
        event: "http.request.finish",
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        status: set.status ?? 200
      });
    })
    .get("/health", () => {
      const payload: ApiResponse<{ status: "ok" }> = {
        code: 0,
        message: "success",
        data: { status: "ok" }
      };
      return payload;
    })
    .use(repoRoutes)
    .use(indexRoutes)
    .use(askRoutes);
}

export const app = createApp();

const port = Number(process.env.PORT ?? 5001);
const host = process.env.HOST ?? "0.0.0.0";

if (import.meta.main) {
  app.listen({ port, hostname: host });
  logger.info({
    event: "server.started",
    host,
    port
  }, `@repo/server running at http://${host}:${port}`);
}
