import type { Message } from "@repo/types";
import { ChatMessage } from "./ChatMessage";

type ChatPanelProps = {
  messages: Message[];
  fallbackText: string;
};

export function ChatPanel({ messages, fallbackText }: ChatPanelProps) {
  if (messages.length === 0) {
    return <p style={{ color: "#6b7280" }}>{fallbackText}</p>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {messages.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ))}
    </div>
  );
}
