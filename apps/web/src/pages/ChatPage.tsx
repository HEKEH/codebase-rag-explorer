import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  FolderGit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { ApiError, repoApi } from "@repo/api-client";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatPanel } from "@/components/chat/ChatPanel";
import {
  useAskQuestion,
  useChatHistory,
  useClearRepoChatHistory,
  useSaveChatMessage,
} from "@/hooks/use-rag-hooks";
import type { Message, RepoListItemData } from "@repo/types";
import { cn } from "@/lib/utils";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { AppPageShell } from "@/components/layout/AppPageShell";
import { getRepoStatusLabelZh } from "@/lib/repo-status-ui";
import { useAlertConfirm } from "@/hooks/use-alert-confirm";

const LAST_OPENED_REPO_ID_KEY = "lastOpenedRepoId";

/** Flat string for typeahead; matches DOM order (path → status → id). */
function repoSelectItemTextValue(repo: RepoListItemData): string {
  return `${repo.source_value} ${getRepoStatusLabelZh(repo.status)} ${repo.repo_id}`;
}

/** Shared layout for select trigger value and dropdown options (identical styles). */
function RepoSelectRowBody({
  repo,
  disabled,
}: {
  repo: RepoListItemData;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="inline-flex min-w-0 max-w-full items-center gap-2">
        <p
          className="min-w-0 truncate text-left text-sm font-medium leading-snug text-neutral-900 dark:text-neutral-50"
          title={repo.source_value}
        >
          {repo.source_value}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
            disabled
              ? "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
              : "border-primary/20 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/15",
          )}
        >
          {getRepoStatusLabelZh(repo.status)}
        </span>
      </div>
      <p
        className="truncate text-left font-mono text-[10px] leading-none text-muted-foreground"
        title={repo.repo_id}
      >
        {repo.repo_id}
      </p>
    </div>
  );
}

function RepoSelectOptionRow({
  repo,
  disabled,
}: {
  repo: RepoListItemData;
  disabled?: boolean;
}) {
  return (
    <SelectItem
      value={repo.repo_id}
      disabled={disabled}
      textValue={repoSelectItemTextValue(repo)}
      className={cn(
        "cursor-pointer items-start rounded-md py-2.5 pl-2.5 pr-8 transition-colors focus:bg-neutral-100/80 dark:focus:bg-neutral-800/80",
        disabled && "cursor-not-allowed",
      )}
    >
      <RepoSelectRowBody repo={repo} disabled={disabled} />
    </SelectItem>
  );
}

