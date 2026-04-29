# Server 修复路线图与任务列表

基于 `docs/04-implementation/server-issues.md` 的分析，将 22 个问题按依赖关系和优先级编排为 5 个阶段。

## 原则

- 各阶段应交付可验证的增量成果，且不引入跨阶段依赖
- 后端管线修复优先于前端重构（前端依赖后端 API 行为正确）
- 每个 Task 应可在单次开发会话内完成

## 执行原则

- 每个 Task 必须先补齐测试用例（先红），再进行功能开发（后绿）；开发阶段应避免针对测试用例“对题作答”。
- 每完成一个 Task，AI 需立即更新对应的 checkbox 状态，并在会话结束前同步更新 memory。
- 每完成一个 Task 后，提交一次独立的 `git commit`（保持单任务单提交）
- 如果对Task有不明确的地方，必须先与用户沟通后再进行开发
- 安装依赖时，如非必要避免加到仓库根目录；应尽量安装到对应的 `app` 或 `package` 目录中。

---

## Phase 1：基础设施重建

> 目标：替换内存存储为 SQLite，引入 LangChain 依赖，修正共享包

- [x] **T1-1** | #2.1 | 实现 SQLite 连接（`db/connection.ts`），启动时自动建表（`schema.sql`） | 验收：服务启动后 `data/codebase-rag.db` 存在三表
- [x] **T1-2** | #2.1 | 实现 `chunk.repository.ts`：按 repo_id CRUD chunks，批量插入 | 验收：单元测试通过
- [x] **T1-3** | #2.1 | 实现 `embedding.repository.ts`：按 chunk_id 存取向量（Float32Array ↔ BLOB），按 repo_id 批量读取 | 验收：单元测试通过
- [x] **T1-4** | #2.1 | 重写 `repo.store.ts` → `repo.repository.ts`：repos 表 CRUD，状态更新 | 验收：`getRepoById`/`saveRepo`/`updateRepoStatus` 走 SQLite
- [x] **T1-5** | #5.2 | `@repo/constants` 补全 `IGNORED_DIRECTORIES`（加 `.venv`、`target`、`bin`、`obj`） | 验收：与 TRD 一致
- [x] **T1-6** | #5.3 | `@repo/constants` 修正 `IGNORED_FILE_PATTERNS` 为正则数组，补全二进制排除 | 验收：与 TRD 一致
- [x] **T1-7** | #5.4 | `@repo/types` Message 类型增加 `id: string`、`timestamp: number` | 验收：类型校验通过
- [x] **T1-8** | #5.5 | `@repo/constants` 增加 `EMBEDDING_BATCH_SIZE = 2048` | 验收：常量可引用
- [x] **T1-9** | #1.4 | 安装 LangChain 依赖：`langchain`、`@langchain/core`、`@langchain/anthropic`、`@langchain/textsplitters`、`@langchain/community`、`@xenova/transformers` | 验收：`bun install` 无报错

**Phase 1 完成标志**：服务启动后所有数据持久化到 SQLite，共享包常量与类型与 TRD 一致，LangChain 依赖可用。

---

## Phase 2：核心管线替换

> 目标：用真实 RAG 管线替换所有占位实现——这是产品从"能跑"到"可用"的关键阶段

