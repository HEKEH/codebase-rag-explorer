import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { EMBEDDING_BATCH_SIZE } from "@repo/constants";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import type { ChunkData } from "../types/chunk";
import type { EmbeddingRecord } from "../types/embedding";

const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";
const EXPECTED_EMBEDDING_DIMENSION = 768;

function chunkToEmbeddingInput(chunk: ChunkData): string {
  return `File: ${chunk.file_path}\n${chunk.chunk_type}: ${chunk.chunk_name ?? "anonymous"}\n\n${chunk.content}`;
}

interface EmbeddingsClient {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

interface EmbedderPersistOptions {
  batchSize?: number;
}

export class EmbedderService {
  private readonly embeddings: EmbeddingsClient;

  constructor(embeddingsClient?: EmbeddingsClient) {
    this.embeddings =
      embeddingsClient ??
      new HuggingFaceTransformersEmbeddings({
        model: EMBEDDING_MODEL
      });
  }

  async embedQuestion(question: string): Promise<number[]> {
    return this.embeddings.embedQuery(question);
  }

  async embedAndPersist(repoId: string, chunks: ChunkData[], options: EmbedderPersistOptions = {}): Promise<number> {
    const records: EmbeddingRecord[] = [];
    const batchSize = options.batchSize ?? EMBEDDING_BATCH_SIZE;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const inputs = batch.map(chunkToEmbeddingInput);
      const vectors = await this.embeddings.embedDocuments(inputs);

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
