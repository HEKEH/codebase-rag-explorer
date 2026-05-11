# 检索管线增强实施路线图（Retrieval Enhancement）

依据 [`docs/02-technical/retrieval-enhancement-design.md`](../02-technical/retrieval-enhancement-design.md) 将实施工作按依赖拆分为多个阶段；技术细节与代码锚点以设计稿 §7 及 `docs/02-technical/TRD.md` 为准。

## 原则

- 需求与非目标以设计稿 **§2** 为准；阶段划分以设计稿 **§3、§6** 为准
- **稀疏路（BM25 + FTS 或倒排）与向量路**先能独立验收，再做多路融合，避免一次改动的回归面过大
- 每个 Task 必须具备可验证验收口径，避免「完成但不可测」
- 保持增量兼容：**`weighted`（现行 min-max 线性加权）** 在 RRF/新稀疏路稳定前须可回退（见设计稿 §3.B、`RETRIEVAL_FUSION`）
- 与仓库生命周期一致：FTS/稀疏索引的增删与 **`chunks` / 按 repo 删除** 同级联（设计稿 §5）
- 设计稿 **§2.2 非目标**（分布式向量库、完整学术基准复现、§8 Q4 **轻量重排** 等）本路线图 **不拆 Task**；若后续立项，单开路线图或 ADR

## 执行原则

- 若某段实现已判定 **过时或将被替换**，其配套测试 **不必再遵循「先红后绿」**；应在同一变更中 **删除** 过时测试（或改写为覆盖新行为），避免用例与目标代码双重腐烂
- 每个 Task 必须先补齐测试用例（先红），再进行功能开发（后绿）；开发阶段应避免针对测试用例「对题作答」
- 每完成一个 Task，更新本文件对应 checkbox，并在会话结束时同步结论（必要时更新设计稿 **§8 开放问题** 的决议）
- 每完成一个 Task 后，提交一次独立的 `git commit`（保持单任务单提交）
- 若 Task 与 TRD/设计稿冲突，以 **文档对齐后再实现** 为前置条件
- 安装依赖时，如非必要避免加到仓库根目录；应尽量安装到对应的 `apps/*` 或 `packages/*`（见根目录 `AGENTS.md`）
- FTS `MATCH`、embedding 模型切换等 **需用户重建索引** 的行为，须在 `TRD` 或 `docs/06-operations` 留可追溯说明

---

## Phase 1：稀疏索引与 BM25 召回

> 目标：以 **非全表扫描** 方式完成稀疏路召回，替代或旁路现行「全库 lexical 扫描」（设计稿 §1.1、§3.A）

- [x] **P1-1** | 设计稿 §3.A、§5、§8 Q1 | 确定稀疏索引方案：默认 **SQLite FTS5**（独立表 vs `EXTERNAL` 内容表）、DDL、`repo_id` 过滤；若经评审不采用 FTS，须明确 **应用内倒排 + BM25** 备选并更新设计稿决议 | 验收：迁移或初始化可重复执行；与 `chunks` 主键关联明确
- [x] **P1-2** | IndexService / 写入路径 | 新建或更新 chunk 时 **同步写入/更新稀疏索引**（FTS 行或倒排增量；可检索文本与 `chunk_id` 对齐） | 验收：索引后针对已知词可检索命中（FTS 为 `MATCH`；倒排为等价查询）
- [x] **P1-3** | 级联删除 / 重载 | 仓库删除、chunk 批量清理、**全量重载重建** 时稀疏索引与 `chunks` **一致** | 验收：删除/重载后无「幽灵」命中；重载完成后索引条目数与 chunk 数一致（或等价无孤儿）
- [x] **P1-4** | 查询侧 | 用户问题 → 稀疏检索的 **转义/规范化**（FTS 为 `MATCH` 语法；倒排为分词与特殊字符策略），避免语法错误或意外宽匹配 | 验收：含引号、符号、中英文混合问句用例不抛错
- [x] **P1-5** | 服务层 | 实现按 `repo_id` 的 **BM25 top-N**（FTS 可用 `bm25()` + `LIMIT`；倒排为等价 BM25 打分排序）；N 可配置 | 验收：固定小语料单元测试，排序与手工预期一致
- [x] **P1-6** | `RetrievalService` | 用 BM25 top-N **替换**现行全表 `getChunksByRepoId` lexical 扫描（或通过配置开关切换） | 验收：单测或集成测断言检索路径 **不对全部 chunk 扫正文**（允许显式 `fallback` 分支单独覆盖）；若 API 层为 `retrieve` 扩展 **`chunk_ids` 白名单**（向量路已支持 filter），稀疏路须 **同一过滤语义**（可与本 Task 或跟进 PR 合并，但不得长期不一致）
- [x] **P1-7** | 性能基线 | 在 1e4+ chunk 量级下记录检索耗时（或与当前实现对拍）；不达标则记录瓶颈与后续项（设计稿 §8 Q5） | 验收：文档或脚本输出可复现数字

