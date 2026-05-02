import { getDb } from "./connection";

export interface ChatHistoryRecord {
  id: string;
  repoId: string;
  role: "user" | "assistant";
  content: string;
  referencesJson: string | null;
  createdAt: string;
}

type ChatHistoryRow = {
  id: string;
  repo_id: string;
  role: string;
  content: string;
  references_json: string | null;
  created_at: string;
};

function mapChatHistoryRow(row: ChatHistoryRow): ChatHistoryRecord {
  return {
    id: row.id,
    repoId: row.repo_id,
    role: row.role as "user" | "assistant",
    content: row.content,
    referencesJson: row.references_json,
    createdAt: row.created_at
  };
}

function ensureReferencesColumn(): void {
  const db = getDb();
  const pragmaResult = db.query("PRAGMA table_info(chat_history)").all() as { name: string }[];
  const hasReferencesColumn = pragmaResult.some((col) => col.name === "references_json");
  if (!hasReferencesColumn) {
    db.query("ALTER TABLE chat_history ADD COLUMN references_json TEXT").run();
  }
}

export function getChatHistoryByRepoId(repoId: string): ChatHistoryRecord[] {
  ensureReferencesColumn();
  const db = getDb();
  const rows = db
    .query<ChatHistoryRow, [string]>(
      `
        SELECT id, repo_id, role, content, references_json, created_at
        FROM chat_history
        WHERE repo_id = ?
        ORDER BY created_at ASC, rowid ASC
      `
    )
    .all(repoId);
  return rows.map(mapChatHistoryRow);
}

export function saveChatMessage(
  repoId: string,
  role: "user" | "assistant",
  content: string,
  referencesJson?: string
): string {
  ensureReferencesColumn();
  const db = getDb();
  const id = crypto.randomUUID();
  db.query<
    never,
    [string, string, "user" | "assistant", string, string | null]
  >(
    `
      INSERT INTO chat_history (id, repo_id, role, content, references_json)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(id, repoId, role, content, referencesJson ?? null);
  return id;
}

export function clearChatHistoryByRepoId(repoId: string): number {
  const db = getDb();
  const result = db.query("DELETE FROM chat_history WHERE repo_id = ?").run(repoId);
  return result.changes;
}
