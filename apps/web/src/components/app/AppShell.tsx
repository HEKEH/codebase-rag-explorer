import { CSSProperties, FormEvent, useMemo, useState } from "react";
import { askApi, indexApi, repoApi } from "@repo/api-client";
import type { Message } from "@repo/types";
import { AppLayout } from "@/components/layout/AppLayout";
import { RepoInput } from "@/components/repo/RepoInput";
import { RepoStatus } from "@/components/repo/RepoStatus";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatPanel } from "@/components/chat/ChatPanel";

type RepoState = {
  repoId: string | null;
  status: "idle" | "loaded" | "indexing" | "indexed" | "failed";
  fileCount: number;
  chunkCount: number;
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  background: "#fff"
};

export function AppShell() {
  const [repoPath, setRepoPath] = useState("");
  const [repo, setRepo] = useState<RepoState>({
    repoId: null,
    status: "idle",
    fileCount: 0,
    chunkCount: 0
  });
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const canAsk = repo.status === "indexed" && Boolean(repo.repoId);
  const repoType = useMemo(() => (repoPath.startsWith("https://") || repoPath.startsWith("git@") ? "git" : "local"), [repoPath]);

  async function handleImportRepo(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setMessages([]);
    try {
      const data = await repoApi.import({ path: repoPath.trim(), type: repoType });
      setRepo({
        repoId: data.repo_id,
        status: "loaded",
        fileCount: data.file_count,
        chunkCount: 0
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleBuildIndex() {
    if (!repo.repoId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      setRepo((prev) => ({ ...prev, status: "indexing" }));
      const buildData = await indexApi.build({ repo_id: repo.repoId });
      const statusData = await repoApi.status(repo.repoId);
      setRepo({
        repoId: buildData.repo_id,
        status: statusData.status,
        fileCount: statusData.file_count,
        chunkCount: statusData.chunk_count
      });
    } catch (error) {
      setRepo((prev) => ({ ...prev, status: "failed" }));
      setErrorMessage(error instanceof Error ? error.message : "索引构建失败");
    } finally {
      setLoading(false);
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

    setLoading(true);
    setErrorMessage("");
    try {
      const data = await askApi.ask({
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
      setLoading(false);
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
