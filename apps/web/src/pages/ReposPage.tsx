import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { repoApi } from "@repo/api-client";
import type { RepoListItemData } from "@repo/types";

export function ReposPage() {
  const [repoPath, setRepoPath] = useState("");
  const [repos, setRepos] = useState<RepoListItemData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const inputRepoType = useMemo<"local" | "git">(
    () => (repoPath.startsWith("https://") || repoPath.startsWith("git@") ? "git" : "local"),
    [repoPath]
  );

  async function loadRepos() {
    const list = await repoApi.list();
    setRepos(list);
  }

  useEffect(() => {
    loadRepos().catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "加载仓库列表失败");
    });
  }, []);

  async function handleAddRepo() {
    if (!repoPath.trim()) return;
    setIsLoading(true);
    setStatusMessage("");
    try {
      await repoApi.create({
        source_type: inputRepoType,
        source_value: repoPath.trim()
      });
      await loadRepos();
      setRepoPath("");
      setStatusMessage("仓库添加成功");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "仓库添加失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemoveRepo(repoId: string) {
    setIsLoading(true);
    setStatusMessage("");
    try {
      await repoApi.remove(repoId);
      await loadRepos();
      setStatusMessage("仓库删除成功");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "仓库删除失败");
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
      setStatusMessage("仓库重载已触发");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "仓库重载失败");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "Inter, sans-serif", margin: "2rem auto", maxWidth: 1280, padding: "0 1rem" }}>
      <h1>仓库管理页</h1>
      <nav aria-label="primary-navigation" style={{ marginBottom: 16 }}>
        <Link to="/chat">聊天页</Link>
      </nav>

      <section style={{ marginBottom: 16 }}>
        <input
          value={repoPath}
          onChange={(event) => setRepoPath(event.target.value)}
          placeholder="输入本地路径或 Git URL"
          style={{ minWidth: 420, marginRight: 8 }}
        />
        <button onClick={handleAddRepo} disabled={isLoading || !repoPath.trim()}>
          添加仓库
        </button>
      </section>

      {statusMessage ? <p>{statusMessage}</p> : null}

      <section aria-label="repo-list">
        {repos.map((repo) => (
          <article key={repo.repo_id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <p>{repo.source_value}</p>
            <p>状态：{repo.status}</p>
            <p>
              文件数：{repo.file_count} / Chunk 数：{repo.chunk_count}
            </p>
            <button onClick={() => handleReloadRepo(repo.repo_id)} disabled={isLoading}>
              重载 {repo.repo_id}
            </button>
            <button onClick={() => handleRemoveRepo(repo.repo_id)} disabled={isLoading} style={{ marginLeft: 8 }}>
              删除 {repo.repo_id}
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
