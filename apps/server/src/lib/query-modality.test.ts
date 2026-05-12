import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { monorepoRootFromCwd } from "./monorepo-root";
import {
  inferAutoQueryContentModality,
  resolveQueryContentModality,
} from "./query-modality";

/** P3-1: PL 片段 vs NL 问句，期望 `inferAutoQueryContentModality` 标签正确 */
describe("lib/query-modality (P3-1)", () => {
  const plSamples = [
    "async function retrieve(question: string, repoId: string): Promise<RetrievalResult[]>",
    "export class RetrievalService { async retrieve() { return []; } }",
    "const [x, setX] = useState<string | null>(null);",
    "apps/server/src/services/retrieval.service.ts",
    "getChunksByIds(chunk_ids: string[])",
    "fn merge_dense_sparse<T>(a: Vec<T>, b: Vec<T>) -> Vec<T>",
    "interface ChunkRepository { saveChunk(chunk: Chunk): void }",
    "import { runtimeConfig } from \"./runtime\";",
  ];

  const nlSamples = [
    "How does retrieval fuse BM25 and dense vectors?",
    "这个项目里检索是怎么做的？",
    "Where is the embedding dimension configured?",
    "解释一下 RRF 融合公式",
    "What is the difference between weighted and RRF fusion?",
    "Is the retrieve path using SQLite FTS5 by default?",
    "`validateToken` 是在哪里被调用的？",
    "please walk me through the indexing pipeline step by step",
  ];

  for (const q of plSamples) {
    test(`classifies as pl: ${q.slice(0, 72)}${q.length > 72 ? "…" : ""}`, () => {
      expect(inferAutoQueryContentModality(q)).toBe("pl");
    });
  }

  for (const q of nlSamples) {
    test(`classifies as nl: ${q.slice(0, 72)}${q.length > 72 ? "…" : ""}`, () => {
      expect(inferAutoQueryContentModality(q)).toBe("nl");
    });
  }

  test("empty or whitespace defaults to nl", () => {
    expect(inferAutoQueryContentModality("")).toBe("nl");
    expect(inferAutoQueryContentModality("   \n\t  ")).toBe("nl");
  });
});

/** P3-2：`force_nl` / `force_pl` 覆盖 `auto` 推断 */
describe("lib/query-modality (P3-2)", () => {
  const plSnippet =
    "async function retrieve(question: string, repoId: string): Promise<void> {}";

  test("force_nl returns nl even when heuristic would choose pl", () => {
    expect(resolveQueryContentModality("force_nl", plSnippet)).toBe("nl");
  });

  test("force_pl returns pl even when heuristic would choose nl", () => {
    const nlQuestion = "How does retrieval fuse BM25 and dense vectors?";
    expect(inferAutoQueryContentModality(nlQuestion)).toBe("nl");
    expect(resolveQueryContentModality("force_pl", nlQuestion)).toBe("pl");
  });

  test("auto matches inferAutoQueryContentModality", () => {
    expect(resolveQueryContentModality("auto", plSnippet)).toBe("pl");
    expect(
      resolveQueryContentModality(
        "auto",
        "Where is the embedding dimension configured?",
      ),
    ).toBe("nl");
  });

  test("RETRIEVAL_QUERY_MODALITY env is applied when runtime loads after env is set", () => {
    const testCwd = monorepoRootFromCwd();
    const runtimePath = pathToFileURL(
      join(testCwd, "apps/server/src/config/runtime.ts"),
    ).href;
    const qmPath = pathToFileURL(
      join(testCwd, "apps/server/src/lib/query-modality.ts"),
    ).href;

    const command = `
      process.env.RETRIEVAL_QUERY_MODALITY = "  FORCE_NL  ";
      const { runtimeConfig } = await import(${JSON.stringify(runtimePath)});
      const { resolveQueryContentModality } = await import(${JSON.stringify(qmPath)});
      const pl = "export class Foo { bar(): number { return 1; } }";
      const r = resolveQueryContentModality(runtimeConfig.retrievalQueryModality, pl);
      if (r !== "nl") throw new Error("expected nl from env force, got " + r);
    `;

    const run = Bun.spawnSync({
      cmd: ["bun", "-e", command],
      cwd: testCwd,
      stderr: "pipe",
      stdout: "pipe",
    });
    if (run.exitCode !== 0) {
      throw new Error(Buffer.from(run.stderr).toString("utf8"));
    }
  });
});
