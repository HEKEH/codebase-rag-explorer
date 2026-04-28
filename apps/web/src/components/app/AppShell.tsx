import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { AppLayout } from "@/components/layout/AppLayout";
import { RepoInput } from "@/components/repo/RepoInput";
import { RepoStatus } from "@/components/repo/RepoStatus";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { currentQuestionAtom, isAskingAtom, isIndexedAtom, messagesAtom, repoAtom } from "@/state/atoms";
import { useAskQuestion, useBuildIndex, useImportRepo, useIndexStatus } from "@/hooks/use-rag-hooks";
import type { Message } from "@repo/types";

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  background: "#fff"
};

export function AppShell() {
  const [repoPath, setRepoPath] = useState("");
  const [repo, setRepo] = useAtom(repoAtom);
  const [question, setQuestion] = useAtom(currentQuestionAtom);
  const [messages, setMessages] = useAtom(messagesAtom);
  const [isAsking, setIsAsking] = useAtom(isAskingAtom);
  const isIndexed = useAtomValue(isIndexedAtom);
  const [errorMessage, setErrorMessage] = useState("");
  const importRepo = useImportRepo();
  const buildIndex = useBuildIndex();
  const askQuestion = useAskQuestion();
  const indexStatus = useIndexStatus(repo.repoId);

  const loading = importRepo.isPending || buildIndex.isPending || askQuestion.isPending || indexStatus.isFetching || isAsking;
  const canAsk = isIndexed && Boolean(repo.repoId);
  const repoType = useMemo(() => (repoPath.startsWith("https://") || repoPath.startsWith("git@") ? "git" : "local"), [repoPath]);

  useEffect(() => {
    if (!indexStatus.data) return;
    setRepo((prev) => ({
      ...prev,
      status: indexStatus.data?.status ?? prev.status,
      fileCount: indexStatus.data?.file_count ?? prev.fileCount,
      chunkCount: indexStatus.data?.chunk_count ?? prev.chunkCount
    }));
  }, [indexStatus.data, setRepo]);

  async function handleImportRepo(event: FormEvent) {
    event.preventDefault();
    setErrorMessage("");
    setMessages([]);
    setRepo({
      repoId: null,
      status: "idle",
      fileCount: 0,
      chunkCount: 0
    });
    try {
      const data = await importRepo.mutateAsync({ path: repoPath.trim(), type: repoType });
      setRepo({
        repoId: data.repo_id,
        status: "loaded",
        fileCount: data.file_count,
        chunkCount: 0
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "导入失败");
    }
  }

  async function handleBuildIndex() {
    if (!repo.repoId) return;
    setErrorMessage("");
    try {
      setRepo((prev) => ({ ...prev, status: "indexing" }));
      const buildData = await buildIndex.mutateAsync({ repo_id: repo.repoId });
      setRepo((prev) => ({
        ...prev,
        repoId: buildData.repo_id,
        status: buildData.status
      }));
      await indexStatus.refetch();
    } catch (error) {
      setRepo((prev) => ({ ...prev, status: "failed" }));
      setErrorMessage(error instanceof Error ? error.message : "索引构建失败");
    }
  }

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    if (!repo.repoId) return;
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      role: "user",
      content: trimmedQuestion
    };
    setMessages((prev) => [...prev, userMessage]);

    setIsAsking(true);
    setErrorMessage("");
    try {
      const data = await askQuestion.mutateAsync({
        repo_id: repo.repoId,
        question: trimmedQuestion
      });
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        role: "assistant",
        content: data.answer,
        references: data.references
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setQuestion("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "问答失败");
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif", margin: "1rem 0" }}>
      <h1 style={{ margin: "0 auto 16px", maxWidth: 1280, padding: "0 1rem" }}>Codebase RAG Explorer</h1>
      {errorMessage && (
        <p style={{ ...cardStyle, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", marginBottom: 16 }}>
          {errorMessage}
        </p>
      )}
      <AppLayout
        leftPanel={
          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>仓库管理</h2>
            <RepoInput repoPath={repoPath} isLoading={loading} onRepoPathChange={setRepoPath} onSubmit={handleImportRepo} />
            <RepoStatus
              status={repo.status}
              fileCount={repo.fileCount}
              chunkCount={repo.chunkCount}
              canBuildIndex={!loading && repo.status === "loaded"}
              onBuildIndex={handleBuildIndex}
            />
          </section>
        }
        rightPanel={
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>问答</h2>
            <ChatInput
              question={question}
              canAsk={canAsk}
              isLoading={loading}
              onQuestionChange={setQuestion}
              onSubmit={handleAsk}
            />
            <ChatPanel messages={messages} fallbackText={canAsk ? "请输入问题并提交。" : "请先导入仓库并构建索引。"} />
          </section>
        }
      />
    </div>
  );
}
