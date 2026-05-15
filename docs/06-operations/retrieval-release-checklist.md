# 检索管线发布前检查（Retrieval pre-release checklist）

路线图：[Phase 7 · P7-1](../../03-planning/retrieval-enhancement-roadmap.md#phase-7发布与运维)。

本清单需在**索引/检索相关代码或迁移变更**的版本发布窗口内逐项勾选（可在 PR description 粘贴副本）。

## 迁移与 SQLite 结构

- [ ] **`001`–`004` 迁移**已在目标环境与 CI 跑一次应用流程（或使用 `migrate`/`connection` 侧等价路径）；无重复执行 DDL 报错。
- [ ] **`chunk_fts`**：由 **`003_chunk_fts.sql`** 创建；确认为 `fts5` 虚拟表，与 `chunks` 以 `chunk_id` / `repo_id` 关联（细节见迁移文件注释）。

## 稀疏索引填满与「旧库升级」风险（必读）

| 情形 | `chunks` | `chunk_fts` |
|------|----------|-------------|
| 新装入库（首次索引成功） | 有数据 | **写入路径**在 `saveChunk` / `saveChunks` 中同步补齐 |
| **仅套用迁移**：已有历史 `chunks`，尚未重载索引 | 有数据 | 表为空 — **稀疏路 BM25（`RETRIEVAL_SPARSE_MODE=fts`）几乎无召回**，直至 **重建索引 / 仓库重载** |
| **仅配置改 `EMBEDDING_*` / `INDEX_IMPORT_SUMMARY`** | 可能与向量不一致 | 需与向量 / 正文策略一致时 **同上** |

- [ ] 发布说明中已包含上述「空 FTS 直至重载」说明（若本次发布含 `003` 或首次启用 FTS）。
- [ ] `RETRIEVAL_SPARSE_MODE` 若为 **`fts`**（默认），已对生产库确认 **或对关键仓库安排了重载/重建**。
- [ ] （可选兜底）若在紧急窗口无法立即重载，已知晓可临时设为 **`full_table`** 启用旧式全库词法扫描（性能差，运维见 [`retrieval-rollback-runbook.md`](./retrieval-rollback-runbook.md)）。

## `RETRIEVAL_*` 与相关默认值（与代码一致）

以下与 `apps/server/src/config/runtime.ts`、`@repo/constants`、根目录 [`.env.example`](../../../.env.example) 对齐；若生产未设环境变量，行为以 **运行时解析结果**为准。

| 变量 / 概念 | 未设置或未覆盖时的默认 | 备注 |
|-------------|-------------------------|------|
| `DEFAULT_TOP_K`（`packages/constants`） | `5` | 与用户请求 `top_k` 默认值相关 |
| `RETRIEVAL_BM25_TOP_N` | `max(DEFAULT_TOP_K×4, DEFAULT_TOP_K)` → **20** | `runtime.retrievalBm25TopN` |
| `RETRIEVAL_SPARSE_MODE` | **`fts`** | `full_table` 走 legacy 扫描 |
| `RETRIEVAL_FUSION` | **`weighted`**（min-max 线性融合） | `rrf` 为倒数排名融合 |
| `RETRIEVAL_DENSE_TOP_N` | **空 → `null`** → 服务内用 `max(top_k×3, top_k)` | 仍为 Phase 2 前兼容语义 |
| `RETRIEVAL_RRF_K` | **`60`**（`DEFAULT_RETRIEVAL_RRF_K`） | 仅 fusion=`rrf` 时 |
| `RETRIEVAL_RRF_EXPLAIN_BM25_WEIGHT` | **`0.35`**，夹紧到 `[0, RETRIEVAL_RRF_WEIGHT_ABS_MAX]`，`RETRIEVAL_RRF_WEIGHT_ABS_MAX`**= 2** | explain intent 稀疏秩权重基线 |
| `RETRIEVAL_QUERY_MODALITY` | **`auto`** | `force_nl` / `force_pl` 运维纠偏 |
| Phase 3 模态缩放 | 见 `@repo/constants` `RETRIEVAL_*_MODAL*`、`RETRIEVAL_WEIGHTED_*` 等 | 代码常量层，不靠 env |

重建索引触发项（节选，与 [`TRD` §3 · 附录](../../02-technical/TRD.md) 一致）：

- [ ] **`EMBEDDING_MODEL` / `EMBEDDING_DIMENSION` 变更** → 对已索引仓库 **重建索引**（或删除后重导）；并核对 `repos.embedding_model_id`、`repos.embedding_dimension`（`004_repo_embedding_meta.sql`）。
- [ ] **`INDEX_IMPORT_SUMMARY`** 开关变更 → **重建**，否则仅新写入 chunk 对齐。
- [ ] FTS 分词策略 / `chunk_fts` 写入格式变更 → **重建**。

## 文档与实现对齐

- [ ] [`TRD` §3.3.4 RetrievalService](../../02-technical/TRD.md)（流程、环境与注意段）与本发布行为一致。
- [ ] [`logging-events.md`](./logging-events.md) 中 **`retrieval.*`** 字段仍为权威说明（camelCase）。
- [ ] （若对外 Runbook）[`retrieval-release-post-verify.md`](./retrieval-release-post-verify.md)、[`retrieval-rollback-runbook.md`](./retrieval-rollback-runbook.md) 已随本发布更新。
