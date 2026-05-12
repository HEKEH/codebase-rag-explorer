# 检索管线增强设计（Retrieval Pipeline Enhancement）

**状态**：设计稿（实现前评审）  
**日期**：2026-05-08  
**范围**：`apps/server` 索引与检索链路；主要涉及 `RetrievalService`、`IndexService` / 分块、`AskService` 上下文组装  
**背景知识**：与内部 wiki「代码 RAG」笔记一致，核心结论来自 Long Code Arena 类工作对 **稀疏 vs 密集检索**、**BM25**、**分块与上下文窗口对齐**、**NL→PL vs PL→PL** 的归纳（见本地 `wiki/code-rag` 仓库：`retrieval-quality`、`bm25-retrieval`、`sparse-vs-dense-retrieval`、`pl-pl-vs-nl-pl-retrieval` 及 `src-practical-code-rag-at-scale`；未检出本仓库者可仅依赖本文与 `TRD.md`）。

---

## 1. 现状摘要

### 1.1 当前数据流

1. **离线索引**：代码被切分为 `chunks`，文本经 `EmbedderService` 写入 `embeddings`（`SQLiteVectorStore`）。
2. **在线检索**（`RetrievalService.retrieve`）：
   - 对用户问题做 **dense embedding**，`similaritySearchVectorWithScore` 取 `topK × 3` 候选；
   - 对分数做 **min-max 归一化**；
   - **混合**：对仓库内 **全部 chunk** 做自定义 **词边界命中 + 路径/符号名加权** 的 lexical 分数，再取 top 子集，与语义分数按 **intent（locate / explain）** 加权融合；
   - 输出按融合分排序，截断为 `topK`。

### 1.2 与目标文献的一致点

- NL→PL 场景以 **dense 为主** 与文献建议一致。
- 用第二路 **词汇/路径信号** 补 **精确标识符**，与「Dense + 稀疏互补」方向一致。

### 1.3 主要差距

| 维度 | 现状 | 文献/工程实践倾向 |
|------|------|-------------------|
| 稀疏路 | 全表扫描 + 启发式加权 | **BM25 + 词级** 倒排，带 IDF 与长度归一化 |
| 融合 | 归一化后线性加权 | 可评估 **RRF** 等秩融合，降低标度敏感 |
| 查询模态 | `locate` / `explain` | 可增加 **PL→PL vs NL→PL** 路由（代码片段查询 vs 自然语言） |
| 稀疏延迟 | 随 chunk 数 O(N) 扫描 | 倒排仅扫 **posting 命中集**，更可扩展 |
| 索引文本 | 由现有分块与 embed 输入决定 | 可与 **上下文窗口**、**overlap**、**路径/import** 等策略对齐 |

---

## 2. 目标与非目标

### 2.1 目标

1. 在保持 **单仓库、SQLite 中心化** 的前提下，提升 **召回相关性**（尤其符号精确匹配与 NL→PL 语义对齐）。
2. 控制 **P99 检索延迟**：仓库增大时避免对全 chunk 逐条 lexical 扫描。
3. 改进 **可观测性**：记录各路候选数、融合方式、查询类型，便于回归。

### 2.2 非目标（本设计阶段不承诺）

- 引入分布式向量库或跨仓库联邦检索。
- 替换为商业 API 作为 **唯一** 依赖（可作为可选 embedder 策略单独评估）。
- 大规模离线标注集与完整 NDCG/EM 基准复现（可留作后续质量专项）。

---

## 3. 方案分阶段设计

以下阶段可按优先级拆分 PR，彼此存在一定依赖关系。

### 阶段 A：稀疏检索 — BM25（词级）与索引结构

**动机**：文献中 BM25+词级在质量-延迟上优于简单重叠；词级与 BPE 质量相当但更快。

**设计要点**：

1. **分词**：与代码兼容的词级 tokenizer（标识符、路径段、中英文；避免与现有 `tokenizeQuestion` 语义冲突）。
2. **索引**（二选一或组合）：
   - **SQLite FTS5**：虚拟表或内容表同步 `chunk_id`、可检索文本列；查询时用 BM25 相关函数或 `match` + 排序；或
   - **应用内倒排**：索引构建在 `addVectors`/chunk 写入时增量更新；适合需完全自控 BM25 参数（k1、b）的场景。
