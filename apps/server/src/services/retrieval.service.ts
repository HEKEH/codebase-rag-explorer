import { readFile } from "node:fs/promises";
import path from "node:path";
import { ErrorCode } from "@repo/types";
import { runtimeConfig } from "../config/runtime";
import { AppError } from "../lib/errors";
import type { ChunkData } from "../types/chunk";
import type { EmbeddingRecord } from "../types/embedding";
import type { RetrievalResult } from "../types/retrieval";
import { EmbedderService } from "./embedder.service";

const embedderService = new EmbedderService();

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const dim = Math.min(a.length, b.length);
  for (let i = 0; i < dim; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function readChunks(repoId: string): Promise<ChunkData[]> {
  const file = path.resolve("data", "chunks", `${repoId}.json`);
  const content = await readFile(file, "utf8").catch(() => null);
  if (!content) throw new AppError(ErrorCode.INDEX_NOT_BUILT, "请先构建索引");
  return JSON.parse(content) as ChunkData[];
}

async function readEmbeddings(repoId: string): Promise<EmbeddingRecord[]> {
  const file = path.resolve("data", "embeddings", `${repoId}.json`);
  const content = await readFile(file, "utf8").catch(() => null);
  if (!content) throw new AppError(ErrorCode.INDEX_NOT_BUILT, "请先构建索引");
  return JSON.parse(content) as EmbeddingRecord[];
}

export class RetrievalService {
  async retrieve(question: string, repoId: string, topK = runtimeConfig.defaultTopK): Promise<RetrievalResult[]> {
    const [chunks, embeddings] = await Promise.all([readChunks(repoId), readEmbeddings(repoId)]);
    if (chunks.length === 0 || embeddings.length === 0) {
      return [];
    }

    const queryVector = embedderService.embedQuestion(question);
    const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    const ranked = embeddings
      .map((item) => {
        const chunk = chunkById.get(item.chunk_id);
        if (!chunk) return null;
        return {
          chunk,
          score: cosineSimilarity(queryVector, item.vector)
        };
      })
      .filter((item): item is { chunk: ChunkData; score: number } => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return ranked.map(({ chunk, score }) => ({
      chunk_id: chunk.id,
      file_path: chunk.file_path,
      content: chunk.content,
      chunk_type: chunk.chunk_type,
      chunk_name: chunk.chunk_name,
      score
    }));
  }
}
