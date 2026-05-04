import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { env as xenovaEnv, pipeline } from "@xenova/transformers";
import { logger } from "../lib/logger";

export const EXPECTED_EMBEDDING_DIMENSION = 768;

const EMBEDDING_INFER_BATCH_SIZE = Number(
  process.env.EMBEDDING_INFER_BATCH_SIZE ?? "16",
);

export type LocalModelSpec = {
  modelId: string; // e.g. "nomic-ai/nomic-embed-text-v1.5"
  localModelPath: string; // e.g. "/repo/models"
};

function chunkArray<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * LangChain-compatible embeddings backed by @xenova/transformers feature-extraction.
 */
export class XenovaEmbeddingsClient implements EmbeddingsInterface {
  private pipelinePromise: Promise<any> | null = null;

  constructor(
    private readonly modelIdOrAbsPath: string,
    private readonly localModelSpec: LocalModelSpec | null,
  ) {
    if (this.localModelSpec) {
      xenovaEnv.allowRemoteModels = false;
      xenovaEnv.allowLocalModels = true;
      xenovaEnv.localModelPath = this.localModelSpec.localModelPath;
    } else {
      // Default to remote-disabled for CI stability; if local model isn't available, the pipeline will throw.
      xenovaEnv.allowRemoteModels = false;
      xenovaEnv.allowLocalModels = true;
    }
  }

  private async getPipeline() {
    if (!this.pipelinePromise) {
      const modelName = this.localModelSpec?.modelId ?? this.modelIdOrAbsPath;
      const startedAt = Date.now();
      logger.info({
        event: "embedder.pipeline.loading.started",
        model: modelName,
        localModelPath: this.localModelSpec?.localModelPath ?? null,
      });
      this.pipelinePromise = pipeline("feature-extraction", modelName);
      this.pipelinePromise = this.pipelinePromise.then((loaded) => {
        logger.info({
          event: "embedder.pipeline.loading.finished",
          model: modelName,
          durationMs: Date.now() - startedAt,
        });
        return loaded;
      });
    }
    return this.pipelinePromise;
  }

  async embedQuery(text: string): Promise<number[]> {
    const p = await this.getPipeline();
    const out = await (p as any)(text, {
      pooling: "mean",
      normalize: true,
    } as any);
    const tensor = out as any;
    return Array.from(tensor.data as Float32Array);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const p = await this.getPipeline();
    const outVectors: number[][] = [];
    const internalBatchSize = Math.max(1, EMBEDDING_INFER_BATCH_SIZE);
    const totalBatches = Math.ceil(texts.length / internalBatchSize);
    logger.debug({
      event: "embedder.documents.embedding.started",
      textCount: texts.length,
      inferBatchSize: internalBatchSize,
      totalBatches,
    });

    const batches = chunkArray(texts, internalBatchSize);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const startedAt = Date.now();
      const out = await (p as any)(batch, {
        pooling: "mean",
        normalize: true,
      } as any);
      const tensor = out as any;
      const tensorData = tensor.data as Float32Array;
      const dim =
        tensor.dims?.[tensor.dims.length - 1] ?? EXPECTED_EMBEDDING_DIMENSION;

      for (let i = 0; i < batch.length; i++) {
        const start = i * dim;
        const end = start + dim;
        outVectors.push(Array.from(tensorData.subarray(start, end)));
      }
      logger.debug({
        event: "embedder.documents.embedding.batch.finished",
        batchIndex: batchIndex + 1,
        totalBatches,
        batchSize: batch.length,
        durationMs: Date.now() - startedAt,
      });
    }

    logger.info({
      event: "embedder.documents.embedding.finished",
      textCount: texts.length,
      vectorCount: outVectors.length,
      inferBatchSize: internalBatchSize,
    });
    return outVectors;
  }
}
