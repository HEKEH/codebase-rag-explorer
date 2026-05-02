import type { ChatHistoryRole } from "@repo/types";
import { getDb } from "./connection";

export interface ChatHistoryRecord {
  id: string;
  repoId: string;
  role: ChatHistoryRole;
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
    role: row.role as ChatHistoryRole,
    content: row.content,
    referencesJson: row.references_json,
    createdAt: row.created_at,
  };
}

export function getChatHistoryByRepoId(repoId: string): ChatHistoryRecord[] {
  const db = getDb();
  const rows = db
    .query<ChatHistoryRow, [string]>(
      `
        SELECT id, repo_id, role, content, references_json, created_at
        FROM chat_history
        WHERE repo_id = ?
        ORDER BY created_at ASC, rowid ASC
      `,
    )
    .all(repoId);
  return rows.map(mapChatHistoryRow);
}

export function saveChatMessage(
  repoId: string,
  role: ChatHistoryRole,
  content: string,
  referencesJson?: string,
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const refs = role === "error" ? null : (referencesJson ?? null);
  db.query<never, [string, string, string, string, string | null]>(
    `
      INSERT INTO chat_history (id, repo_id, role, content, references_json)
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(id, repoId, role, content, refs);
  return id;
}

export function clearChatHistoryByRepoId(repoId: string): number {
  const db = getDb();
  const result = db
    .query("DELETE FROM chat_history WHERE repo_id = ?")
    .run(repoId);
  return result.changes;
}
