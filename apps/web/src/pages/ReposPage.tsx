import { useEffect, useMemo, useState } from "react";
import {
  FolderGit2,
  RefreshCw,
  Trash2,
  MessageSquare,
  Database,
  FileCode,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { ApiError, repoApi } from "@repo/api-client";
import { normalizeRepoSourceValue } from "@repo/shared";
import type { RepoListItemData, RepoStatus } from "@repo/types";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { AppPageShell } from "@/components/layout/AppPageShell";
import {
  getRepoStatusBadgeVariant,
  getRepoStatusLabelZh,
} from "@/lib/repo-status-ui";
import { cn } from "@/lib/utils";
import { useAlertConfirm } from "@/hooks/use-alert-confirm";

function getIndexActionLabel(status: RepoListItemData["status"]) {
  if (status === "loaded") return "构建索引";
  if (status === "indexed") return "重建索引";
  return null;
}

function getStatusIcon(status: RepoStatus) {
  switch (status) {
    case "indexing":
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    case "indexed":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "failed":
      return <AlertCircle className="h-3.5 w-3.5" />;
    default:
      return <Clock className="h-3.5 w-3.5" />;
  }
}

export function ReposPage() {
  const { ask, confirmDialog } = useAlertConfirm();
  const [repoPath, setRepoPath] = useState("");
  const [repos, setRepos] = useState<RepoListItemData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error" | "info">(
    "info",
  );

  const inputRepoType = useMemo<"local" | "git">(
    () =>
      repoPath.startsWith("https://") || repoPath.startsWith("git@")
        ? "git"
        : "local",
    [repoPath],
  );
  const indexingRepoIds = useMemo(
    () =>
      repos
        .filter((repo) => repo.status === "indexing")
        .map((repo) => repo.repo_id),
    [repos],
  );
  const indexingRepoIdsKey = useMemo(
    () => indexingRepoIds.join(","),
    [indexingRepoIds],
  );

  async function loadRepos() {
    const list = await repoApi.list();
    setRepos(list);
  }

  useEffect(() => {
    loadRepos().catch((error) => {
      if (error instanceof ApiError) {
        setStatusMessage(getFriendlyErrorMessage(error.code, error.message));
        setStatusType("error");
        return;
      }
      setStatusMessage(
        error instanceof Error ? error.message : "加载仓库列表失败",
      );
      setStatusType("error");
    });
  }, []);

  useEffect(() => {
    if (indexingRepoIds.length === 0) return;

    const pollIndexingStatuses = () => {
      void Promise.all(indexingRepoIds.map((repoId) => repoApi.status(repoId)))
        .then((statuses) => {
          const validStatuses = statuses.filter(
            (status): status is NonNullable<typeof status> => Boolean(status),
          );
          setRepos((prevRepos) => {
            let hasChanged = false;
            const nextRepos = prevRepos.map((repo) => {
              const latestStatus = validStatuses.find(
                (item) => item.repo_id === repo.repo_id,
              );
              if (!latestStatus) return repo;
              const isSame =
                repo.status === latestStatus.status &&
                repo.file_count === latestStatus.file_count &&
                repo.chunk_count === latestStatus.chunk_count;
              if (isSame) {
                return repo;
              }
              hasChanged = true;
              return {
                ...repo,
                status: latestStatus.status,
                file_count: latestStatus.file_count,
                chunk_count: latestStatus.chunk_count,
              };
            });
            return hasChanged ? nextRepos : prevRepos;
          });
        })
        .catch(() => {
          // keep existing list state; next poll will retry automatically
        });
    };
    pollIndexingStatuses();
    const timer = window.setInterval(pollIndexingStatuses, 3000);

    return () => window.clearInterval(timer);
  }, [indexingRepoIdsKey]);

  async function handleAddRepo() {
    if (!repoPath.trim()) return;
    setIsLoading(true);
    setStatusMessage("");
    try {
      await repoApi.create({
        source_type: inputRepoType,
        source_value: repoPath.trim(),
      });
      await loadRepos();
      setRepoPath("");
      setStatusMessage("仓库添加成功");
      setStatusType("success");
    } catch (error) {
      const sourceValue = normalizeRepoSourceValue(inputRepoType, repoPath);
      if (error instanceof ApiError && error.code === 1002) {
        try {
          const latestRepos = await repoApi.list();
          setRepos(latestRepos);
          const existingRepo = latestRepos.find(
            (repo) =>
              normalizeRepoSourceValue(repo.source_type, repo.source_value) ===
              sourceValue,
          );
          if (existingRepo) {
            const shouldReload = await ask({
              title: "仓库已存在",
              description: "该仓库已在列表中，是否立即触发重载？",
              confirmText: "立即重载",
              cancelText: "暂不重载",
            });
            if (shouldReload) {
              await handleReloadRepo(existingRepo.repo_id);
              return;
            }
            setStatusMessage("已取消重载");
            setStatusType("info");
            return;
          }
        } catch {
          setStatusMessage("仓库已存在，但刷新仓库列表失败，请稍后重试。");
          setStatusType("error");
          return;
        }
      }
      if (error instanceof ApiError) {
        setStatusMessage(getFriendlyErrorMessage(error.code, error.message));
        setStatusType("error");
        return;
      }
      setStatusMessage(error instanceof Error ? error.message : "仓库添加失败");
      setStatusType("error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemoveRepo(repoId: string) {
    const shouldDelete = await ask({
      title: "确认删除仓库",
      description: "该操作会同时删除该仓库及其聊天历史，且不可恢复。",
      confirmText: "删除",
      cancelText: "取消",
      variant: "destructive",
    });
    if (!shouldDelete) {
      setStatusMessage("已取消删除");
      setStatusType("info");
      return;
    }
    setIsLoading(true);
    setStatusMessage("");
    try {
      await repoApi.remove(repoId);
      await loadRepos();
      setStatusMessage("仓库删除成功");
      setStatusType("success");
    } catch (error) {
      if (error instanceof ApiError) {
        setStatusMessage(getFriendlyErrorMessage(error.code, error.message));
        setStatusType("error");
        return;
      }
      setStatusMessage(error instanceof Error ? error.message : "仓库删除失败");
      setStatusType("error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReloadRepo(repoId: string) {
    setIsLoading(true);
    setStatusMessage("");
    try {
      await repoApi.reload(repoId);
      await loadRepos();
      setStatusMessage("已在后台开始构建索引");
      setStatusType("success");
    } catch (error) {
      if (error instanceof ApiError) {
        setStatusMessage(getFriendlyErrorMessage(error.code, error.message));
        setStatusType("error");
        return;
      }
      setStatusMessage(
        error instanceof Error ? error.message : "索引构建触发失败",
      );
      setStatusType("error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <AppPageShell
        pageSubtitle="仓库管理页"
        maxWidth="6xl"
        navLink={{
          to: "/chat",
          label: "聊天页",
          icon: <MessageSquare className="h-4 w-4" />,
        }}
      >
        <Card className="mb-6 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderGit2 className="h-5 w-5 text-primary" />
              添加新仓库
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="repo-path">仓库路径或 Git URL</Label>
                <div className="relative">
                  <Input
                    id="repo-path"
                    value={repoPath}
                    onChange={(event) => setRepoPath(event.target.value)}
                    placeholder="输入本地路径或 Git URL"
                    className={cn(
                      "border-neutral-200 bg-white hover:bg-neutral-50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900",
                      repoPath.trim() && "pr-28",
                    )}
                  />
                  {repoPath.trim() ? (
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                      <Badge
                        variant={
                          inputRepoType === "git" ? "default" : "outline"
                        }
                        className="shrink-0 px-2 py-0 text-[11px] leading-tight"
                      >
                        {inputRepoType === "git" ? "Git 仓库" : "本地路径"}
                      </Badge>
                    </div>
                  ) : null}
                </div>
              </div>
              <Button
                onClick={handleAddRepo}
                disabled={isLoading || !repoPath.trim()}
                className="shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderGit2 className="h-4 w-4" />
                )}
                <span className="ml-2">添加仓库</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {statusMessage && (
          <Alert
            variant={statusType === "error" ? "destructive" : "default"}
            className={cn(
              "mb-6",
              statusType === "success" &&
                "border-green-200 bg-green-50 text-green-800 [&>svg]:text-green-600 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200 dark:[&>svg]:text-green-400",
            )}
          >
            {statusType === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : statusType === "error" ? (
              <AlertCircle className="h-4 w-4" />
            ) : null}
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">已添加的仓库</h2>
            <Badge variant="outline" className="font-medium">
              共 {repos.length} 个
            </Badge>
          </div>

          {repos.length === 0 ? (
            <Card className="border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FolderGit2 className="mb-3 h-12 w-12 opacity-50" />
                <p>暂无仓库，请添加一个本地路径或 Git 仓库。</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {repos.map((repo) => (
                <Card
                  key={repo.repo_id}
                  className="overflow-hidden border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {repo.source_value}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {repo.source_type === "git" ? "Git 仓库" : "本地路径"}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          仓库 ID：{repo.repo_id}
                        </p>
                      </div>
                      <Badge
                        variant={getRepoStatusBadgeVariant(repo.status)}
                        className="flex items-center gap-1 shrink-0"
                      >
                        {getStatusIcon(repo.status)}
                        {getRepoStatusLabelZh(repo.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <FileCode className="h-4 w-4" />
                        <span>{repo.file_count} 个文件</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Database className="h-4 w-4" />
                        <span>{repo.chunk_count} 个 Chunk</span>
                      </div>
                    </div>
                  </CardContent>
                  <Separator className="bg-neutral-200 dark:bg-neutral-800" />
                  <CardFooter className="flex justify-between gap-2 pt-3">
                    <div className="flex gap-2">
                      {getIndexActionLabel(repo.status) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleReloadRepo(repo.repo_id)}
                          disabled={isLoading}
                          className="flex items-center gap-1.5"
                          aria-label={`${getIndexActionLabel(repo.status)}，仓库 ${repo.repo_id}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          {getIndexActionLabel(repo.status)}
                        </Button>
                      ) : repo.status === "indexing" ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled
                          className="flex items-center gap-1.5"
                          aria-label={`索引进行中，仓库 ${repo.repo_id}`}
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          索引中...
                        </Button>
                      ) : null}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveRepo(repo.repo_id)}
                      disabled={isLoading || repo.status === "indexing"}
                      className="flex items-center gap-1.5"
                      aria-label={`删除仓库 ${repo.repo_id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </AppPageShell>
      {confirmDialog}
    </>
  );
}