- [x] **T2-1** | #1.3 | 实现 `lib/tree-sitter.ts`：封装 Tree-sitter 初始化，按扩展名选择 grammar，解析 AST 提取函数/类/方法节点 | 验收：输入 TS 文件，返回函数/类节点列表
- [x] **T2-2** | #1.3 | 重写 `splitter.service.ts`：阶段一 Tree-sitter AST 语义切分，阶段二 LangChain `RecursiveCharacterTextSplitter` 兜底 | 验收：函数/类 chunk 类型正确；超长 chunk 不超 max_length
- [x] **T2-3** | #1.1 | 重写 `embedder.service.ts`：使用 `HuggingFaceTransformersEmbeddings`（nomic-embed-text-v1.5, 768 维），替换 hash 伪向量 | 验收：相似问题检索返回语义相关结果
- [x] **T2-4** | #2.2 | 实现 `SQLiteVectorStore`：继承 `@langchain/core` VectorStore 接口，内部操作 embeddings 表，支持 `addVectors`、`similaritySearchVectorWithScore`、`delete` | 验收：单元测试：存入向量后可检索出 top-k
- [x] **T2-5** | #1.1 | 重写 `index.service.ts`：切分结果写入 chunks 表，embedding 结果写入 embeddings 表（通过 SQLiteVectorStore），替换 JSON 文件 | 验收：索引完成后 SQLite 三表有数据
- [x] **T2-6** | #1.2 | 实现 `lib/prompts.ts`：System Prompt + User Prompt Template（`ChatPromptTemplate`） | 验收：prompt 变量可注入
- [x] **T2-7** | #1.2 | 重写 `ask.service.ts`：检索走 SQLiteVectorStore + Retriever，回答走 `ChatAnthropic` + prompt chain，引用从检索白名单生成 | 验收：对代码库提问返回有意义的回答 + 引用
- [x] **T2-8** | #2.2 | 重写 `retrieval.service.ts`：基于 SQLiteVectorStore 的 `similaritySearchVectorWithScore`，从 chunks 表关联元数据 | 验收：返回 top-k 结果按 score 降序

**Phase 2 完成标志**：导入代码库 → 构建索引 → 问答，全链路使用真实 Embedding + 真实 LLM，数据持久化在 SQLite。

---

## Phase 3：API 与业务逻辑修正

> 目标：修正 API 行为与 TRD/PRD 对齐

- [x] **T3-1** | #3.1 | 索引构建改为异步：`buildIndex` 触发后台任务，立即返回 `status: "indexing"`；`GET /api/index/status` 返回实时状态 | 验收：前端轮询可获取 indexing → indexed 状态变化
- [x] **T3-2** | #3.4 | `BuildIndexData.status` 返回 `"indexing"` 而非 `"indexed"` | 验收：API 响应与 TRD 一致
- [x] **T3-3** | #3.3 | `NO_RELEVANT_CODE` (3001) 响应 `data` 改为 `{answer, references:[]}`，不再走全局 error handler | 验收：PRD §7.1 合规
- [x] **T3-4** | #3.2 | 移除 `POST /api/retrieval/search` 路由和 `retrieval.ts` 路由文件 | 验收：该端点不再可访问
- [x] **T3-5** | #3.5 | TRD 同步更新 `RepoStatus` 增加 `"failed"` | 验收：TRD 与代码一致

**Phase 3 完成标志**：所有 API 端点行为与 PRD/TRD 完全一致。

---

## Phase 4：前端重构

> 目标：从单文件 App.tsx 重构为组件化架构，依赖 Phase 3 的 API 行为正确性

- [x] **T4-1** | #4.4 | 初始化 shadcn/ui + Tailwind CSS 4，配置 `components.json` | 验收：`bunx shadcn add button` 可用
- [x] **T4-2** | #4.2 | 实现 Jotai atoms：`repoAtom`、`repoStatusAtom`、`isIndexedAtom`、`messagesAtom`、`currentQuestionAtom`、`isAskingAtom` | 验收：原子可读写、派生正确
- [x] **T4-3** | #4.3 | 实现 TanStack Query hooks：`useImportRepo`、`useBuildIndex`、`useIndexStatus`（含轮询）、`useAskQuestion` | 验收：hooks 调用 API 并管理 loading/error
- [x] **T4-4** | #4.1 | 实现 `AppLayout`：左面板 320px + 右面板 flex-1 | 验收：布局与 TRD §4.1 一致
- [x] **T4-5** | #4.1 | 实现 `RepoInput` + `RepoStatus` 组件 | 验收：导入流程可用
- [x] **T4-6** | #4.1 | 实现 `ChatInput` + `ChatMessage` + `ChatPanel` 组件 | 验收：问答流程可用
- [x] **T4-7** | #4.5 | 集成 Shiki 代码高亮，实现 `CodeReference` 组件（可折叠、语言标签、行号、复制按钮） | 验收：代码引用带语法高亮
- [x] **T4-8** | #4.6 | 集成 react-markdown + remark-gfm，ChatMessage 中渲染 LLM 回答 | 验收：Markdown 正确渲染
- [x] **T4-9** | #5.1 | `@repo/api-client` 改为单一共享 `apiClient` 实例 | 验收：baseURL 可统一配置
- [x] **T4-10** | #4.1 | 删除旧 `App.tsx`，用新组件组合替代 | 验收：旧代码无残留

