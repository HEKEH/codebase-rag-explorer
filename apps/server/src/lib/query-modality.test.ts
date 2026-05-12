import { describe, expect, test } from "bun:test";
import { inferAutoQueryContentModality } from "./query-modality";

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
