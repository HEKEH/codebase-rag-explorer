import { CSSProperties, FormEvent, useMemo, useState } from "react";
import { indexApi, repoApi } from "@repo/api-client";

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
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const canAsk = repo.status === "indexed" && Boolean(repo.repoId);
  const repoType = useMemo(() => (repoPath.startsWith("https://") || repoPath.startsWith("git@") ? "git" : "local"), [repoPath]);

  async function handleImportRepo(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");
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

  return (
    <main style={{ margin: "2rem auto", maxWidth: 1100, fontFamily: "Inter, sans-serif", padding: "0 1rem" }}>
      <h1 style={{ marginBottom: 16 }}>Codebase RAG Explorer</h1>
      {errorMessage && (
        <p style={{ ...cardStyle, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>{errorMessage}</p>
      )}

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>仓库管理</h2>
        <form onSubmit={handleImportRepo} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={repoPath}
            onChange={(event) => setRepoPath(event.target.value)}
            placeholder="输入本地路径或 Git URL"
            style={{ flex: 1, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}
          />
          <button type="submit" disabled={loading || !repoPath.trim()}>
            导入仓库
          </button>
        </form>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span>状态：{repo.status}</span>
          <span>文件数：{repo.fileCount}</span>
          <span>Chunk 数：{repo.chunkCount}</span>
          <button onClick={handleBuildIndex} disabled={loading || repo.status !== "loaded"}>
            构建索引
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>问答</h2>
        <p style={{ color: "#6b7280" }}>
          {canAsk ? "索引已就绪，下一里程碑将接入问答提交流程。" : "请先导入仓库并构建索引。"}
        </p>
      </section>
    </main>
  );
}
