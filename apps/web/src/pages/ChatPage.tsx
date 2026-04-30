import { Link } from "react-router-dom";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { ApiError, askApi, chatApi, repoApi } from "@repo/api-client";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { messagesByRepoAtom } from "@/state/atoms";
import type { Message, RepoListItemData } from "@repo/types";
import { getFriendlyErrorMessage } from "@/lib/error-messages";

const LAST_OPENED_REPO_ID_KEY = "lastOpenedRepoId";

export function ChatPage() {
  const [repos, setRepos] = useState<RepoListItemData[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messagesByRepo, setMessagesByRepo] = useAtom(messagesByRepoAtom);

  const selectedRepo = useMemo(() => repos.find((repo) => repo.repo_id === selectedRepoId) ?? null, [repos, selectedRepoId]);
  const canAsk = selectedRepo?.status === "indexed";
  const currentMessages = messagesByRepo[selectedRepoId] ?? [];

  useEffect(() => {
    repoApi
      .list()
      .then((list) => {
        setRepos(list);
        const availableRepos = list.filter((repo) => repo.status !== "indexing" && repo.status !== "failed");
        const savedRepoId = window.localStorage.getItem(LAST_OPENED_REPO_ID_KEY) ?? "";
        const savedRepo = availableRepos.find((repo) => repo.repo_id === savedRepoId);
        const fallbackRepo = availableRepos[0] ?? list[0];
        const nextRepoId = savedRepo?.repo_id ?? fallbackRepo?.repo_id ?? "";
        setSelectedRepoId(nextRepoId);
      })
      .catch((error) => {
        if (error instanceof ApiError) {
          setErrorMessage(getFriendlyErrorMessage(error.code, error.message));
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "加载仓库列表失败");
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
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "问答失败");
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
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "清空历史失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main style={{ fontFamily: "Inter, sans-serif", margin: "2rem auto", maxWidth: 960, padding: "0 1rem" }}>
      <h1>聊天页</h1>
      <nav aria-label="primary-navigation" style={{ marginBottom: 16 }}>
        <Link to="/repos">仓库管理页</Link>
      </nav>

      <label>
        选择仓库
        <select
          aria-label="选择仓库"
          value={selectedRepoId}
          onChange={(event) => setSelectedRepoId(event.target.value)}
          style={{ display: "block", margin: "8px 0 12px", minWidth: 420 }}
        >
          {repos.map((repo) => (
            <option
              key={repo.repo_id}
              value={repo.repo_id}
              disabled={repo.status === "indexing" || repo.status === "failed"}
            >
              {repo.repo_id} ({repo.source_value}) [{repo.status}]
            </option>
          ))}
        </select>
      </label>

      {errorMessage ? <p>{errorMessage}</p> : null}

      <ChatInput
        question={question}
        canAsk={Boolean(canAsk)}
        isLoading={isSubmitting}
        onQuestionChange={setQuestion}
        onSubmit={handleAsk}
      />
      <button onClick={handleClearHistory} disabled={isSubmitting || !selectedRepoId} style={{ marginBottom: 12 }}>
        清空当前仓库聊天历史
      </button>
      <ChatPanel messages={currentMessages} fallbackText={canAsk ? "请输入问题并提交。" : "请选择已完成索引的仓库。"} />
    </main>
  );
}
