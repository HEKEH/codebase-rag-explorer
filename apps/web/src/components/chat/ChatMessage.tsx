import type { Message } from "@repo/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeReference } from "./CodeReference";

type ChatMessageProps = {
  message: Message;
};

export function ChatMessage({ message }: ChatMessageProps) {
  const references = message.references ?? [];
  const isAssistant = message.role === "assistant";

  return (
    <article
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 10,
        background: isAssistant ? "#f9fafb" : "#ffffff"
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{isAssistant ? "助手" : "用户"}</div>
      {isAssistant ? (
        <div style={{ margin: 0 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      ) : (
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{message.content}</p>
      )}
      {references.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {references.map((reference) => (
            <CodeReference key={reference.chunk_id} reference={reference} language="ts" />
          ))}
        </div>
      )}
    </article>
  );
}
