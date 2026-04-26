import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";

describe("lib/sqlite-vector-store", () => {
  test("supports addVectors, similaritySearchVectorWithScore and delete", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "server-sqlite-vector-store-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const vectorStoreModulePath = pathToFileURL(
      join(process.cwd(), "apps/server/src/lib/sqlite-vector-store.ts")
    ).href;
    const connectionModulePath = pathToFileURL(
      join(process.cwd(), "apps/server/src/db/connection.ts")
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { SQLiteVectorStore } = await import(${JSON.stringify(vectorStoreModulePath)});
      const { getDb, closeDb } = await import(${JSON.stringify(connectionModulePath)});

      const embeddings = {
        async embedQuery(text) { return [text.length, 0, 0]; },
        async embedDocuments(texts) { return texts.map((text) => [text.length, 0, 0]); }
      };

      const db = getDb();
      db.query("INSERT INTO repos (id, path, type, status) VALUES (?, ?, ?, ?)").run("repo-vs", "/tmp/repo-vs", "local", "loaded");
      db.query("INSERT INTO chunks (id, repo_id, file_path, content, chunk_type) VALUES (?, ?, ?, ?, ?)").run("chunk-1", "repo-vs", "src/a.ts", "function alpha() {}", "function");
      db.query("INSERT INTO chunks (id, repo_id, file_path, content, chunk_type) VALUES (?, ?, ?, ?, ?)").run("chunk-2", "repo-vs", "src/b.ts", "function beta() {}", "function");
      db.query("INSERT INTO chunks (id, repo_id, file_path, content, chunk_type) VALUES (?, ?, ?, ?, ?)").run("chunk-3", "repo-vs", "src/c.ts", "function gamma() {}", "function");

      const store = new SQLiteVectorStore(embeddings);
      await store.addVectors(
        [
          [1, 0, 0],
          [0.8, 0.2, 0],
          [0, 1, 0]
        ],
        [
          { pageContent: "function alpha() {}", metadata: { chunk_id: "chunk-1", repo_id: "repo-vs", file_path: "src/a.ts", chunk_type: "function", chunk_name: "alpha" } },
          { pageContent: "function beta() {}", metadata: { chunk_id: "chunk-2", repo_id: "repo-vs", file_path: "src/b.ts", chunk_type: "function", chunk_name: "beta" } },
          { pageContent: "function gamma() {}", metadata: { chunk_id: "chunk-3", repo_id: "repo-vs", file_path: "src/c.ts", chunk_type: "function", chunk_name: "gamma" } }
        ],
        { model: "test-model" }
      );

      const ranked = await store.similaritySearchVectorWithScore([1, 0, 0], 2, { repo_id: "repo-vs" });
      if (ranked.length !== 2) throw new Error("expected top-k length 2");
      if (ranked[0][0].metadata.chunk_id !== "chunk-1") throw new Error("expected chunk-1 ranked first");
      if (ranked[1][0].metadata.chunk_id !== "chunk-2") throw new Error("expected chunk-2 ranked second");
      if (ranked[0][1] < ranked[1][1]) throw new Error("expected scores sorted desc");

      await store.delete({ repo_id: "repo-vs", chunk_ids: ["chunk-2"] });
      const afterDelete = db.query("SELECT chunk_id FROM embeddings ORDER BY chunk_id ASC").all();
      if (afterDelete.length !== 2) throw new Error("expected one embedding deleted");
      if (afterDelete.some((row) => row.chunk_id === "chunk-2")) throw new Error("chunk-2 embedding should be deleted");

      closeDb();
    `;

    const run = Bun.spawnSync({
      cmd: ["bun", "-e", command],
      cwd: process.cwd(),
      stderr: "pipe",
      stdout: "pipe"
    });

    if (run.exitCode !== 0) {
      throw new Error(Buffer.from(run.stderr).toString("utf8"));
    }

    const db = new Database(dbPath, { readonly: true });
    const rows = db.query<{ chunk_id: string }, []>("SELECT chunk_id FROM embeddings ORDER BY chunk_id ASC").all();
    db.close();

    expect(rows.map((row) => row.chunk_id)).toEqual(["chunk-1", "chunk-3"]);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