3. **统计量**：每文档词频、文档长度、语料级 `avgdl`、词项文档频率（供 IDF）。
4. **召回**：BM25 先返回 **topN**（N ≫ topK，例如与当前 `topK×4` 同量级或可配置），再进入融合。此处目标是 **避免对全库每个 chunk 逐一算分/扫正文**（仍可对 topN 候选做排序）；与现实现「全表 lexical 扫描」对比。

**验收建议**：

- 单元测试：固定小语料上 BM25 排序与手工预期一致（含长度归一化、停用词可选）。
- 性能：在 1e4+ chunk 量级下，检索路径不得对 **全部** chunk 做 O(N) 内容扫描（除非显式 fallback）。

**风险**：中文与代码混排分词质量；需与现有 `chunk.content` 字段对齐（是否含 `file_path` 进 FTS 见阶段 D）。

---

### 阶段 B：混合融合 — RRF 与权重策略

**动机**：min-max + 线性加权对分布漂移敏感；文献常见 **RRF** 合并两路排序。

**设计要点**：

1. 保留 dense 有序列表与 BM25 有序列表（各取 topN）。
2. **RRF**：`score(d) = Σ 1/(k + rank_i(d))`，k 典型 60；无分数归一依赖。
3. **与 intent 结合**（可选）：
   - locate：两路都进 RRF，或对 BM25 秩加系数；
   - explain：仍以 dense 秩为主（例如仅 dense 进 RRF，BM25 作 boost 列表）。
4. **回滚开关**：配置项选择 `legacy_weighted` vs `rrf`，便于 A/B。

**验收建议**：

- 黄金问题集（现有 `acceptance-question-set` 可扩展）人工对比前后引用文件是否更准。
- 日志中输出两路 rank 交集比例。

---

### 阶段 C：查询路由 — PL→PL vs NL→PL

**动机**：代码片段查询与目标代码 **词汇重叠高**，文献建议 **BM25 为主**；自然语言问句 **dense 为主**。

**设计要点**：

1. **轻量分类器**（启发式即可首版）：
   - 高比例标识符/路径/括号/分号 → 倾向 **PL**；
   - 或以「是否像自然语言问句」规则（中文/英文疑问模式 + 低符号密度）→ **NL**。
2. **策略**：
   - NL→PL：dense 主召回 + BM25 补充（当前方向强化）。
   - PL→PL：BM25 主排序 + dense 补充或 RRF **近似对称**融合（实现上 BM25 秩项系数略高于 dense，非严格 1:1；见 `RetrievalService` 内 `rrfDenseBm25Weights`）。
3. 与现有 `detectIntent` **正交**：Intent 管「定位 vs 解释」，模态管「语言类型」；可组合矩阵（2×2）配置权重或 RRF 参数。

**实现（Phase 3，见 [`docs/03-planning/retrieval-enhancement-roadmap.md`](../03-planning/retrieval-enhancement-roadmap.md)）**：

- **判别**：`apps/server/src/lib/query-modality.ts` — `inferAutoQueryContentModality`（`auto`）与 `resolveQueryContentModality`（合并 `RETRIEVAL_QUERY_MODALITY`）。
- **路由**：`RetrievalService` 根据解析后的 **`nl` \| `pl`** 调整向量/dense 召回深度、BM25 top-N（仅 PL 侧放大）、`weighted` 线性权重与 RRF 的 `denseWeight` / `bm25Weight`（在 `locate` / `explain` 基线之上再按模态微调）。**`RETRIEVAL_SPARSE_MODE=full_table`** 时稀疏路仍为全表启发式打分；进入融合的 lexical 候选 **截取上限** 在 **PL** 时与 FTS 路同向略放大（≈×1.15），dense 深度仍随模态调整。
- **运维**：误判时用 `force_nl` / `force_pl` 固定内容模态，无需改问句。

**验收建议**：

- 构造少量 PL 查询（粘贴函数签名）与 NL 查询对照，确认主排序路径符合预期（日志字段 `queryModality` 为配置，`queryContentModality` 为解析后的 `nl` \| `pl`）。

---

### 阶段 D：索引与 Embedding 上游

**动机**：检索上限受 **chunk 质量** 与 **向量模型** 约束；文献强调分块与 **上下文窗口** 对齐及 **代码专用 embedding**。

**设计要点**：

