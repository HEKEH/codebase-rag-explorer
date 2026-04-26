import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { ErrorCode, type ApiResponse } from "@repo/types";
import { AppError } from "./lib/errors";
import { fail } from "./lib/response";
import { getDb, closeDb } from "./db/connection";
import { repoRoutes } from "./routes/repo";
import { indexRoutes } from "./routes/index";
import { retrievalRoutes } from "./routes/retrieval";
import { askRoutes } from "./routes/ask";

getDb();

const app = new Elysia()
  .use(cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  }))
  .onError(({ error }) => {
    if (error instanceof AppError) {
      if (error.code === ErrorCode.NO_RELEVANT_CODE) {
        return {
          code: ErrorCode.NO_RELEVANT_CODE,
          message: error.message,
          data: {
            answer: error.message,
            references: []
          }
        };
      }
      return fail(error.code, error.message);
    }
    return fail(ErrorCode.INTERNAL_ERROR, "服务器内部错误");
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
  .use(retrievalRoutes)
  .use(askRoutes);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app.listen({ port, hostname: host });

console.log(`@repo/server running at http://${host}:${port}`);
