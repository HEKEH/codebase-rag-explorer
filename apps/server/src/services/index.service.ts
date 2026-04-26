import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ErrorCode, type BuildIndexData } from "@repo/types";
import {
  getRepoById,
  updateRepoChunkCount,
  updateRepoStatus
} from "../db/repo.repository";
import { AppError } from "../lib/errors";
import { getSourceFiles } from "../store/repo.store";
import type { ChunkData } from "../types/chunk";
import { EmbedderService } from "./embedder.service";
import { SplitterService } from "./splitter.service";

const splitterService = new SplitterService();
const embedderService = new EmbedderService();

export class IndexService {
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
      chunks.push(...splitterService.splitFile(repoId, file));
    }

    const outDir = path.resolve("data", "chunks");
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, `${repoId}.json`), JSON.stringify(chunks, null, 2), "utf8");
    await embedderService.embedAndPersist(repoId, chunks);

    updateRepoChunkCount(repoId, chunks.length);
    updateRepoStatus(repoId, "indexed");

    return {
      repo_id: repoId,
      chunk_count: chunks.length,
      status: "indexed"
    };
  }
}
