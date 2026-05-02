import { Link } from "react-router-dom";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import {
  MessageSquare,
  FolderGit2,
  Trash2,
  Code2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { ApiError, askApi, chatApi, repoApi } from "@repo/api-client";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { messagesByRepoAtom } from "@/state/atoms";
import type { GetRepoChatHistoryData, Message, Reference, RepoListItemData, RepoStatus } from "@repo/types";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

const LAST_OPENED_REPO_ID_KEY = "lastOpenedRepoId";

function convertServerMessageToClientMessage(
  serverMessage: GetRepoChatHistoryData["messages"][number]
): Message {
  return {
    id: serverMessage.id,
    timestamp: new Date(serverMessage.created_at).getTime(),
    role: serverMessage.role,
    content: serverMessage.content,
    references: serverMessage.references
  };
}

function getStatusBadgeVariant(status: RepoStatus) {
  switch (status) {
    case "indexed":
      return "default";
    case "indexing":
      return "secondary";
    case "loaded":
      return "outline";
    case "failed":
      return "destructive";
    default:
      return "secondary";
  }
}

function getStatusLabel(status: RepoStatus) {
  switch (status) {
    case "idle":
      return "空闲";
    case "loaded":
      return "已加载";
    case "indexing":
      return "索引中";
    case "indexed":
      return "已索引";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

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

    if (messagesByRepo[selectedRepoId]) {
      return;
    }

    chatApi
      .getHistory(selectedRepoId)
      .then((data) => {
        const messages = data.messages.map(convertServerMessageToClientMessage);
        setMessagesByRepo((prev) => ({
          ...prev,
          [selectedRepoId]: messages
        }));
      })
      .catch((error) => {
        if (error instanceof ApiError) {
          setErrorMessage(getFriendlyErrorMessage(error.code, error.message));
          setStatusType("error");
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "加载聊天历史失败");
        setStatusType("error");
      });
  }, [selectedRepoId, messagesByRepo, setMessagesByRepo]);

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
      await chatApi.saveMessage(selectedRepoId, "user", trimmedQuestion);

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

      await chatApi.saveMessage(selectedRepoId, "assistant", data.answer, data.references);

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
        <Card className="mb-6 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-5 w-5 text-primary" />
              选择仓库
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1 space-y-2">
                <Select
                  value={selectedRepoId}
                  onValueChange={setSelectedRepoId}
                  disabled={repos.length === 0}
                >
                  <SelectTrigger className="w-full border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900">
                    <SelectValue placeholder="请选择一个已索引的仓库" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRepos.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          可使用（已索引）
                        </SelectLabel>
                        {availableRepos.map((repo) => (
                          <SelectItem key={repo.repo_id} value={repo.repo_id} className="flex items-center justify-between">
                            <span className="font-medium">{repo.repo_id} ({repo.source_value}) [{repo.status}]</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {unavailableRepos.length > 0 && (
                      <>
                        <SelectGroup>
                          <SelectLabel className="flex items-center gap-2">
                            <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
                            不可使用
                          </SelectLabel>
                          {unavailableRepos.map((repo) => (
                            <SelectItem
                              key={repo.repo_id}
                              value={repo.repo_id}
                              disabled
                              className="flex items-center justify-between opacity-60"
                            >
                              <span className="font-medium">{repo.repo_id} ({repo.source_value}) [{repo.status}]</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {selectedRepo && (
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusBadgeVariant(selectedRepo.status)}>
                    {getStatusLabel(selectedRepo.status)}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearHistory}
                    disabled={isSubmitting || !selectedRepoId}
                    className="flex items-center gap-1.5 border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>清空当前仓库聊天历史</span>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {errorMessage && (
          <Alert
            variant="destructive"
            className="mb-6 border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <Card className="h-[calc(100vh-22rem)] min-h-[400px] flex flex-col border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
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
          <Separator className="bg-neutral-200 dark:bg-neutral-800" />
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