**Phase 1 完成标志**：稀疏路具备 BM25（或等价）排序、与 chunks 生命周期一致；`RetrievalService` 默认路径不再依赖全库 lexical 扫描。

---

## Phase 2：RRF 融合与可观测性

> 目标：引入 **RRF** 与配置项，保留 legacy 加权融合；补齐结构化日志（设计稿 §3.B、§4）

- [x] **P2-1** | `runtime` / `.env.example`（及与项目惯例对齐的 `@repo/constants` 默认值，若有） | 接入 `RETRIEVAL_FUSION`、`RETRIEVAL_BM25_TOP_N`、`RETRIEVAL_DENSE_TOP_N`、`RETRIEVAL_RRF_K`、`RETRIEVAL_QUERY_MODALITY`（设计稿 §4；命名以实现为准） | 验收：默认值与现行行为兼容或显式文档化 breaking 默认
- [x] **P2-2** | `RetrievalService` | 实现 **RRF** 融合（dense 秩 + BM25 秩）；常数 k 可配置 | 验收：单元测试：两路人工列表合并顺序符合 RRF 公式
- [ ] **P2-3** | 可选 | **intent（locate/explain）** 与 RRF 的组合策略（设计稿 §3.B.3） | 验收：locate/explain 各至少 1 条用例或快照日志
- [ ] **P2-4** | 日志 | 输出 `fusion_mode`、`bm25_candidate_count`、`dense_candidate_count`、**分段** `duration_ms`（embed / dense / bm25 / fuse）、**两路 rank 交集比例或等价指标**（设计稿 §3.B）；`query_modality` 在 Phase 3 落地后接入同一检索事件 | 验收：`docs/06-operations/logging-events.md` 或等价处登记字段（若已有检索事件则扩展）
- [ ] **P2-5** | 回归 | **`weighted` / legacy 线性加权**（现行 min-max 融合）路径保留且单测覆盖；与 `rrf` 切换可 A/B | 验收：同一 fixture 下两种 fusion 均可跑通

**Phase 2 完成标志**：融合策略可配置；日志足以支撑问题集对比与延迟拆解。

---

## Phase 3：PL / NL 查询路由

> 目标：**查询模态**与 **locate/explain intent** 正交；PL→PL 抬高稀疏/dense 组合权重（设计稿 §3.C）

- [ ] **P3-1** | `RetrievalService` 或独立模块 | 实现轻量 **`query_modality`** 判别（`auto`：启发式 PL vs NL） | 验收：构造 PL 片段 vs NL 问句单测，期望标签正确
- [ ] **P3-2** | 检索策略 | `force_nl` / `force_pl` 配置覆盖自动判别（设计稿 §4） | 验收：环境变量或 runtime 覆盖生效
- [ ] **P3-3** | 融合与 topN | 按模态调整 **主排序路**（NL→PL：dense 主；PL→PL：BM25 主或 RRF 平等） | 验收：日志含 `query_modality`；对应用例 rank 或引用文件符合预期
- [ ] **P3-4** | 文档 | 简述判别规则与误判时的运维开关（`force_*`） | 验收：设计稿或 TRD 片段引用本路线图

**Phase 3 完成标志**：模态可观测、可强制覆盖；检索策略与文献推荐的模态分界一致。

---

## Phase 4：索引与 Embedding 上游

> 目标：提升 chunk 与向量 **上限**（设计稿 §3.D）；可与 Phase 5 并行，但常触发 **重建索引**