export function ChatPage() {
  const { ask, confirmDialog } = useAlertConfirm();
  const [repos, setRepos] = useState<RepoListItemData[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusType, setStatusType] = useState<"error" | "info">("info");
  const [isReposLoaded, setIsReposLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: chatHistoryData } = useChatHistory(selectedRepoId);
  const { mutateAsync: saveMessage } = useSaveChatMessage();
  const { mutateAsync: clearHistory } = useClearRepoChatHistory();
  const { mutateAsync: askQuestion } = useAskQuestion();

  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.repo_id === selectedRepoId) ?? null,
    [repos, selectedRepoId],
  );
  const canAsk = selectedRepo?.status === "indexed";
  const currentMessages = useMemo(() => {
    if (!chatHistoryData) return [];
    return chatHistoryData.messages.map(
      (serverMsg): Message => ({
        id: serverMsg.id,
        timestamp: new Date(serverMsg.created_at).getTime(),
        role: serverMsg.role,
        content: serverMsg.content,
        references: serverMsg.references,
      }),
    );
  }, [chatHistoryData]);
  const availableRepos = repos.filter((repo) => repo.status === "indexed");
  const unavailableRepos = repos.filter((repo) => repo.status !== "indexed");

  useEffect(() => {
    if (!isReposLoaded) {
      repoApi
        .list()
        .then((list) => {
          setRepos(list);
          const availableListRepos = list.filter(
            (repo) => repo.status === "indexed",
          );
          const savedRepoId =
            window.localStorage.getItem(LAST_OPENED_REPO_ID_KEY) ?? "";
          const savedRepo = availableListRepos.find(
            (repo) => repo.repo_id === savedRepoId,
          );
          const fallbackRepo = availableListRepos[0] ?? list[0];
          const nextRepoId = savedRepo?.repo_id ?? fallbackRepo?.repo_id ?? "";
          setSelectedRepoId(nextRepoId);
          setIsReposLoaded(true);
        })
        .catch((error) => {
          if (error instanceof ApiError) {
            setErrorMessage(getFriendlyErrorMessage(error.code, error.message));
            setStatusType("error");
            return;
          }
          setErrorMessage(
            error instanceof Error ? error.message : "加载仓库列表失败",
          );
          setStatusType("error");
        });
    }
  }, [isReposLoaded]);

  useEffect(() => {
    if (!selectedRepoId) return;
    window.localStorage.setItem(LAST_OPENED_REPO_ID_KEY, selectedRepoId);
  }, [selectedRepoId]);

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    if (!canAsk || !selectedRepoId) return;
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;

    setErrorMessage("");
    setIsSubmitting(true);
    try {
      await saveMessage({
        repoId: selectedRepoId,
        role: "user",
        content: trimmedQuestion,
      });

      const data = await askQuestion({
        repo_id: selectedRepoId,
        question: trimmedQuestion,
      });

      await saveMessage({
        repoId: selectedRepoId,
        role: "assistant",
        content: data.answer,
        references: data.references,
      });

      setQuestion("");
    } catch (error) {
      const friendly =
        error instanceof ApiError
          ? getFriendlyErrorMessage(error.code, error.message)
          : error instanceof Error
            ? error.message
            : "问答失败";
      try {
        await saveMessage({
          repoId: selectedRepoId,
          role: "error",
          content: friendly,
        });
      } catch {
        setErrorMessage(friendly);
        setStatusType("error");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClearHistory() {
    if (!selectedRepoId) return;
    const shouldClear = await ask({
      title: "清空聊天历史",
      description:
        "确认清空当前仓库的全部聊天消息？该操作不可恢复。",
      confirmText: "清空",
      cancelText: "取消",
      variant: "destructive",
    });
    if (!shouldClear) return;
    setErrorMessage("");
    try {
      await clearHistory(selectedRepoId);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(getFriendlyErrorMessage(error.code, error.message));
        setStatusType("error");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "清空历史失败");
      setStatusType("error");
    }
  }

  return (
    <>
      <AppPageShell
        pageSubtitle="聊天页"
        maxWidth="6xl"
        navLink={{
          to: "/repos",
          label: "仓库管理页",
          icon: <FolderGit2 className="h-4 w-4" />,
        }}
      >
        <Card className="mb-6 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-5 w-5 text-primary" />
              选择仓库
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedRepoId}
              onValueChange={setSelectedRepoId}
              disabled={repos.length === 0}
            >
                  <SelectTrigger className="h-auto min-h-10 w-full rounded-lg border-neutral-200 bg-white py-2.5 text-left shadow-sm hover:bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900/80 [&>span]:flex [&>span]:w-full [&>span]:min-w-0 [&>span]:flex-col [&>span]:items-stretch [&>span]:gap-1 [&>span]:line-clamp-none">
                    <SelectValue placeholder="请选择一个已索引的仓库">
                      {selectedRepo ? (
                        <RepoSelectRowBody
                          repo={selectedRepo}
                          disabled={selectedRepo.status !== "indexed"}
                        />
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border-neutral-200 shadow-lg dark:border-neutral-800">
                    {availableRepos.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">
                          <CheckCircle2
                            className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500"
                            aria-hidden
                          />
                          可使用（已索引）
                        </SelectLabel>
                        {availableRepos.map((repo) => (
                          <RepoSelectOptionRow key={repo.repo_id} repo={repo} />
                        ))}
                      </SelectGroup>
                    )}
                    {availableRepos.length > 0 &&
                      unavailableRepos.length > 0 && (
                        <SelectSeparator className="my-1 bg-neutral-200 dark:bg-neutral-800" />
                      )}
                    {unavailableRepos.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">
                          <AlertCircle
                            className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500"
                            aria-hidden
                          />
                          不可使用（未完成索引）
                        </SelectLabel>
                        {unavailableRepos.map((repo) => (
                          <RepoSelectOptionRow
                            key={repo.repo_id}
                            repo={repo}
                            disabled
                          />
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
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
          <CardFooter className="flex flex-col gap-3 p-4">
            {selectedRepo && currentMessages.length > 0 ? (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearHistory}
                  disabled={!selectedRepoId}
                  className="flex shrink-0 items-center gap-1.5 border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>清空当前仓库聊天历史</span>
                </Button>
              </div>
            ) : null}
            <ChatInput
              question={question}
              canAsk={Boolean(canAsk)}
              isLoading={isSubmitting}
              onQuestionChange={setQuestion}
              onSubmit={handleAsk}
            />
          </CardFooter>
        </Card>
      </AppPageShell>
      {confirmDialog}
    </>
  );
}
