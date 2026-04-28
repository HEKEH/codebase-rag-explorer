import type { Message } from "@repo/types";

type ChatMessageProps = {
  message: Message;
};

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <article
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 10,
        background: message.role === "assistant" ? "#f9fafb" : "#ffffff"
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{message.role === "assistant" ? "助手" : "用户"}</div>
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{message.content}</p>
    </article>
  );
}