**Phase 4 完成标志**：前端 UI 与 TRD 设计一致，组件化、状态管理、API 请求管理、代码高亮、Markdown 渲染全部就位。

---

## Phase 5：质量门禁与验收

> 目标：补全测试，通过 PRD 验收标准

- [x] **T5-1** | #6.1 | API 端点测试：导入成功/失败、索引状态、问答成功/失败 | 验收：6 个 P0 测试用例通过
- [x] **T5-2** | #6.1 | Service 集成测试：切分质量、检索排序、引用追溯、状态机 | 验收：6 个 P1 测试用例通过
- [x] **T5-3** | #6.1 | 协议一致性测试：所有失败响应均为 `{code, message, data: null}` | 验收：全错误码覆盖
- [x] **T5-4** | #6.2 | 前端组件测试：RepoInput、ChatMessage、CodeReference | 验收：核心组件测试通过
- [x] **T5-5** | #6.2 | 前端 Hook 测试：useImportRepo、useAskQuestion | 验收：hooks 测试通过
- [x] **T5-6** | #6.3 | 编写 PRD 验收题集（20+ 题），覆盖函数说明、模块查询、调用关系 | 验收：代码库可运行验收
- [ ] **T5-7** | #6.3 | 执行验收题集，记录回答一致率 | 验收：一致率 >= 80%（当前结果：59.09%，未达标，见 `docs/acceptance-eval-report.md`）

**Phase 5 完成标志**：所有测试通过，验收题集回答一致率达标。

---

## 阶段依赖关系

```text
Phase 1（基础设施）
  └─→ Phase 2（核心管线）—— 依赖 SQLite + LangChain 依赖
       └─→ Phase 3（API 修正）—— 依赖管线可用后才能修正 API 行为
            └─→ Phase 4（前端重构）—— 依赖 API 行为正确
                 └─→ Phase 5（质量门禁）—— 依赖全系统就绪
```

## 工期估算

| 阶段 | Task 数 | 预估会话数 | 风险点 |
|------|---------|-----------|--------|
| Phase 1 | 9 | 2-3 | SQLite 在 Bun 中的绑定兼容性 |
| Phase 2 | 8 | 3-4 | Tree-sitter WASM 在 Bun 中加载；Transformers.js 首次模型下载；Claude API 调用调试 |
| Phase 3 | 5 | 1-2 | 异步索引的状态机并发安全 |
| Phase 4 | 10 | 3-4 | shadcn/ui + Tailwind 4 配置；组件拆分工作量 |
| Phase 5 | 7 | 2-3 | 验收题集的回答质量取决于管线效果 |
| **合计** | **39** | **11-16** | |

---

## 变更记录

