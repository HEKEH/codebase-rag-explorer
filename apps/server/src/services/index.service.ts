import { ErrorCode, type BuildIndexData } from "@repo/types";
import { Document } from "@langchain/core/documents";
import { deleteEmbeddingsByRepoId } from "../db/embedding.repository";
import { saveChunks } from "../db/chunk.repository";
import { deleteChunksByRepoId } from "../db/chunk.repository";
import {
  getRepoById,
  updateRepoFileCount,
  updateRepoChunkCount,
  updateRepoStatus,
  clearRepoEmbeddingMeta,
  updateRepoEmbeddingMeta,
} from "../db/repo.repository";
import { AppError } from "../lib/errors";
import { type RequestLogContext, withRequestLogger } from "../lib/logger";
import {
  getCanonicalEmbeddingModelId,
  parseConfiguredEmbeddingDimension,
} from "../lib/embedding-model-config";
import { SQLiteVectorStore } from "../lib/sqlite-vector-store";
import { getIndexEmbeddingPool } from "../lib/index-embedding-worker-pool";
import { getSourceFiles } from "../store/repo.store";
import type { ChunkData } from "../types/chunk";
import {
  chunksToEmbeddingInputs,
  EmbedderService,
} from "./embedder.service";
import { SplitterService } from "./splitter.service";

const splitterService = new SplitterService();

/** Ask / vector-store compatibility; ONNX document batches run in a worker pool. */
const indexEmbedderBase = new EmbedderService();

const defaultIndexEmbedder: IndexEmbedder = {
  getEmbeddingsClient: () => indexEmbedderBase.getEmbeddingsClient(),
  embedChunks: async (chunks) => {
    if (process.env.INDEX_USE_EMBEDDING_WORKER === "0") {
      return indexEmbedderBase.embedChunks(chunks);
    }
    return getIndexEmbeddingPool().embedDocuments(
      chunksToEmbeddingInputs(chunks),
    );
  },
};

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

export interface IndexSplitter {
  splitFile(
    repoId: string,
    file: { path: string; content: string },
  ): Promise<ChunkData[]>;
}

interface IndexEmbedder {
  embedChunks(chunks: ChunkData[]): Promise<number[][]>;
  getEmbeddingsClient(): ConstructorParameters<typeof SQLiteVectorStore>[0];
}

interface IndexServiceDeps {
  splitter?: IndexSplitter;
  embedder?: IndexEmbedder;
  vectorStore?: SQLiteVectorStore;
}

export class IndexService {
  private readonly splitter: IndexSplitter;
  private readonly embedder: IndexEmbedder;
  private readonly vectorStore: SQLiteVectorStore;

  constructor(deps: IndexServiceDeps = {}) {
    this.splitter = deps.splitter ?? splitterService;
    this.embedder = deps.embedder ?? defaultIndexEmbedder;
    this.vectorStore =
      deps.vectorStore ??
      new SQLiteVectorStore(this.embedder.getEmbeddingsClient());
  }

  async buildIndex(
    repoId: string,
    context?: RequestLogContext,
  ): Promise<BuildIndexData> {
    const startedAt = Date.now();
    const requestLogger = withRequestLogger(context);
    requestLogger.info({
      event: "index.service.started",
      repoId,
    });
    const repo = getRepoById(repoId);
    if (!repo) {
      throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库不存在");
    }
    if (repo.status === "indexing") {
      throw new AppError(
        ErrorCode.INDEX_ALREADY_EXISTS,
        "索引已存在或正在构建",
      );
    }

    const files = getSourceFiles(repoId);
    if (!files) {
      throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库源文件未加载");
    }

    updateRepoStatus(repoId, "indexing");
    updateRepoFileCount(repoId, files.length);

    try {
      if (repo.status === "indexed" || repo.status === "failed") {
        // Reload should rebuild index from scratch to avoid stale chunks/embeddings.
        deleteEmbeddingsByRepoId(repoId);
        deleteChunksByRepoId(repoId);
        clearRepoEmbeddingMeta(repoId);
      }

      const chunks: ChunkData[] = [];
      for (const file of files) {
        chunks.push(...(await this.splitter.splitFile(repoId, file)));
        await yieldEventLoop();
      }
      requestLogger.info({
        event: "index.service.split.finished",
        repoId,
        fileCount: files.length,
        chunkCount: chunks.length,
      });

      saveChunks(chunks);
      await yieldEventLoop();

      const vectors = await this.embedder.embedChunks(chunks);
      if (vectors.length !== chunks.length) {
        throw new AppError(
          ErrorCode.EMBEDDING_FAILED,
          "向量化结果数量与 chunk 不一致",
        );
      }

      if (chunks.length > 0) {
        if (vectors.some((v) => v.length === 0)) {
          throw new AppError(ErrorCode.EMBEDDING_FAILED, "向量化未产生任何向量");
        }
        const dim = vectors[0]?.length ?? 0;
        if (vectors.some((v) => v.length !== dim)) {
          throw new AppError(ErrorCode.EMBEDDING_FAILED, "批次向量维度不一致");
        }
        const expectedDim = parseConfiguredEmbeddingDimension();
        if (expectedDim !== null && dim !== expectedDim) {
          throw new AppError(
            ErrorCode.EMBEDDING_FAILED,
            `向量维度 ${dim} 与 EMBEDDING_DIMENSION=${expectedDim} 不一致`,
          );
        }
        const documents = chunks.map(
          (chunk) =>
            new Document({
              pageContent: chunk.content,
              metadata: {
                chunk_id: chunk.id,
                repo_id: chunk.repo_id,
                file_path: chunk.file_path,
                chunk_type: chunk.chunk_type,
                chunk_name: chunk.chunk_name,
                start_line: chunk.start_line,
                end_line: chunk.end_line,
              },
            }),
        );
        const modelId = getCanonicalEmbeddingModelId();
        await this.vectorStore.addVectors(vectors, documents, { model: modelId });
        updateRepoEmbeddingMeta(repoId, modelId, dim);
      } else {
        clearRepoEmbeddingMeta(repoId);
      }

      updateRepoChunkCount(repoId, chunks.length);
      updateRepoStatus(repoId, "indexed");
      requestLogger.info({
        event: "index.service.finished",
        repoId,
        fileCount: files.length,
        chunkCount: chunks.length,
        vectorCount: vectors.length,
        durationMs: Date.now() - startedAt,
      });

      return {
        repo_id: repoId,
        chunk_count: chunks.length,
        status: "indexing",
      };
    } catch (error) {
      updateRepoChunkCount(repoId, 0);
      updateRepoStatus(repoId, "failed");
      requestLogger.error({
        event: "index.service.failed",
        repoId,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  }
}
