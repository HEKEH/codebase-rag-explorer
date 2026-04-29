import { ErrorCode, type BuildIndexData } from "@repo/types";
import { Document } from "@langchain/core/documents";
import { saveChunks } from "../db/chunk.repository";
import {
  getRepoById,
  updateRepoChunkCount,
  updateRepoStatus
} from "../db/repo.repository";
import { AppError } from "../lib/errors";
import { type RequestLogContext, withRequestLogger } from "../lib/logger";
import { SQLiteVectorStore } from "../lib/sqlite-vector-store";
import { getSourceFiles } from "../store/repo.store";
import type { ChunkData } from "../types/chunk";
import { EmbedderService } from "./embedder.service";
import { SplitterService } from "./splitter.service";

const splitterService = new SplitterService();
const embedderService = new EmbedderService();

interface IndexSplitter {
  splitFile(repoId: string, file: { path: string; content: string }): Promise<ChunkData[]>;
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
    this.embedder = deps.embedder ?? embedderService;
    this.vectorStore = deps.vectorStore ?? new SQLiteVectorStore(this.embedder.getEmbeddingsClient());
  }

  async buildIndex(repoId: string, context?: RequestLogContext): Promise<BuildIndexData> {
    const startedAt = Date.now();
    const requestLogger = withRequestLogger(context);
    requestLogger.info({
      event: "index.service.started",
      repoId
    });
    const repo = getRepoById(repoId);
    if (!repo) {
      throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库不存在");
    }
    if (repo.status === "indexing" || repo.status === "indexed") {
      throw new AppError(ErrorCode.INDEX_ALREADY_EXISTS, "索引已存在或正在构建");
    }

    const files = getSourceFiles(repoId);
    if (!files) {
      throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库源文件未加载");
    }

    updateRepoStatus(repoId, "indexing");

    try {
      const chunks: ChunkData[] = [];
      for (const file of files) {
        chunks.push(...(await this.splitter.splitFile(repoId, file)));
      }
      requestLogger.info({
        event: "index.service.split.finished",
        repoId,
        fileCount: files.length,
        chunkCount: chunks.length
      });

      saveChunks(chunks);

      const vectors = await this.embedder.embedChunks(chunks);
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
              end_line: chunk.end_line
            }
          })
      );
      await this.vectorStore.addVectors(vectors, documents);

      updateRepoChunkCount(repoId, chunks.length);
      updateRepoStatus(repoId, "indexed");
      requestLogger.info({
        event: "index.service.finished",
        repoId,
        fileCount: files.length,
        chunkCount: chunks.length,
        vectorCount: vectors.length,
        durationMs: Date.now() - startedAt
      });

      return {
        repo_id: repoId,
        chunk_count: chunks.length,
        status: "indexing"
      };
    } catch (error) {
      updateRepoStatus(repoId, "failed");
      requestLogger.error({
        event: "index.service.failed",
        repoId,
        durationMs: Date.now() - startedAt,
        error
      });
      throw error;
    }
  }
}
