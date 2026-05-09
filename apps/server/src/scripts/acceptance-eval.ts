import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { closeDb, getDb } from "../db/connection";
import { getRepoById, getRepoByPath } from "../db/repo.repository";
import { getSourceFiles } from "../store/repo.store";
import { AskService } from "../services/ask.service";
import { IndexService } from "../services/index.service";
import { RepoService } from "../services/repo.service";
import { monorepoRootFromCwd } from "../lib/monorepo-root";

type QuestionItem = {
  id: string;
  category: "function" | "module" | "call-chain";
  question: string;
  expectedFiles: string[];
  expectedKeywords: string[];
};

type QuestionSet = {
  questions: QuestionItem[];
};

type AskReference = {
  file_path?: string;
  snippet?: string;
};

export function evaluateSingleQuestion(input: {
  expectedFiles: string[];
  expectedKeywords: string[];
  answer: string;
  references: AskReference[];
}) {
  const answerLower = input.answer.toLowerCase();
  const keywordHit = input.expectedKeywords.some((keyword) =>
    answerLower.includes(keyword.toLowerCase()),
  );
  const fileHit = input.references.some(
    (reference) =>
      typeof reference.file_path === "string" &&
      input.expectedFiles.some((expectedFile) =>
        reference.file_path?.includes(expectedFile),
      ),
  );

  return {
    matched: keywordHit || fileHit,
    keywordHit,
    fileHit,
  };
}

function loadQuestionSet(rootDir: string): QuestionSet {
  const filePath = join(
    rootDir,
    "docs",
    "05-quality",
    "acceptance-question-set.json",
  );
  return JSON.parse(readFileSync(filePath, "utf8")) as QuestionSet;
}

async function ensureRepoIndexed(
  repoPath: string,
): Promise<{ repoId: string; cleanup: () => void }> {
  const repoService = new RepoService();
  const indexService = new IndexService();
  const normalizedPath = resolve(repoPath);
  const createdAliasRoots: string[] = [];
  const importedRepoIds = new Set<string>();

  function createImportAliasPath(): string {
    const tempRoot = mkdtempSync(join(tmpdir(), "acceptance-repo-alias-"));
    createdAliasRoots.push(tempRoot);
    const aliasPath = join(tempRoot, "repo");
    symlinkSync(normalizedPath, aliasPath, "dir");
    return aliasPath;
  }

  let repo = getRepoByPath(normalizedPath);
  if (!repo) {
    const importPath = createImportAliasPath();
    const imported = await repoService.importRepo({
      path: importPath,
      type: "local",
    });
    importedRepoIds.add(imported.repo_id);
    repo = getRepoByPath(importPath);
    if (!repo) {
      throw new Error(
        `repo import succeeded but repo not found: ${imported.repo_id}`,
      );
    }
  }

  if (!getSourceFiles(repo.id)) {
    const importPath = createImportAliasPath();
    const imported = await repoService.importRepo({
      path: importPath,
      type: "local",
    });
    importedRepoIds.add(imported.repo_id);
    repo = getRepoByPath(importPath);
    if (!repo) {
      throw new Error(
        `repo import succeeded but repo not found: ${imported.repo_id}`,
      );
    }
  }

  if (repo.status !== "indexed") {
    await indexService.buildIndex(repo.id);
    repo = getRepoById(repo.id);
    if (!repo || repo.status !== "indexed") {
      throw new Error("repo indexing did not reach indexed status");
    }
  }

  const repoId = repo.id;
  const cleanup = () => {
    const db = getDb();
    for (const importedRepoId of importedRepoIds) {
      db.query("DELETE FROM repos WHERE id = ?").run(importedRepoId);
    }
    for (const tempRoot of createdAliasRoots) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  };

  return { repoId, cleanup };
}

async function run() {
  const rootDir = monorepoRootFromCwd();
  const repoPath = process.env.ACCEPTANCE_REPO_PATH ?? rootDir;
  const outputPath =
    process.env.ACCEPTANCE_REPORT_PATH ??
    join(rootDir, "docs", "acceptance-eval-report.md");
  const existingRepoId = process.env.ACCEPTANCE_REPO_ID;
  const questionSet = loadQuestionSet(rootDir);

  if (questionSet.questions.length < 20) {
    throw new Error("acceptance question set must contain at least 20 items");
  }

  let cleanup = () => {};
  try {
    let repoId = existingRepoId;
    if (!repoId) {
      const ensured = await ensureRepoIndexed(repoPath);
      repoId = ensured.repoId;
      cleanup = ensured.cleanup;
    }
    const askService = new AskService();
    const records: Array<{
      id: string;
      category: string;
      question: string;
      matched: boolean;
      keywordHit: boolean;
      fileHit: boolean;
      answer: string;
      references: AskReference[];
    }> = [];

    for (const item of questionSet.questions) {
      const response = await askService.ask(repoId, item.question, 4);
      const scored = evaluateSingleQuestion({
        expectedFiles: item.expectedFiles,
        expectedKeywords: item.expectedKeywords,
        answer: response.answer,
        references: response.references ?? [],
      });
      records.push({
        id: item.id,
        category: item.category,
        question: item.question,
        matched: scored.matched,
        keywordHit: scored.keywordHit,
        fileHit: scored.fileHit,
        answer: response.answer,
        references: response.references ?? [],
      });
    }

    const matchedCount = records.filter((item) => item.matched).length;
    const ratio = matchedCount / records.length;
    const percentage = Number((ratio * 100).toFixed(2));

    const lines = [
      "# PRD 题集执行报告",
      "",
      `- 执行时间：${new Date().toISOString()}`,
      "- 执行模式：live-rag",
      `- 题目数量：${records.length}`,
      `- 命中数量：${matchedCount}`,
      `- 一致率：${percentage}%`,
      "",
      "| ID | 类别 | 判定 | 命中方式 |",
      "|----|------|------|----------|",
      ...records.map((item) => {
        const hitType =
          item.keywordHit && item.fileHit
            ? "keyword+file"
            : item.keywordHit
              ? "keyword"
              : item.fileHit
                ? "file"
                : "none";
        return `| ${item.id} | ${item.category} | ${item.matched ? "pass" : "fail"} | ${hitType} |`;
      }),
      "",
      "## 逐题证据",
      ...records.flatMap((item) => {
        const referenceFiles = item.references
          .map((reference) => reference.file_path)
          .filter((path): path is string => Boolean(path));
        return [
          `### ${item.id} ${item.question}`,
          `- 判定：${item.matched ? "pass" : "fail"}`,
          `- 回答：${item.answer.replace(/\n/g, " ").slice(0, 500)}`,
          `- 引用文件：${referenceFiles.length > 0 ? referenceFiles.join(", ") : "无"}`,
          "",
        ];
      }),
    ];

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
    // Keep stdout concise so this script can be used in CI logs.
    console.log(
      JSON.stringify({
        total: records.length,
        matched: matchedCount,
        consistencyRate: percentage,
        executionMode: "live-rag",
        outputPath,
      }),
    );
  } finally {
    cleanup();
    closeDb();
  }
}

if (import.meta.main) {
  await run();
}
