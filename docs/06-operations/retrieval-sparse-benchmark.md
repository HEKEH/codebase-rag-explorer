# 稀疏检索（FTS / BM25）性能基线

对应路线图 **P1-7** 与设计稿 **§8 Q5**：在 **1e4+** `chunk_fts` 行上记录一次可复现的查询耗时，便于回归对比与瓶颈记录。

**范围**：仅测量 **`searchChunkIdsByFtsBm25` 单次 SQL**（含 `MATCH` + `bm25`），**不包含** `RetrievalService.retrieve` 端到端（embed、向量路、融合、加载 `chunks` 正文等）。勿将本数字直接当作问答或完整检索 SLA。

## 如何运行

在仓库根目录：

```bash
bun run --cwd apps/server benchmark:retrieval-sparse
```

脚本会：

1. 在系统临时目录下创建 **空库** 并跑迁移；
2. 插入 **12 000** 条 `chunk_fts`（单 repo，合成 `body`）；
3. 对固定词 **`token_7`** 做 `normalizeUserQueryForFts5Match` + `searchChunkIdsByFtsBm25`（`LIMIT=20`），重复 **5** 次取平均；
4. 删除临时目录，向 **stdout** 打印 JSON。

## 输出字段说明

| 字段 | 含义 |
|------|------|
| `chunkFtsRows` | 插入的 FTS 行数（当前为 12000） |
| `insertMs` | 批量插入耗时（ms，粗略） |
| `bm25Limit` | BM25 `LIMIT` |
| `queryTrials` | 查询重复次数 |
| `avgQueryMs` | 多次查询平均耗时（ms） |
| `firstTrialHitCount` | 第一次查询返回行数 |
| `matchQuery` | 实际 `MATCH` 字符串 |

## 示例输出（示意）

以下为 **示意结构**；本机绝对数值随 CPU、磁盘、Bun/SQLite 版本变化，**以你本地运行打印为准**。

```json
{
  "chunkFtsRows": 12000,
  "insertMs": 28,
  "bm25Limit": 20,
  "queryTrials": 5,
  "avgQueryMs": 0.778,
  "firstTrialHitCount": 20,
  "matchQuery": "\"token_7\"",
  "note": "Cold single-process SQLite; numbers vary by machine. Use for before/after or regression triage (design §8 Q5)."
}
```

（以上为一次 CI/本机跑出的样例；**请以你当前环境脚本输出为准**。）

## 未达标时

若 `avgQueryMs` 或业务侧端到端延迟明显上升：

- 记录本 JSON + 环境（OS、Bun 版本、`DB_PATH` 是否 SSD）；
- 检查是否缺 **WAL/索引**、是否与大事务争用；
- 将结论记入路线图 / ADR 或设计稿 **§8 Q5** 跟进项。

## 相关配置

- `RETRIEVAL_BM25_TOP_N`：生产检索候选深度（脚本内对基线使用固定 `20` 以便对比）。
- `RETRIEVAL_SPARSE_MODE`：见 `.env.example`（`fts` / `full_table`）。
