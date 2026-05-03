/**
 * Runs ONNX / transformers.js embedding for index builds off the main thread.
 * Loaded via `node:worker_threads` from `index-embedding-worker-pool.ts`.
 */
import { parentPort } from "node:worker_threads";
import { EmbedderService } from "../services/embedder.service";

const embedder = new EmbedderService();

type EmbedRequest = { id: number; texts: string[] };

parentPort?.on("message", async (msg: EmbedRequest) => {
  try {
    const client = embedder.getEmbeddingsClient();
    const vectors = await client.embedDocuments(msg.texts);
    parentPort?.postMessage({
      id: msg.id,
      ok: true as const,
      vectors,
    });
  } catch (error) {
    parentPort?.postMessage({
      id: msg.id,
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
