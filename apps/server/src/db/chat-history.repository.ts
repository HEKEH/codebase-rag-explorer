import { getDb } from "./connection";

export function clearChatHistoryByRepoId(repoId: string): number {
  const db = getDb();
  const result = db.query("DELETE FROM chat_history WHERE repo_id = ?").run(repoId);
  return result.changes;
}
