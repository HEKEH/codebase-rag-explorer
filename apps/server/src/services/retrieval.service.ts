import { ErrorCode } from "@repo/types";
import { runtimeConfig } from "../config/runtime";
import { AppError } from "../lib/errors";
import { SQLiteVectorStore } from "../lib/sqlite-vector-store";
import type { RetrievalResult } from "../types/retrieval";
import { EmbedderService } from "./embedder.service";

interface QueryEmbedder {
  embedQuestion(question: string): Promise<number[]>;
  getEmbeddingsClient?(): ConstructorParameters<typeof SQLiteVectorStore>[0];
}

interface RetrievalVectorStore {
  similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: { repo_id?: string; chunk_ids?: string[] }
  ): Promise<Array<[{
    pageContent: string;
    metadata: Record<string, unknown>;
  }, number]>>;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value;
  return null;
}

function toString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export class RetrievalService {
  private readonly vectorStore: RetrievalVectorStore;

  constructor(
    private readonly embedder: QueryEmbedder = new EmbedderService(),
    vectorStore?: RetrievalVectorStore
  ) {
    this.vectorStore =
      vectorStore ??
      new SQLiteVectorStore(
        this.embedder.getEmbeddingsClient
          ? this.embedder.getEmbeddingsClient()
          : new EmbedderService().getEmbeddingsClient()
      );
  }

  async retrieve(question: string, repoId: string, topK = runtimeConfig.defaultTopK): Promise<RetrievalResult[]> {
    const queryVector = await this.embedder.embedQuestion(question);
    try {
      const ranked = await this.vectorStore.similaritySearchVectorWithScore(queryVector, topK, { repo_id: repoId });
      return ranked.map(([doc, score]) => ({
        chunk_id: toString(doc.metadata.chunk_id),
        file_path: toString(doc.metadata.file_path),
        content: doc.pageContent,
        chunk_type: toString(doc.metadata.chunk_type, "generic"),
        chunk_name: toStringOrNull(doc.metadata.chunk_name),
        score
      }));
    } catch {
      throw new AppError(ErrorCode.INDEX_NOT_BUILT, "请先构建索引");
    }
  }
}
