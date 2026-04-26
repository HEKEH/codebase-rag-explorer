import { Elysia } from "elysia";
import { ErrorCode, type ApiResponse } from "@repo/types";
import { AppError } from "./lib/errors";
import { fail } from "./lib/response";
import { repoRoutes } from "./routes/repo";
import { indexRoutes } from "./routes/index";
import { retrievalRoutes } from "./routes/retrieval";
import { askRoutes } from "./routes/ask";

const app = new Elysia()
  .onError(({ error }) => {
    if (error instanceof AppError) {
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
