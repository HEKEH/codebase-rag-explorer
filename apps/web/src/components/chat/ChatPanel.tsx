import { MessageSquare } from "lucide-react";
import type { Message } from "@repo/types";
import { ChatMessage } from "./ChatMessage";
import { ScrollArea } from "@/components/ui/scroll-area";

type ChatPanelProps = {
  messages: Message[];
  fallbackText: string;
};

export function ChatPanel({ messages, fallbackText }: ChatPanelProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <MessageSquare className="mb-3 h-12 w-12 opacity-50" />
        <p className="text-sm">{fallbackText}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 px-1">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </div>
    </ScrollArea>
  );
}
