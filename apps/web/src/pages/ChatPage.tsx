import { Link } from "react-router-dom";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import {
  MessageSquare,
  FolderGit2,
  Trash2,
  Code2,
  AlertCircle
} from "lucide-react";
import { ApiError, askApi, chatApi, repoApi } from "@repo/api-client";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { messagesByRepoAtom } from "@/state/atoms";
import type { Message, RepoListItemData } from "@repo/types";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

const LAST_OPENED_REPO_ID_KEY = "lastOpenedRepoId";

export function ChatPage() {
  const [repos, setRepos] = useState<RepoListItemData[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusType, setStatusType] = useState<"error" | "info">("info");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messagesByRepo, setMessagesByRepo] = useAtom(messagesByRepoAtom);

  const selectedRepo = useMemo(() => repos.find((repo) => repo.repo_id === selectedRepoId) ?? null, [repos, selectedRepoId]);
  const canAsk = selectedRepo?.status === "indexed";
  const currentMessages = messagesByRepo[selectedRepoId] ?? [];
  const availableRepos = repos.filter((repo) => repo.status === "indexed");
  const unavailableRepos = repos.filter((repo) => repo.status !== "indexed");

  useEffect(() => {
    repoApi
      .list()
      .then((list) => {
        setRepos(list);
        const availableListRepos = list.filter((repo) => repo.status === "indexed");
        const savedRepoId = window.localStorage.getItem(LAST_OPENED_REPO_ID_KEY) ?? "";
        const savedRepo = availableListRepos.find((repo) => repo.repo_id === savedRepoId);
        const fallbackRepo = availableListRepos[0] ?? list[0];
        const nextRepoId = savedRepo?.repo_id ?? fallbackRepo?.repo_id ?? "";
        setSelectedRepoId(nextRepoId);
      })
      .catch((error) => {
        if (error instanceof ApiError) {
          setErrorMessage(getFriendlyErrorMessage(error.code, error.message));
          setStatusType("error");
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "加载仓库列表失败");
        setStatusType("error");
      });
  }, []);

  useEffect(() => {
    if (!selectedRepoId) return;
    window.localStorage.setItem(LAST_OPENED_REPO_ID_KEY, selectedRepoId);
  }, [selectedRepoId]);

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    if (!canAsk || !selectedRepoId) return;
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      role: "user",
      content: trimmedQuestion
    };
    setMessagesByRepo((prev) => ({
      ...prev,
      [selectedRepoId]: [...(prev[selectedRepoId] ?? []), userMessage]
    }));

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const data = await askApi.ask({
        repo_id: selectedRepoId,
        question: trimmedQuestion
      });
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        role: "assistant",
        content: data.answer,
        references: data.references
      };
      setMessagesByRepo((prev) => ({
        ...prev,
        [selectedRepoId]: [...(prev[selectedRepoId] ?? []), assistantMessage]
      }));
      setQuestion("");
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(getFriendlyErrorMessage(error.code, error.message));
        setStatusType("error");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "问答失败");
      setStatusType("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClearHistory() {
    if (!selectedRepoId) return;
    const shouldClear = window.confirm("确认清空当前仓库聊天历史？");
    if (!shouldClear) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await chatApi.clearHistory(selectedRepoId);
      setMessagesByRepo((prev) => ({
        ...prev,
        [selectedRepoId]: []
      }));
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(getFriendlyErrorMessage(error.code, error.message));
        setStatusType("error");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "清空历史失败");
      setStatusType("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Code2 className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Codebase RAG Explorer</h1>
            <span className="text-sm text-muted-foreground">聊天页</span>
          </div>
          <nav aria-label="primary-navigation">
            <Button variant="secondary" asChild>
              <Link to="/repos" className="flex items-center gap-2">
                <FolderGit2 className="h-4 w-4" />
                仓库管理页
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <label>
          选择仓库
          <select
            aria-label="选择仓库"
            value={selectedRepoId}
            onChange={(event) => setSelectedRepoId(event.target.value)}
            className="block mt-2 mb-3 px-3 py-2 border border-neutral-200 rounded-md w-full max-w-lg"
          >
            {repos.map((repo) => (
              <option
                key={repo.repo_id}
                value={repo.repo_id}
                disabled={repo.status !== "indexed"}
              >
                {repo.repo_id} ({repo.source_value}) [{repo.status}]
              </option>
            ))}
          </select>
        </label>

        <Button
          onClick={handleClearHistory}
          disabled={isSubmitting || !selectedRepoId}
          className="mb-6"
        >
          <Trash2 className="h-4 w-4" />
          <span className="ml-2">清空当前仓库聊天历史</span>
        </Button>

        {errorMessage && (
          <Alert
            variant="destructive"
            className="mb-6"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <Card className="h-[calc(100vh-22rem)] min-h-[400px] flex flex-col">
          <CardContent className="flex-1 overflow-hidden p-0">
            <ChatPanel
              messages={currentMessages}
              fallbackText={
                canAsk
                  ? "请输入问题并提交，开始与代码库对话。"
                  : repos.length === 0
                  ? "暂无仓库，请先在仓库管理页添加一个仓库并构建索引。"
                  : "请选择一个已完成索引的仓库。"
              }
            />
          </CardContent>
          <Separator />
          <CardFooter className="p-4">
            <ChatInput
              question={question}
              canAsk={Boolean(canAsk)}
              isLoading={isSubmitting}
              onQuestionChange={setQuestion}
              onSubmit={handleAsk}
            />
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
