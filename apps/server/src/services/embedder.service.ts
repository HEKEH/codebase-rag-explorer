import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChunkData } from "../types/chunk";
import type { EmbeddingRecord } from "../types/embedding";

const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION ?? 256);
const EMBEDDING_BATCH_SIZE = 256;

function chunkToEmbeddingInput(chunk: ChunkData): string {
  return `File: ${chunk.file_path}\n${chunk.chunk_type}: ${chunk.chunk_name ?? "anonymous"}\n\n${chunk.content}`;
}

function hashToVector(input: string, dimension: number): number[] {
  const vector = new Array<number>(dimension).fill(0);
  let seed = input;

  for (let i = 0; i < dimension; i++) {
    const hash = createHash("sha256").update(seed).digest();
    const value = hash.readUInt32BE(0) / 0xffffffff;
    vector[i] = value * 2 - 1;
    seed = `${seed}:${i}:${hash.readUInt32BE(4)}`;
  }

  return vector;
}

export class EmbedderService {
  embedQuestion(question: string): number[] {
    return hashToVector(question, EMBEDDING_DIMENSION);
  }

  async embedAndPersist(repoId: string, chunks: ChunkData[]): Promise<number> {
    const records: EmbeddingRecord[] = [];

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      for (const chunk of batch) {
        records.push({
          chunk_id: chunk.id,
          repo_id: repoId,
          vector: hashToVector(chunkToEmbeddingInput(chunk), EMBEDDING_DIMENSION),
          dimension: EMBEDDING_DIMENSION
        });
      }
    }

    const outDir = path.resolve("data", "embeddings");
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, `${repoId}.json`), JSON.stringify(records), "utf8");

    return records.length;
  }
}
