import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { ChunkData } from "../types/chunk";
import { EmbedderService } from "./embedder.service";

describe("EmbedderService", () => {
  test("embeds question via configured model client", async () => {
    const captured: string[] = [];
    const service = new EmbedderService({
      embedQuery: async (text: string) => {
        captured.push(text);
        return [0.1, 0.2, 0.3];
      },
      embedDocuments: async () => [],
    });

    const vector = await service.embedQuestion("what is alpha");
    expect(captured).toEqual(["what is alpha"]);
    expect(vector).toEqual([0.1, 0.2, 0.3]);
  });

  test("embeds chunks in batches and persists records", async () => {
    const repoId = "repo-embedder-test";
    const outDir = path.resolve("data", "embeddings");
    await mkdir(outDir, { recursive: true });

    const chunks: ChunkData[] = [
      {
        id: "c1",
        repo_id: repoId,
        file_path: "src/a.ts",
        content: "function alpha() {}",
        chunk_type: "function",
        chunk_name: "alpha",
        start_line: 1,
        end_line: 1,
      },
      {
        id: "c2",
        repo_id: repoId,
        file_path: "src/b.ts",
        content: "class Beta {}",
        chunk_type: "class",
        chunk_name: "Beta",
        start_line: 1,
        end_line: 1,
      },
    ];

    const batches: string[][] = [];
    const service = new EmbedderService({
      embedQuery: async () => [1, 0, 0],
      embedDocuments: async (inputs: string[]) => {
        batches.push(inputs);
        return inputs.map((_input, idx) => [idx + 1, idx + 2, idx + 3]);
      },
    });

    const count = await service.embedAndPersist(repoId, chunks, {
      batchSize: 1,
    });
    expect(count).toBe(2);
    expect(batches.length).toBe(2);

    const file = path.join(outDir, `${repoId}.json`);
    const persisted = JSON.parse(await readFile(file, "utf8")) as Array<{
      chunk_id: string;
      repo_id: string;
      vector: number[];
      dimension: number;
    }>;

    expect(persisted).toHaveLength(2);
    expect(persisted[0]?.chunk_id).toBe("c1");
    expect(persisted[0]?.repo_id).toBe(repoId);
    expect(persisted[0]?.vector).toEqual([1, 2, 3]);
    expect(persisted[0]?.dimension).toBe(3);
    expect(persisted[1]?.chunk_id).toBe("c2");

    await rm(file, { force: true });
  });
});