1. **分块**：复核 `CHUNK_MAX_LENGTH` / overlap 与 `MAX_CONTEXT_TOKENS` 的关系；评估按 **行窗口** 或语法边界切分是否与 TRD 一致且需调整。
2. **嵌入输入**：可选在 **索引文本** 中前置 `file_path`、关键 **import** 行（与文献中「context 增强」一致；注意若仅注入 ask 上下文而不改索引，则不影响向量召回，需区分两种增强）。
3. **Embedder**：评估切换或配置 **代码向量化模型**（保持 **同一模型** 写库与查询；禁止混用向量空间）。

**验收建议**：

- 重建索引前后对同一问题集对比引用命中率。
- 文档化「重建索引」操作与兼容性（模型维度变更需全量重嵌入）。

---

### 阶段 E：Ask 上下文组装（非检索排序）

**动机**：文献指出在 Bug 定位类任务中，向模型提供 **路径与 import** 可提升表现（即使不改变检索排序）。

**设计要点**：

- 在 `buildContextFromResults`（或等价位置）为每个 chunk 附加结构化头：`path`、`可选 import 摘要`（若 chunk 或侧车元数据可得）。
- 与 token 预算协调，避免头信息挤占正文。

**验收建议**：

- 人工抽查生成答案是否更少「虚构路径」；可选对比 token 用量。

---

## 4. 配置与运维

建议新增或扩展（具体命名实现阶段再定）：

| 配置项 | 含义 |
|--------|------|
| `RETRIEVAL_FUSION` | `weighted` \| `rrf` |
| `RETRIEVAL_BM25_TOP_N` | BM25 路召回深度 |
| `RETRIEVAL_DENSE_TOP_N` | 向量路召回深度（现语义 topK 倍数可并入） |
| `RETRIEVAL_QUERY_MODALITY` | `auto`（启发式 NL vs PL）\| `force_nl` \| `force_pl`；与 `intent` 正交。详见路线图 **Phase 3** 与上文 §3.C「实现」 |
| `RETRIEVAL_RRF_K` | RRF 常数 k |
| `RETRIEVAL_RRF_EXPLAIN_BM25_WEIGHT` | RRF 下 `explain` 意图时稀疏路排名项权重（`locate` 为 1）；实现中 clamp 至 \[0, 2\]，默认见 `@repo/constants` |

日志字段建议（实现为 **camelCase** JSON，见 `docs/06-operations/logging-events.md`）：`queryModality`（配置枚举）、`queryContentModality`（`nl` \| `pl`）、`fusionMode`、`bm25CandidateCount`、`denseCandidateCount`、`durationMs` 与分段 `durationEmbedMs` / `durationDenseMs` / `durationSparseMs` / `durationFuseMs`；RRF 时另有 `rrfDenseWeight` / `rrfBm25Weight`。

---

## 5. 风险与依赖

