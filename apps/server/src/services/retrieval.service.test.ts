import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { RetrievalService } from "./retrieval.service";

describe("RetrievalService", () => {
  test("returns ranked top-k results from persisted chunks and embeddings", async () => {
    const repoId = "repo-test-retrieval";
    const chunksDir = path.resolve("data", "chunks");
    const embeddingsDir = path.resolve("data", "embeddings");
    await mkdir(chunksDir, { recursive: true });
    await mkdir(embeddingsDir, { recursive: true });

    const chunks = [
      {
        id: "chunk-1",
        repo_id: repoId,
        file_path: "src/a.ts",
        content: "function alpha() {}",
        chunk_type: "function",
        chunk_name: "alpha",
        start_line: 1,
        end_line: 1
      },
      {
        id: "chunk-2",
        repo_id: repoId,
        file_path: "src/b.ts",
        content: "function beta() {}",
        chunk_type: "function",
        chunk_name: "beta",
        start_line: 1,
        end_line: 1
      }
    ];

    const embeddings = [
      { chunk_id: "chunk-1", repo_id: repoId, vector: [1, 0, 0], dimension: 3 },
      { chunk_id: "chunk-2", repo_id: repoId, vector: [0, 1, 0], dimension: 3 }
    ];

    await writeFile(path.join(chunksDir, `${repoId}.json`), JSON.stringify(chunks), "utf8");
    await writeFile(path.join(embeddingsDir, `${repoId}.json`), JSON.stringify(embeddings), "utf8");

    const service = new RetrievalService();
    const results = await service.retrieve("alpha function", repoId, 1);
    expect(results.length).toBe(1);
    expect(results[0].chunk_id).toBeDefined();

    await rm(path.join(chunksDir, `${repoId}.json`), { force: true });
    await rm(path.join(embeddingsDir, `${repoId}.json`), { force: true });
  });
});
