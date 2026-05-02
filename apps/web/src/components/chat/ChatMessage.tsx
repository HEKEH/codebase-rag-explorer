import { User, Bot } from "lucide-react";
import type { Message } from "@repo/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeReference } from "./CodeReference";
import { cn } from "@/lib/utils";

type ChatMessageProps = {
  message: Message;
};

export function ChatMessage({ message }: ChatMessageProps) {
  const references = message.references ?? [];
  const isAssistant = message.role === "assistant";

  return (
    <article
      className={cn(
        "flex gap-3 py-4",
        isAssistant ? "flex-row" : "flex-row-reverse"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isAssistant
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground"
        )}
      >
        {isAssistant ? (
          <Bot className="h-4 w-4" />
        ) : (
          <User className="h-4 w-4" />
        )}
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2",
          isAssistant ? "items-start" : "items-end"
        )}
      >
        <div
          className={cn(
            "inline-flex items-center gap-2 text-sm font-medium",
            isAssistant ? "text-primary" : "text-secondary-foreground"
          )}
        >
          <span>{isAssistant ? "助手" : "用户"}</span>
        </div>

        <div
          className={cn(
            "rounded-2xl px-4 py-3 max-w-[85%]",
            isAssistant
              ? "rounded-tl-none bg-card text-card-foreground shadow-sm border"
              : "rounded-tr-none bg-primary text-primary-foreground"
          )}
        >
          {isAssistant ? (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          )}
        </div>

        {references.length > 0 && (
          <div className="mt-2 w-full space-y-2">
            <p className="text-xs text-muted-foreground">相关代码引用：</p>
            {references.map((reference) => (
              <CodeReference
                key={reference.chunk_id}
                reference={reference}
                language="ts"
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