- **FTS5 与 BM25**：不同 SQLite 版本/编译选项下 API 略有差异，需在目标环境验证；FTS5 辅助函数 `bm25()` 的用法以 [SQLite FTS5 文档](https://www.sqlite.org/fts5.html) 为准（与手写 Okapi 公式在细节上可能略有差别，验收以「排序质量 + 性能」为准）。
- **索引体积**：倒排或 FTS 会增加 DB 大小与写入时间，需在 `IndexService` 流程中纳入进度与失败重试。
- **中文分词**：若仅用 ASCII 边界，中文 BM25 效果可能偏弱；可迭代 tokenizer 或 FTS 的 `tokenize` 选项。
- **与 chunks 生命周期一致**：仓库重索引、按 repo 删除 chunk 时，FTS/倒排必须与 `chunks` **同步增删**，否则会出现幽灵命中或漏召回；稀疏索引需带 **`repo_id`（或等价过滤键）**，与向量检索的仓库隔离一致。
- **查询语法**：FTS `MATCH` 对用户原始问题需做 **转义/规范化**（引号、NEAR、前缀等特殊 token），避免语法错误或意外宽匹配。

---

## 6. 建议实施顺序

1. **A（BM25 + 非全表扫描）** — 收益/风险比高，直接缓解扩展性。
2. **B（RRF）** — 与 A 配套，改动集中在 `RetrievalService`。
3. **C（PL/NL 路由）** — 在 A/B 稳定后加，避免同时调参过多。
4. **D/E** — 与产品对「重建成本」「答案质量」的容忍度对齐，可并行规划。

---

## 7. 参考与代码锚点

- 当前检索：`apps/server/src/services/retrieval.service.ts`
- NL/PL 查询模态（启发式 + `resolveQueryContentModality`）：`apps/server/src/lib/query-modality.ts`
- 向量存储：`apps/server/src/lib/sqlite-vector-store.ts`
- 分块与检索默认常量：`packages/constants/src/index.ts`（如 `CHUNK_MAX_LENGTH`、`CHUNK_OVERLAP`、`DEFAULT_TOP_K`、`MAX_CONTEXT_TOKENS`）；运行时可覆盖项见 `apps/server/src/config/runtime.ts`、根目录 `.env.example`
- 检索结果类型：`apps/server/src/types/retrieval.ts`（`RetrievalResult`）
- Ask 上下文组装：`apps/server/src/services/ask.service.ts`（`buildContextFromResults`）
- 产品/技术总览：`docs/02-technical/TRD.md`
- 稀疏索引 DDL：`apps/server/src/db/migrations/003_chunk_fts.sql`
- 稀疏正文与向量输入对齐：`apps/server/src/lib/chunk-index-text.ts`；写入同步：`apps/server/src/db/chunk.repository.ts`（`saveChunk` / `saveChunks`）；删除同步：同文件的 **`deleteChunkById` / `deleteChunksByRepoId`** 与 **`repo.repository` 的 `deleteRepoById`**

外部与内部概念笔记：`wiki/code-rag`（见本文头部列表）。

---

## 8. 开放问题

1. **（P1-1 已决议，见 §9）** 不采用 FTS5 `EXTERNAL CONTENT` 挂 `chunks`；采用 `chunk_fts` 影子表并由应用同步。
2. 重建索引时是否 **版本化** embedding 模型 id，避免误用旧向量？
3. 黄金集与自动化回归的 **最低门槛**（仅 smoke 还是定期人工评审）？
4. 是否在融合前增加 **轻量重排**（如 small cross-encoder 或启发式规则）作为可选阶段；本设计未展开，以免与「控制延迟」目标冲突。
5. `similaritySearchVectorWithScore` 当前为 **全量内存余弦**（见 `TRD`），超大仓库下是否与 BM25 索引 **并行**考虑 ANN/分片；属中长期非目标，但与 P99 相关时需回溯。

---

## 9. P1-1 稀疏索引方案决议（路线图）

- **默认方案**：SQLite **FTS5 影子表** `chunk_fts`（与 `chunks` 分离存储，**不**使用 `EXTERNAL CONTENT` 直接挂 `chunks`）。
- **理由**：`chunks.id` 为 TEXT 主键，FTS5 `content=` 与 rowid 语义耦合高；由应用在 **P1-2 / P1-3** 与 chunk 写入、删除、重载 **显式同步** 更清晰，也便于控制 `body` 与嵌入输入是否对齐。
- **DDL**：`003_chunk_fts.sql`（幂等 `CREATE VIRTUAL TABLE IF NOT EXISTS`；由既有 `schema_migrations` 机制执行一次）。
- **列语义**：
  - `chunk_id`（UNINDEXED）：等于 `chunks.id`，主关联键。
  - `repo_id`（UNINDEXED）：等于 `chunks.repo_id`；检索时 `WHERE repo_id = ?` 与 `MATCH` 组合实现仓库隔离。
  - `body`：可检索正文；与稠密嵌入输入一致，由 `apps/server/src/lib/chunk-index-text.ts` 的 **`chunkToSparseIndexBody`** 生成（`EmbedderService` 与 `chunk.repository` 共用）。
- **唯一性**：FTS5 表本身**不**对 `chunk_id` 做唯一约束；须由 **P1-2** 写入策略保证「每个 `chunk_id` 至多一行」（例如更新前 `DELETE WHERE chunk_id = ?` 再 `INSERT`，或等价 `INSERT INTO chunk_fts(chunk_fts, …)` 替换语义），否则检索可能出现重复行。
- **删除（P1-3）**：`deleteChunkById`、`deleteChunksByRepoId` 在事务内先删 `chunk_fts` 再删 `chunks`；`deleteRepoById` 先按 `repo_id` 删 `chunk_fts` 再删 `repos`（避免仅依赖 CASCADE 留下 FTS 孤儿）。
- **分词器**：`unicode61`（后续可按中文与代码效果评估 `tokenize` 调整）。
- **备选**：若 FTS5 在目标环境不可用或验收不达标，可切换 **应用内倒排 + Okapi BM25**（见 §3.A）；须另开 ADR 并修订迁移策略。
