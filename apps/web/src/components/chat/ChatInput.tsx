import type { FormEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ChatInputProps = {
  question: string;
  canAsk: boolean;
  isLoading: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function ChatInput({
  question,
  canAsk,
  isLoading,
  onQuestionChange,
  onSubmit,
}: ChatInputProps) {
  return (
    <form
      data-testid="chat-input-form"
      onSubmit={onSubmit}
      className="flex gap-3 w-full"
    >
      <Input
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        placeholder="请输入你的问题"
        className="flex-1 h-10 text-base border-neutral-200 bg-white hover:bg-neutral-50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900"
      />
      <Button
        type="submit"
        disabled={isLoading || !canAsk || !question.trim()}
        className="h-10 px-5"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        <span className="ml-2">提交问题</span>
      </Button>
    </form>
  );
}
