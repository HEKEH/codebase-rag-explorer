import { getDb } from "./connection";

export function deleteEmbeddingsByRepoId(repoId: string): number {
  const db = getDb();
  const result = db
    .query("DELETE FROM embeddings WHERE repo_id = ?")
    .run(repoId);
  return result.changes;
}
