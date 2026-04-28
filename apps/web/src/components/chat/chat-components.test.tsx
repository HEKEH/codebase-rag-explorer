import { fireEvent, render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Message } from "@repo/types";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { ChatPanel } from "./ChatPanel";

describe("chat components", () => {
  test("ChatInput submits question", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const onQuestionChange = vi.fn();
    const view = render(
      <ChatInput
        question="What is IndexService?"
        canAsk
        isLoading={false}
        onQuestionChange={onQuestionChange}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(view.getByPlaceholderText("请输入你的问题"), { target: { value: "new question" } });
    fireEvent.submit(view.getByTestId("chat-input-form"));

    expect(onQuestionChange).toHaveBeenCalledWith("new question");
    expect(onSubmit).toHaveBeenCalled();
  });

  test("ChatMessage renders content and role", () => {
    const message: Message = {
      id: "m-1",
      timestamp: Date.now(),
      role: "assistant",
      content: "## Summary\n\n- **IndexService** builds chunks.",
      references: []
    };
    const view = render(<ChatMessage message={message} />);
    expect(view.getByText("助手")).toBeTruthy();
    expect(view.getByRole("heading", { level: 2, name: "Summary" })).toBeTruthy();
    expect(view.container.querySelector("strong")?.textContent).toBe("IndexService");
  });

  test("ChatMessage keeps user content as plain text", () => {
    const message: Message = {
      id: "m-user-1",
      timestamp: Date.now(),
      role: "user",
      content: "## user heading"
    };
    const view = render(<ChatMessage message={message} />);
    expect(view.queryByRole("heading", { level: 2, name: "user heading" })).toBeNull();
    expect(view.getByText("## user heading")).toBeTruthy();
  });

  test("ChatPanel renders empty state and message list", () => {
    const view = render(<ChatPanel messages={[]} fallbackText="请先导入仓库并构建索引。" />);
    expect(view.getByText("请先导入仓库并构建索引。")).toBeTruthy();

    const messages: Message[] = [
      { id: "u1", timestamp: 1, role: "user", content: "hello" },
      { id: "a1", timestamp: 2, role: "assistant", content: "hi", references: [] }
    ];
    view.rerender(<ChatPanel messages={messages} fallbackText="请先导入仓库并构建索引。" />);
    expect(view.getByText("hello")).toBeTruthy();
    expect(view.getByText("hi")).toBeTruthy();
  });
});
