import { ErrorCode, type BuildIndexData } from "@repo/types";
import { Document } from "@langchain/core/documents";
import { saveChunks } from "../db/chunk.repository";
import {
  getRepoById,
  updateRepoChunkCount,
  updateRepoStatus
} from "../db/repo.repository";
import { AppError } from "../lib/errors";
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

  async buildIndex(repoId: string): Promise<BuildIndexData> {
    const repo = getRepoById(repoId);
    if (!repo) {
      throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库不存在");
    }

    const files = getSourceFiles(repoId);
    if (!files) {
      throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库源文件未加载");
    }

    updateRepoStatus(repoId, "indexing");

    const chunks: ChunkData[] = [];
    for (const file of files) {
      chunks.push(...(await this.splitter.splitFile(repoId, file)));
    }

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

    return {
      repo_id: repoId,
      chunk_count: chunks.length,
      status: "indexed"
    };
  }
}
