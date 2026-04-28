import { CSSProperties, FormEvent, useMemo, useState } from "react";
import { askApi, indexApi, repoApi } from "@repo/api-client";
import type { AskData } from "@repo/types";
import { AppLayout } from "@/components/layout/AppLayout";
import { RepoInput } from "@/components/repo/RepoInput";
import { RepoStatus } from "@/components/repo/RepoStatus";

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

export function App() {
  const [repoPath, setRepoPath] = useState("");
  const [repo, setRepo] = useState<RepoState>({
    repoId: null,
    status: "idle",
    fileCount: 0,
    chunkCount: 0
  });
  const [question, setQuestion] = useState("");
  const [askResult, setAskResult] = useState<AskData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const canAsk = repo.status === "indexed" && Boolean(repo.repoId);
  const repoType = useMemo(() => (repoPath.startsWith("https://") || repoPath.startsWith("git@") ? "git" : "local"), [repoPath]);

  async function handleImportRepo(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setAskResult(null);
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
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await askApi.ask({
        repo_id: repo.repoId,
        question: question.trim()
      });
      setAskResult(data);
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
            <form onSubmit={handleAsk} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="请输入你的问题"
                style={{ flex: 1, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}
              />
              <button type="submit" disabled={loading || !canAsk || !question.trim()}>
                提交问题
              </button>
            </form>
            {askResult ? (
              <div>
                <h3 style={{ marginBottom: 8 }}>回答</h3>
                <p style={{ whiteSpace: "pre-wrap", marginTop: 0 }}>{askResult.answer}</p>
                <h3 style={{ marginBottom: 8 }}>代码引用</h3>
                {askResult.references.length === 0 ? (
                  <p style={{ color: "#6b7280" }}>暂无引用片段。</p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {askResult.references.map((ref) => (
                      <article key={ref.chunk_id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                          {ref.file_path} | score={ref.score.toFixed(4)}
                        </div>
                        <pre style={{ margin: 0, overflowX: "auto", whiteSpace: "pre-wrap" }}>{ref.snippet}</pre>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: "#6b7280" }}>
                {canAsk ? "请输入问题并提交。" : "请先导入仓库并构建索引。"}
              </p>
            )}
          </section>
        }
      />
    </div>
  );
}
