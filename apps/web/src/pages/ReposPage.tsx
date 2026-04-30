import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { ApiError, repoApi } from "@repo/api-client";
import { normalizeRepoSourceValue } from "@repo/shared";
import type { RepoListItemData } from "@repo/types";

function getIndexActionLabel(status: RepoListItemData["status"]) {
  if (status === "loaded") return "构建索引";
  if (status === "indexed") return "重建索引";
  return null;
}

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
      const sourceValue = normalizeRepoSourceValue(inputRepoType, repoPath);
      if (error instanceof ApiError && error.code === 1002) {
        try {
          const latestRepos = await repoApi.list();
          setRepos(latestRepos);
          const existingRepo = latestRepos.find((repo) => normalizeRepoSourceValue(repo.source_type, repo.source_value) === sourceValue);
          if (existingRepo) {
            const shouldReload = window.confirm("仓库已存在，是否立即触发重载？");
            if (shouldReload) {
              await handleReloadRepo(existingRepo.repo_id);
              return;
            }
            setStatusMessage("已取消重载");
            return;
          }
        } catch {
          setStatusMessage("仓库已存在，但刷新仓库列表失败，请稍后重试。");
          return;
        }
      }
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
            {getIndexActionLabel(repo.status) ? (
              <button onClick={() => handleReloadRepo(repo.repo_id)} disabled={isLoading}>
                {getIndexActionLabel(repo.status)} {repo.repo_id}
              </button>
            ) : repo.status === "indexing" ? (
              <button disabled style={{ opacity: 0.7 }}>
                索引中... {repo.repo_id}
              </button>
            ) : null}
            <button onClick={() => handleRemoveRepo(repo.repo_id)} disabled={isLoading} style={{ marginLeft: 8 }}>
              删除 {repo.repo_id}
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