- [ ] **P4-1** | 分块 | 复核 `CHUNK_MAX_LENGTH` / `CHUNK_OVERLAP` 与 `MAX_CONTEXT_TOKENS`（`packages/constants`、`runtime`） | 验收：结论写入 TRD 或设计稿附录（是否调整默认值）
- [ ] **P4-2** | 嵌入文本 | 可选：索引阶段在 embedding 输入中 **前置 `file_path` / import 摘要**（与 Ask 侧增强区分） | 验收：重建索引后，抽样问题的向量召回或端到端引用质量有记录对比
- [ ] **P4-3** | Embedder | 可选：可配置 **代码向量化模型**；**禁止**混用向量空间（设计稿 §3.D.3） | 验收：切换模型时清库/重嵌入流程 documented；维度不一致时有硬错误
- [ ] **P4-4** | 可选 | **embedding 模型 id / 版本** 落库（设计稿 §8 Q2） | 验收：错误配置下拒绝查询或提示重建

**Phase 4 完成标志**：分块与嵌入策略有明确结论；模型切换与重建路径可操作、可验证。

---

## Phase 5：Ask 上下文组装增强

> 目标：在不改变排序的前提下，为 LLM 提供 **路径 / import** 线索（设计稿 §3.E）

- [ ] **P5-1** | `ask.service.ts` | `buildContextFromResults` 为每条结果增加结构化头（至少 `file_path`；import 视元数据可得性） | 验收：快照测试或单测断言上下文格式
- [ ] **P5-2** | Token 预算 | 头信息与 `MAX_CONTEXT_TOKENS` 裁剪策略协调，避免挤占正文 | 验收：超长多 chunk 用例下不越界或行为明确

**Phase 5 完成标志**：生成侧可见稳定路径线索；token 行为可预测。

---

## Phase 6：测试与验收回归

> 目标：自动化 + 黄金集；对齐现有质量资产（设计稿 §3 各阶段验收建议）

- [ ] **P6-1** | 集成测试 | 覆盖「仅 dense」「仅 BM25」「RRF」「`weighted`（legacy 线性）」关键路径（按实现裁剪；**仅 BM25/仅 dense** 可为配置或测试桩） | 验收：`bun test` 相关包通过
- [ ] **P6-2** | 黄金集 | 扩展或固定 `docs/05-quality/acceptance-question-set(.json)` 中与检索相关的用例 | 验收：每条有期望行为（引用文件或关键词）
- [ ] **P6-3** | 人工 / 脚本 | 运行 acceptance-eval 或等价脚本，前后对比记录（可选 `docs/05-quality/` 报告） | 验收：有可追溯 before/after 摘要

**Phase 6 完成标志**：核心检索路径可回归；质量对比有记录。

---

## Phase 7：发布与运维

> 目标：重建索引、配置变更、回滚可执行（对齐 `repo-chat-split-roadmap` Phase 6 精神）

- [ ] **P7-1** | docs/06-operations / TRD | **发布前检查**：迁移、**稀疏索引**构建/填充（含从旧库升级：无索引直至重载的风险说明）、`RETRIEVAL_*` 默认值、重建索引提示；**检索相关 TRD 章节**与实现一致（若有架构变更） | 验收：清单可勾选
- [ ] **P7-2** | docs/06-operations | **发布后核验**：检索日志字段抽样、`ask-failed` 是否异常 | 验收：记录一次演练结果
- [ ] **P7-3** | Runbook | 回滚：关闭 RRF / 回到 **`weighted`**、或回退版本 + DB 兼容说明 | 验收：步骤可独立执行

**Phase 7 完成标志**：上线与回滚不依赖口头约定。

---

## 阶段依赖关系

```text
Phase 1（稀疏索引：FTS 或倒排 + BM25 + 替换全表扫描）
  └─→ Phase 2（RRF + 日志 + legacy 回退）
       └─→ Phase 3（PL/NL 路由）
            ├─→ Phase 4（分块/嵌入上游，常需重建索引）
            └─→ Phase 5（Ask 上下文头，可与 4 并行）
Phase 6（测试与黄金集）← 在 1–2 完成后可穿插启动，随功能递增
Phase 7（运维）← 发布窗口前完成
```