- 初始化：基于 server-issues.md 22 项问题编排为 5 阶段 39 个 Task
- 2026-04-26：完成 T1-1（SQLite 连接与启动自动建表），补充连接层测试 `apps/server/src/db/connection.test.ts`
- 2026-04-26：完成 T1-2（Chunk 仓储层 SQLite CRUD + 批量插入事务），补充 `apps/server/src/db/chunk.repository.test.ts`
- 2026-04-26：完成 T1-3（Embedding 仓储层 Float32Array/BLOB 存取 + repo 批量读取），补充 `apps/server/src/db/embedding.repository.test.ts`
- 2026-04-26：完成 T1-4（Repo 仓储层迁移到 SQLite，并更新服务层调用），补充 `apps/server/src/db/repo.repository.test.ts`
- 2026-04-26：完成 T1-5（补全 `IGNORED_DIRECTORIES` 为 TRD 要求），补充 `packages/constants/tests/ignored-directories.test.js`
- 2026-04-26：完成 T1-6（`IGNORED_FILE_PATTERNS` 改为正则并补全二进制类型），补充 `packages/constants/tests/ignored-file-patterns.test.js`
- 2026-04-26：完成 T1-7（`Message` 类型增加 `id` 与 `timestamp`），补充 `packages/types/src/message.typecheck.ts`
- 2026-04-26：完成 T1-8（新增 `EMBEDDING_BATCH_SIZE = 2048`），补充 `packages/constants/tests/embedding-batch-size.test.js`
- 2026-04-26：完成 T1-9（安装 LangChain 依赖并验证 `bun install`），补充 `apps/server/src/lib/langchain-deps.typecheck.ts`
- 2026-04-26：完成 T2-1（`web-tree-sitter` + 本地 WASM grammar 封装），补充 `apps/server/src/lib/tree-sitter.test.ts`
- 2026-04-26：完成 T2-2（Splitter 接入 Tree-sitter + LangChain 兜底切分），更新 `apps/server/src/services/splitter.service.ts` 与对应测试
- 2026-04-26：完成 T2-3（Embedder 接入 `HuggingFaceTransformersEmbeddings`，替换 hash 伪向量并补充批处理持久化测试），更新 `apps/server/src/services/embedder.service.ts` 与 `apps/server/src/services/embedder.service.test.ts`
- 2026-04-26：完成 T2-4（新增 `SQLiteVectorStore`，打通 embeddings 表向量写入/检索/删除能力），补充 `apps/server/src/lib/sqlite-vector-store.test.ts`
- 2026-04-26：完成 T2-5（`IndexService` 改为写入 SQLite chunks/embeddings，接入 `SQLiteVectorStore`），补充 `apps/server/src/services/index.service.test.ts`
- 2026-04-26：完成 T2-6（新增 `lib/prompts.ts`，定义 System/User Prompt Template 并注入变量），补充 `apps/server/src/lib/prompts.test.ts`
- 2026-04-26：完成 T2-7（`AskService` 接入 `ChatAnthropic` + Prompt Template 生成回答，引用严格来源于检索白名单），补充 `apps/server/src/services/ask.service.test.ts`
- 2026-04-26：完成 T2-8（`RetrievalService` 改为基于 `SQLiteVectorStore` 向量检索并返回排序结果），更新 `apps/server/src/services/retrieval.service.ts` 与对应测试
- 2026-04-26：完成 T3-1（`/api/index/build` 改为后台触发索引任务并立即返回 `status: "indexing"`），更新 `apps/server/src/routes/index.ts`
- 2026-04-26：完成 T3-2（`BuildIndexData.status` 改为 `"indexing"`，并同步索引服务返回），更新 `packages/types/src/api.ts`、`apps/server/src/services/index.service.ts`
- 2026-04-26：完成 T3-3（`NO_RELEVANT_CODE` 由 `ask` 路由本地返回 `{answer,references:[]}`，移出全局错误处理），更新 `apps/server/src/routes/ask.ts` 与 `apps/server/src/index.ts`
- 2026-04-26：完成 T3-4（移除多余 `POST /api/retrieval/search` 端点），删除 `apps/server/src/routes/retrieval.ts` 并移除服务注册
- 2026-04-26：完成 T3-5（TRD 同步 `RepoStatus` 增加 `failed`），更新 `docs/TRD.md`
- 2026-04-28：完成 T4-1（初始化 Tailwind CSS 4 + shadcn 配置，新增 `components.json`、`globals.css`、Vite/TS 别名与 `cn` 工具），补充 `apps/web/src/shadcn-setup.test.ts`，并验证 `shadcn add button --dry-run` 可用
- 2026-04-28：完成 T4-2（实现 Jotai 状态原子与派生原子），新增 `apps/web/src/state/atoms.ts` 与 `apps/web/src/state/atoms.test.ts`
- 2026-04-28：完成 T4-3（实现 TanStack Query hooks 及轮询策略），新增 `apps/web/src/hooks/use-rag-hooks.ts` 与 `apps/web/src/hooks/use-rag-hooks.test.tsx`
- 2026-04-28：完成 T4-4（实现 `AppLayout` 左右分栏并在 `App.tsx` 接入），新增 `apps/web/src/components/layout/AppLayout.tsx` 与 `apps/web/src/components/layout/AppLayout.test.tsx`
- 2026-04-28：完成 T4-5（实现 `RepoInput` + `RepoStatus` 组件并接入 `App.tsx`），新增 `apps/web/src/components/repo/RepoInput.tsx`、`apps/web/src/components/repo/RepoStatus.tsx` 与 `repo-components.test.tsx`
- 2026-04-28：完成 T4-6（实现 `ChatInput` + `ChatMessage` + `ChatPanel` 并接入 `App.tsx`），新增 `apps/web/src/components/chat/` 下组件与测试
- 2026-04-28：完成 T4-7（接入 Shiki 并实现 `CodeReference` 组件，支持折叠、语言标签、行数与复制），更新 `ChatMessage` 引用渲染
- 2026-04-28：完成 T4-8（接入 `react-markdown` + `remark-gfm` 渲染助手消息 Markdown），更新 `ChatMessage` 文本渲染逻辑与测试
- 2026-04-28：完成 T4-9（`@repo/api-client` 抽取并复用单一 `apiClient` 实例），新增 `packages/api-client/src/api-client.ts` 与 `api-client-singleton.test.ts`
- 2026-04-28：完成 T4-10（`App.tsx` 精简为组合入口，旧内联逻辑迁移到 `AppShell`），新增 `apps/web/src/components/app/AppShell.tsx` 与组合测试
- 2026-04-28：Phase 4 回顾修复（主流程接入 Jotai + TanStack Query 轮询、用户消息改为纯文本渲染、`apiClient` baseURL 支持环境变量），对应提交 `3f76192`
- 2026-04-29：完成 T5-1（新增 API P0 端点测试：导入成功/失败、索引状态成功/失败、问答成功/失败），新增 `apps/server/src/routes/api-p0.route.test.ts`，并将 `apps/server/src/index.ts` 重构为可测试的 `createApp`
- 2026-04-29：完成 T5-2（补齐 Service 集成测试中的状态机与空检索分支），更新 `apps/server/src/services/index.service.test.ts`、`apps/server/src/services/ask.service.test.ts`，并在 `IndexService` 增加重复构建防护
- 2026-04-29：完成 T5-3（新增错误协议一致性与错误码覆盖测试），新增 `apps/server/src/routes/protocol-consistency.test.ts`，并修复 `/api/index/build` 在已构建状态下应返回 `2002`
- 2026-04-29：完成 T5-4（补强前端组件测试覆盖 RepoInput/ChatMessage/CodeReference），更新 `apps/web/src/components/chat/code-reference.test.tsx` 并增强 `CodeReference` 展开按钮可访问性属性
- 2026-04-29：完成 T5-5（补强前端 Hook 测试覆盖 `useIndexStatus` 空白 repoId 场景），更新 `apps/web/src/hooks/use-rag-hooks.test.tsx` 并修复 `use-rag-hooks.ts` 对 repoId 的归一化处理
- 2026-04-29：完成 T5-6（结构化 PRD 验收题集为可执行 JSON，覆盖 22 题与三类问题），新增 `docs/acceptance-question-set.json` 与 `apps/server/src/scripts/acceptance-question-set.test.ts`
- 2026-04-29：完成 T5-7 基础能力（新增可执行评估脚本 `apps/server/src/scripts/acceptance-eval.ts` 与测试），并在严格 live-rag 模式下验证到网络阻塞（模型下载 `ConnectionRefused`）；已将报告修正为“未完成真实验收”，待网络恢复后重跑
- 2026-04-29：重新执行 T5-7 严格 live-rag 验收题集；embedding/索引阶段已可完成，但在题集提问阶段 LLM 请求被 sandbox 网络策略拦截（403），未产出一致率（N/A）；待网络恢复后重跑
- 2026-04-29：在可用网络环境重新执行 T5-7 严格 live-rag 验收题集：22 题命中 13 题，一致率 59.09%（未达 80% 门槛）；失败集中在 module 与调用链问题（Q08/Q09/Q10/Q12/Q13/Q15/Q16/Q20/Q22）
