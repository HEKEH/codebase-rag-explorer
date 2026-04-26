import { randomUUID } from "node:crypto";
import { access, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { join } from "node:path";
import {
  GIT_CLONE_TIMEOUT_MS,
  IGNORED_DIRECTORIES,
  IGNORED_FILE_PATTERNS,
  REPO_MAX_SIZE_MB,
  SUPPORTED_EXTENSIONS
} from "@repo/constants";
import { ErrorCode, type ImportRepoData, type ImportRepoRequest } from "@repo/types";
import { AppError } from "../lib/errors";
import { getRepoByPath, saveRepo } from "../store/repo.store";

export interface SourceFile {
  path: string;
  content: string;
}

function isSupportedGitUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("git@");
}

async function getDirectorySizeBytes(rootPath: string): Promise<number> {
  let total = 0;
  const entries = await readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    const target = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySizeBytes(target);
      continue;
    }
    if (entry.isFile()) {
      const fileStat = await stat(target);
      total += fileStat.size;
    }
  }

  return total;
}

async function cloneGitRepo(url: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "repo-import-"));

  const clonePromise = new Promise<number>((resolve) => {
    const child = spawn("git", ["clone", "--depth", "1", url, target], {
      stdio: "ignore"
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });

  const timeoutPromise = new Promise<number>((resolve) => {
    setTimeout(() => resolve(124), GIT_CLONE_TIMEOUT_MS);
  });

  const exitCode = await Promise.race([clonePromise, timeoutPromise]);
  if (exitCode !== 0) {
    await rm(target, { recursive: true, force: true });
    throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库拉取失败或超时");
  }

  const sizeBytes = await getDirectorySizeBytes(target);
  if (sizeBytes > REPO_MAX_SIZE_MB * 1024 * 1024) {
    await rm(target, { recursive: true, force: true });
    throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仓库体积超过限制");
  }

  return target;
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
    let normalizedPath = path.resolve(input.path);
    let shouldCleanup = false;

    if (input.type === "git") {
      if (!isSupportedGitUrl(input.path)) {
        throw new AppError(ErrorCode.REPO_LOAD_FAILED, "仅支持 https:// 或 git@ 协议");
      }
      normalizedPath = await cloneGitRepo(input.path);
      shouldCleanup = true;
    } else {
      await access(normalizedPath).catch(() => {
        throw new AppError(ErrorCode.REPO_LOAD_FAILED, "目录不存在或无法读取");
      });
    }

    const existing = getRepoByPath(normalizedPath);
    if (existing) {
      throw new AppError(ErrorCode.REPO_ALREADY_EXISTS, "仓库已存在");
    }

    try {
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
    } finally {
      if (shouldCleanup) {
        await rm(normalizedPath, { recursive: true, force: true });
      }
    }
  }
}
