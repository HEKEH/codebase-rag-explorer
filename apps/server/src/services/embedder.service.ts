import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { EMBEDDING_BATCH_SIZE } from "@repo/constants";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { ChunkData } from "../types/chunk";
import type { EmbeddingRecord } from "../types/embedding";
import { logger } from "../lib/logger";
import {
  EXPECTED_EMBEDDING_DIMENSION,
  XenovaEmbeddingsClient,
  type LocalModelSpec,
} from "./xenova-embeddings.client";

const DEFAULT_EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";

function resolveRepoRootDir() {
  // When running from `apps/server`, the embedding download script and stable models are located at repo root.
  // Anchoring relative paths to repo root avoids resolving `./models/...` into `apps/server/models/...`.
  return process.cwd().endsWith("/apps/server")
    ? path.join(process.cwd(), "..", "..")
    : process.cwd();
}

function resolveEmbeddingModel(model: string): string {
  // When users download models locally, they typically set EMBEDDING_MODEL to a relative path
  // (e.g. "./models/...") so we must resolve it to an absolute path.
  if (
    model.startsWith(".") ||
    model.startsWith("/") ||
    model.startsWith("..")
  ) {
    const repoRoot = resolveRepoRootDir();
    return path.resolve(repoRoot, model);
  }
  return model;
}

function resolveLocalModelSpec(modelAbsOrId: string): LocalModelSpec | null {
  const modelAbs = modelAbsOrId;
  if (!existsSync(modelAbs)) return null;

  // Expected local snapshot layout:
  //   <repoRoot>/models/<owner>/<name>/
  // where `<owner>/<name>` is what transformers.js pipeline expects.
  const owner = path.basename(path.dirname(modelAbs));
  const modelIdName = path.basename(modelAbs);
  const localModelPath = path.dirname(path.dirname(modelAbs));

  if (!owner || !modelIdName) return null;
  return { modelId: `${owner}/${modelIdName}`, localModelPath };
}

function chunkToEmbeddingInput(chunk: ChunkData): string {
  return `File: ${chunk.file_path}\n${chunk.chunk_type}: ${chunk.chunk_name ?? "anonymous"}\n\n${chunk.content}`;
}

/** Same strings as {@link EmbedderService.embedChunks} sends to the model. */
export function chunksToEmbeddingInputs(chunks: ChunkData[]): string[] {
  return chunks.map(chunkToEmbeddingInput);
}

interface EmbedderPersistOptions {
  batchSize?: number;
}

export class EmbedderService {
  private readonly embeddings: EmbeddingsInterface;

  constructor(embeddingsClient?: EmbeddingsInterface) {
    if (embeddingsClient) {
      this.embeddings = embeddingsClient;
    } else {
      const resolvedModel = resolveEmbeddingModel(
        process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
      );
      this.embeddings = new XenovaEmbeddingsClient(
        resolvedModel,
        resolveLocalModelSpec(resolvedModel),
      );
    }
  }

  getEmbeddingsClient(): EmbeddingsInterface {
    return this.embeddings;
  }

  async embedQuestion(question: string): Promise<number[]> {
    return this.embeddings.embedQuery(question);
  }

  async embedChunks(chunks: ChunkData[]): Promise<number[][]> {
    return this.embeddings.embedDocuments(chunks.map(chunkToEmbeddingInput));
  }

  async embedAndPersist(
    repoId: string,
    chunks: ChunkData[],
    options: EmbedderPersistOptions = {},
  ): Promise<number> {
    const records: EmbeddingRecord[] = [];
    const batchSize = options.batchSize ?? EMBEDDING_BATCH_SIZE;
    const startedAt = Date.now();
    logger.info({
      event: "embedder.persist.started",
      repoId,
      chunkCount: chunks.length,
      persistBatchSize: batchSize,
    });

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchStartedAt = Date.now();
      const vectors = await this.embedChunks(batch);

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const vector = vectors[j] ?? [];
        records.push({
          chunk_id: chunk.id,
          repo_id: repoId,
          vector,
          dimension: vector.length || EXPECTED_EMBEDDING_DIMENSION,
        });
      }
      logger.debug({
        event: "embedder.persist.batch.finished",
        repoId,
        batchStart: i,
        batchSize: batch.length,
        durationMs: Date.now() - batchStartedAt,
      });
    }

    const outDir = path.resolve("data", "embeddings");
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, `${repoId}.json`),
      JSON.stringify(records),
      "utf8",
    );

    logger.info({
      event: "embedder.persist.finished",
      repoId,
      recordCount: records.length,
      durationMs: Date.now() - startedAt,
    });
    return records.length;
  }
}
