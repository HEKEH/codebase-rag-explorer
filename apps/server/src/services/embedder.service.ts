import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { EMBEDDING_BATCH_SIZE } from "@repo/constants";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { ChunkData } from "../types/chunk";
import type { EmbeddingRecord } from "../types/embedding";
import { chunkToSparseIndexBody } from "../lib/chunk-index-text";
import {
  resolveEmbeddingModelPathOrId,
  resolveLocalModelSpec,
} from "../lib/embedding-model-config";
import { logger } from "../lib/logger";
import {
  EXPECTED_EMBEDDING_DIMENSION,
  XenovaEmbeddingsClient,
} from "./xenova-embeddings.client";

function chunkToEmbeddingInput(chunk: ChunkData): string {
  return chunkToSparseIndexBody(chunk);
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
      const resolvedModel = resolveEmbeddingModelPathOrId();
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