## 工期估算

| 阶段 | Task 数 | 预估会话数 | 风险点 |
| ---- | ------- | ---------- | ------ |
| Phase 1 | 7 | 3–4 | FTS 与 chunks 同步、MATCH 转义、中文分词 |
| Phase 2 | 5 | 1–2 | RRF 与 intent 组合调参、日志噪声 |
| Phase 3 | 4 | 1–2 | PL/NL 误判、与 locate/explain 交叉 |
| Phase 4 | 4 | 2–4 | 重建成本、模型维度与清库 |
| Phase 5 | 2 | 1 | import 元数据缺失时的降级 |
| Phase 6 | 3 | 2–3 | 黄金集维护成本 |
| Phase 7 | 3 | 1 | Runbook 与真实环境差异 |
| **合计** | **28** | **11–17** | |

## 变更记录

- 2026-05-08：初始化路线图，对齐 `retrieval-enhancement-design.md` 与 `repo-chat-split-roadmap.md` 结构。
- 2026-05-08：执行原则补充：过时实现对应的测试可跳过 TDD 约束并应删除或改写。
- 2026-05-08：审查修订：非目标显式排除；P1 支持倒排备选、重载一致性、chunk_ids 与向量路对齐；P2 补全配置项与 rank 交集日志、TRD 同步列入 P7-1。
- 2026-05-08：终检：P1/P7 用语与「倒排备选」对齐；依赖图 Phase 1 不再写死 FTS；P7-1 补充旧库升级至空稀疏索引直至重载的运维说明。
- 2026-05-08：完成 **P1-1**：`003_chunk_fts.sql` + `connection` / `chunk-fts` 测试；设计稿新增 **§9** 与 §8 Q1 决议。
- 2026-05-08：完成 **P1-2**：`chunk.repository` 在 `saveChunk` / `saveChunks` 事务内 `replaceChunkFtsRow`；`chunk-index-text` 与 `EmbedderService` 对齐；`chunk.repository.fts.test` + `IndexService` 断言 `chunk_fts` 行数。
- 2026-05-09：完成 **P1-3**：`deleteChunkById` / `deleteChunksByRepoId` / `deleteRepoById` 在同一事务内清理 `chunk_fts`；`chunk.repository.fts-cascade.test.ts`。
- 2026-05-09：完成 **P1-4**：`lib/fts-query-normalize.ts`（`normalizeUserQueryForFts5Match`）+ `fts-query-normalize.test.ts`（含 MATCH 集成用例）。
- 2026-05-09：完成 **P1-5**：`chunk.repository` 新增 `searchChunkIdsByFtsBm25`；`runtimeConfig.retrievalBm25TopN` + `.env.example` 的 `RETRIEVAL_BM25_TOP_N`；`chunk.repository.fts-bm25.test.ts`。
- 2026-05-10：完成 **P1-6**：默认 `RETRIEVAL_SPARSE_MODE=fts`；`buildFtsOrMatchFromRetrievalTokens` + BM25 稀疏候选；`getChunksByIds` / `searchChunkIdsByFtsBm25(..., chunkIdFilter)`；`retrieve(..., { chunk_ids })`；`logging-events` 补充检索字段说明。
- 2026-05-10：完成 **P1-7**：`benchmark:retrieval-sparse`（12k `chunk_fts` 合成库 + 多次 BM25 查询均值）；`docs/06-operations/retrieval-sparse-benchmark.md`。
- 2026-05-11：完成 **P2-1**：`runtimeConfig.retrievalFusion` / `retrievalDenseTopN`（空则 legacy `max(topK×3,topK)`）/ `retrievalRrfK`（默认 `DEFAULT_RETRIEVAL_RRF_K`）/ `retrievalQueryModality`（预留给 Phase 3）；`.env.example` 注释说明。
- 2026-05-11：完成 **P2-2**：`lib/reciprocal-rank-fusion.ts` + 单测；`RETRIEVAL_FUSION=rrf` 时 `RetrievalService` 用 dense/BM25 双路 RRF（`RETRIEVAL_RRF_K`）；`retrieval.finished` 增加 `fusionMode`。
