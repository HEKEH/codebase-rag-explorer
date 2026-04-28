import type { FormEvent } from "react";

type ChatInputProps = {
  question: string;
  canAsk: boolean;
  isLoading: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function ChatInput({ question, canAsk, isLoading, onQuestionChange, onSubmit }: ChatInputProps) {
  return (
    <form data-testid="chat-input-form" onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <input
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        placeholder="请输入你的问题"
        style={{ flex: 1, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}
      />
      <button type="submit" disabled={isLoading || !canAsk || !question.trim()}>
        提交问题
      </button>
    </form>
  );
}
