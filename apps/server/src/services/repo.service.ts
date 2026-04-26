import { randomUUID } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { IGNORED_DIRECTORIES, IGNORED_FILE_PATTERNS, SUPPORTED_EXTENSIONS } from "@repo/constants";
import { ErrorCode, type ImportRepoData, type ImportRepoRequest } from "@repo/types";
import { AppError } from "../lib/errors";
import { getRepoByPath, saveRepo } from "../store/repo.store";

export interface SourceFile {
  path: string;
  content: string;
}

async function collectSourceFiles(rootPath: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const ignoredDirs = new Set<string>(IGNORED_DIRECTORIES);

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          await walk(path.join(currentDir, entry.name));
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      const ext = path.extname(entry.name).toLowerCase();

      if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
        continue;
      }

      if (IGNORED_FILE_PATTERNS.some((pattern: string) => entry.name.includes(pattern))) {
        continue;
      }

      const content = await readFile(absolutePath, "utf8");
      files.push({
        path: path.relative(rootPath, absolutePath),
        content
      });
    }
  }

  await walk(rootPath);
  return files;
}

export class RepoService {
  async importRepo(input: ImportRepoRequest): Promise<ImportRepoData> {
    if (input.type !== "local") {
      throw new AppError(ErrorCode.REPO_LOAD_FAILED, "M1-1 仅支持本地路径导入");
    }

    const normalizedPath = path.resolve(input.path);
    await access(normalizedPath).catch(() => {
      throw new AppError(ErrorCode.REPO_LOAD_FAILED, "目录不存在或无法读取");
    });

    const existing = getRepoByPath(normalizedPath);
    if (existing) {
      throw new AppError(ErrorCode.REPO_ALREADY_EXISTS, "仓库已存在");
    }

    const files = await collectSourceFiles(normalizedPath);

    const repo = {
      id: randomUUID(),
      path: normalizedPath,
      type: input.type,
      status: "loaded" as const,
      fileCount: files.length,
      chunkCount: 0
    };
    saveRepo(repo);

    return {
      repo_id: repo.id,
      file_count: repo.fileCount,
      status: "loaded"
    };
  }
}
