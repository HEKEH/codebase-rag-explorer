import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { EMBEDDING_BATCH_SIZE } from "@repo/constants";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { ChunkData } from "../types/chunk";
import type { EmbeddingRecord } from "../types/embedding";
import { env as xenovaEnv, pipeline } from "@xenova/transformers";

const DEFAULT_EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";
const EXPECTED_EMBEDDING_DIMENSION = 768;

function resolveRepoRootDir() {
  // When running from `apps/server`, the embedding download script and stable models are located at repo root.
  // Anchoring relative paths to repo root avoids resolving `./models/...` into `apps/server/models/...`.
  return process.cwd().endsWith("/apps/server") ? path.join(process.cwd(), "..", "..") : process.cwd();
}

function resolveEmbeddingModel(model: string): string {
  // When users download models locally, they typically set EMBEDDING_MODEL to a relative path
  // (e.g. "./models/...") so we must resolve it to an absolute path.
  if (model.startsWith(".") || model.startsWith("/") || model.startsWith("..")) {
    const repoRoot = resolveRepoRootDir();
    return path.resolve(repoRoot, model);
  }
  return model;
}
type LocalModelSpec = {
  modelId: string; // e.g. "nomic-ai/nomic-embed-text-v1.5"
  localModelPath: string; // e.g. "/repo/models"
};

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

function chunkArray<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

function chunkToEmbeddingInput(chunk: ChunkData): string {
  return `File: ${chunk.file_path}\n${chunk.chunk_type}: ${chunk.chunk_name ?? "anonymous"}\n\n${chunk.content}`;
}

interface EmbedderPersistOptions {
  batchSize?: number;
}

export class EmbedderService {
  private readonly embeddings: EmbeddingsInterface;

  constructor(embeddingsClient?: EmbeddingsInterface) {
    this.embeddings =
      embeddingsClient ??
      new (class XenovaEmbeddingsClient implements EmbeddingsInterface {
        private pipelinePromise: Promise<any> | null = null;

        constructor(
          private readonly modelIdOrAbsPath: string,
          private readonly localModelSpec: LocalModelSpec | null
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
            this.pipelinePromise = pipeline("feature-extraction", this.localModelSpec?.modelId ?? this.modelIdOrAbsPath);
          }
          return this.pipelinePromise;
        }

        async embedQuery(text: string): Promise<number[]> {
          const p = await this.getPipeline();
          const out = await (p as any)(text, { pooling: "mean", normalize: true } as any);
          // In this code path `out` is a Tensor.
          const tensor = out as any;
          return Array.from(tensor.data as Float32Array);
        }

        async embedDocuments(texts: string[]): Promise<number[][]> {
          const p = await this.getPipeline();
          const outVectors: number[][] = [];
          const internalBatchSize = 64; // Avoid huge single batches in node CPU.

          for (const batch of chunkArray(texts, internalBatchSize)) {
            const out = await (p as any)(batch, { pooling: "mean", normalize: true } as any);
            const tensor = out as any;
            const tensorData = tensor.data as Float32Array;
            const dim = tensor.dims?.[tensor.dims.length - 1] ?? EXPECTED_EMBEDDING_DIMENSION;

            for (let i = 0; i < batch.length; i++) {
              const start = i * dim;
              const end = start + dim;
              outVectors.push(Array.from(tensorData.subarray(start, end)));
            }
          }

          return outVectors;
        }
      })(resolveEmbeddingModel(process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL), resolveLocalModelSpec(resolveEmbeddingModel(process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL)));
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

  async embedAndPersist(repoId: string, chunks: ChunkData[], options: EmbedderPersistOptions = {}): Promise<number> {
    const records: EmbeddingRecord[] = [];
    const batchSize = options.batchSize ?? EMBEDDING_BATCH_SIZE;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const vectors = await this.embedChunks(batch);

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const vector = vectors[j] ?? [];
        records.push({
          chunk_id: chunk.id,
          repo_id: repoId,
          vector,
          dimension: vector.length || EXPECTED_EMBEDDING_DIMENSION
        });
      }
    }

    const outDir = path.resolve("data", "embeddings");
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, `${repoId}.json`), JSON.stringify(records), "utf8");

    return records.length;
  }
}
