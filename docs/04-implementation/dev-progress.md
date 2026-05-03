# Codebase RAG Explorer Progress Log

## 记录规范
- 每次会话追加一条记录，不覆盖历史。
- 每条记录至少包含：完成内容、验证结果、问题风险、下一步。
- 只记录“已验证事实”，不要写模糊结论。
- 早期会话条目中出现的 `docs/*.md` 路径可能与当前目录分层不一致；**以 [docs/README.md](../README.md) 与仓库实况为准**。

## 会话模板
```md
### Session YYYY-MM-DD HH:mm
- 完成内容：
  - 
- 验证结果：
  - 命令：
  - 结果：
- 问题/风险：
  - 
- 下一步（仅 1 个里程碑）：
  - 
```

---

### Session 2026-04-26 12:51
- 完成内容：
  - 建立 `docs/dev-roadmap.md`，固化阶段与里程碑清单。
  - 建立 `docs/dev-progress.md`，定义会话交接记录模板。
  - 建立 `docs/acceptance-gates.md`，定义阶段退出门禁与验证口径。
- 验证结果：
  - 命令：`ls -la docs`
  - 结果：目录存在且文档已创建。
- 问题/风险：
  - 当前仅完成护栏文档，尚未开始代码骨架搭建。
- 下一步（仅 1 个里程碑）：
  - 推进 `M0-1`：初始化 monorepo 目录结构。

### Session 2026-04-26 12:56
- 完成内容：
  - 创建 monorepo 骨架目录：`apps/server`、`apps/web`、`packages/types`、`packages/api-client`、`packages/constants`。
  - 新增根配置：`package.json`（workspace + scripts）、`tsconfig.base.json`、`.env.example`。
  - 落地共享契约：`@repo/types`（`ApiResponse`、请求/响应类型、`ErrorCode`、模型类型）。
  - 落地基础共享包：`@repo/constants` 与 `@repo/api-client`。
  - 新增最小可运行骨架：`apps/server` 健康检查入口、`apps/web` Vite React 入口、SQLite schema 初版。
- 验证结果：
  - 命令：`ls -la apps apps/server apps/web packages packages/types packages/api-client packages/constants`
  - 结果：目录与关键骨架文件均存在。
  - 命令：`ReadLints`（针对新增/修改路径）
  - 结果：未发现 linter 错误。
- 问题/风险：
  - 目前仅为 Phase 0 scaffold，尚未接入真实 Repo/Index/Ask 业务逻辑。
- 下一步（仅 1 个里程碑）：
  - 推进 `M1-1`：实现 `RepoService` 本地路径导入与过滤规则。

### Session 2026-04-26 13:02
- 完成内容：
  - 实现 `RepoService` 本地导入能力，支持源码扩展名筛选、忽略目录和忽略文件模式过滤。
  - 新增 `/api/repo/import` 路由，接收 `{ path, type }`，返回统一 `ApiResponse`。
  - 增加统一错误模型 `AppError` 与全局错误封装，落地 `1001/1002` 场景。
  - 新增轻量内存仓库存储，满足当前阶段导入去重与状态记录需求。
- 验证结果：
  - 命令：`bun run --filter @repo/server typecheck`
  - 结果：通过。
- 问题/风险：
  - 当前 Repo 元信息仍为内存态，后续 `M1-4` 需切换到 SQLite 持久化。
  - `type=git` 在本里程碑未实现（按计划在 `M1-2` 补齐）。
- 下一步（仅 1 个里程碑）：
  - 推进 `M1-2`：实现 Git 导入约束（协议、超时、上限）。

### Session 2026-04-26 13:07
- 完成内容：
  - 为 `RepoService` 增加 Git 导入流程，支持 `https://` 与 `git@` 协议校验。
  - 增加 clone 超时控制（默认 120s）与仓库体积上限（默认 200MB）。
  - 增加临时目录 clone 与自动清理策略，避免残留导入目录。
  - 在 `@repo/constants` 增加 `GIT_CLONE_TIMEOUT_MS` 与 `REPO_MAX_SIZE_MB`。
- 验证结果：
  - 命令：`bun run --filter @repo/server typecheck`
  - 结果：通过。
- 问题/风险：
  - Git 导入目前只返回导入结果，尚未持久化文件内容到数据库（将在后续里程碑完成）。
- 下一步（仅 1 个里程碑）：
  - 推进 `M1-3`：实现 `SplitterService` AST 语义切分。

### Session 2026-04-26 13:15
- 完成内容：
  - 新增 `SplitterService`，按函数/类声明进行语义切分（TS/JS/PY）并保留 `chunk_type`、`chunk_name`、行号范围。
  - 新增 chunk 类型定义 `ChunkData`，为后续索引与检索链路提供统一数据结构。
  - 为复杂/非语义文件保留 generic 片段切分入口，保证切分流程不中断。
- 验证结果：
  - 命令：`bun run --filter @repo/server typecheck`
  - 结果：通过。
- 问题/风险：
  - 当前语义切分为轻量 AST-like 策略，后续可替换为 Tree-sitter 精确解析。
- 下一步（仅 1 个里程碑）：
  - 推进 `M1-4`：完成超长 chunk 兜底切分与 chunk 持久化。

### Session 2026-04-26 13:18
- 完成内容：
  - 新增 `IndexService` 与 `/api/index/build`，按仓库文件执行切分并生成 chunk 集合。
  - 将导入文件缓存到仓库 store（按 `repo_id`），打通“导入 -> 切分索引”主链路。
  - 实现 chunks 持久化到 `data/chunks/{repo_id}.json`，并同步仓库 `status/chunkCount`。
- 验证结果：
  - 命令：`bun run --filter @repo/server typecheck`
  - 结果：通过。
- 问题/风险：
  - 当前 chunks 采用 JSON 文件持久化；后续阶段会切换到 SQLite 向量与元数据存储。
- 下一步（仅 1 个里程碑）：
  - 推进 `M2-1`：实现 embedding 入库与向量化流程。

### Session 2026-04-26 13:23
- 完成内容：
  - 新增 `EmbedderService`，按 batch 处理 chunk 向量化并生成 embedding 记录。
  - 增加 embedding 输入格式规范（file_path/chunk_type/chunk_name/content）。
  - 在 `IndexService` 中接入 embedding 生成，并持久化到 `data/embeddings/{repo_id}.json`。
- 验证结果：
  - 命令：`bun run --filter @repo/server typecheck`
  - 结果：通过。
- 问题/风险：
  - 当前向量实现为本地可重复 hash embedding，后续可无缝替换为 OpenAI embedding API。
- 下一步（仅 1 个里程碑）：
  - 推进 `M2-2`：实现余弦 top-k 检索与 chunk 回查。

### Session 2026-04-26 13:27
- 完成内容：
  - 新增 `RetrievalService`，读取持久化 chunk/embedding 并计算余弦相似度排序。
  - 实现 chunk 回查映射，返回 `chunk_id/file_path/content/chunk_type/chunk_name/score`。
  - 新增 `/api/retrieval/search` 接口，支持问题检索与可选 `top_k`。
- 验证结果：
  - 命令：`bun run --filter @repo/server typecheck`
  - 结果：通过。
- 问题/风险：
  - 当前检索为全量线性扫描，后续可替换为近似向量索引以提升规模性能。
- 下一步（仅 1 个里程碑）：
  - 推进 `M2-3`：联通检索参数（top_k/chunk/context）并下沉默认配置。

### Session 2026-04-26 13:31
- 完成内容：
  - 新增 `runtimeConfig`，统一读取 `CHUNK_MAX_LENGTH/CHUNK_OVERLAP/DEFAULT_TOP_K/MAX_CONTEXT_TOKENS`。
  - `SplitterService` 切分阈值与重叠参数改为运行时配置驱动。
  - `RetrievalService` 默认 `top_k` 改为运行时配置驱动。
- 验证结果：
  - 命令：`bun run --filter @repo/server typecheck`
  - 结果：通过。
- 问题/风险：
  - `MAX_CONTEXT_TOKENS` 已接入配置层，待 `AskService` 阶段用于上下文裁剪。
- 下一步（仅 1 个里程碑）：
  - 推进 `M3-1`：实现 `/api/ask` 问答主流程编排。

### Session 2026-04-26 13:36
- 完成内容：
  - 新增 `AskService`，打通 `repo status 校验 -> retrieval -> context 构建 -> answer 生成` 主流程。
  - 新增 `/api/ask` 路由，接收 `repo_id/question/top_k` 并返回 `AskData`。
  - 接入 `MAX_CONTEXT_TOKENS` 配置用于上下文长度控制（近似 token 裁剪）。
- 验证结果：
  - 命令：`bun run --filter @repo/server typecheck`
  - 结果：通过。
- 问题/风险：
  - 目前回答生成为本地模板逻辑，后续可替换为 Claude API 调用。
- 下一步（仅 1 个里程碑）：
  - 推进 `M3-2`：补齐 `2001/3001` 的业务分支响应约束。

### Session 2026-04-26 13:40
- 完成内容：
  - 在全局错误处理里补齐业务分支：`NO_RELEVANT_CODE(3001)` 返回默认回答与空引用列表。
  - `INDEX_NOT_BUILT(2001)` 保持统一失败结构 `data=null`，满足接口约束。
- 验证结果：
  - 命令：`bun run --filter @repo/server typecheck`
  - 结果：通过。
- 问题/风险：
  - 业务分支覆盖已补齐，后续需增加 API 测试用例防回归。
- 下一步（仅 1 个里程碑）：
  - 推进 `M3-3`：强化引用白名单路径，确保引用仅来自检索结果。

### Session 2026-04-26 13:43
- 完成内容：
  - 在 `AskService` 引入 `buildReferencesFromWhitelist`，显式约束引用来源为检索结果白名单。
  - 移除任何潜在“从回答文本抽取引用”的路径，确保引用可追溯性一致。
- 验证结果：
  - 命令：`bun run --filter @repo/server typecheck`
  - 结果：通过。
- 问题/风险：
  - 当前 Phase 3 已完成，后续需在前端落地引用展示与交互。
- 下一步（仅 1 个里程碑）：
  - 推进 `M4-1`：实现仓库导入与索引状态前端面板。

### Session 2026-04-26 13:52
- 完成内容：
  - 前端落地仓库管理面板：支持本地路径/Git URL 导入、索引构建触发、状态/文件数/chunk 数展示。
  - `@repo/api-client` 增加 `repoApi` 与 `indexApi`，封装导入、索引构建、状态查询调用。
  - 后端补充 `/api/index/status`，前端可读取仓库当前索引状态。
- 验证结果：
  - 命令：`bun run typecheck`
  - 结果：packages + apps 全量通过。
- 问题/风险：
  - 仓库面板已可用，问答主面板交互与结果呈现将在后续里程碑完成。
- 下一步（仅 1 个里程碑）：
  - 推进 `M4-2`：完成问答提交流程与结果渲染。

### Session 2026-04-26 13:58
- 完成内容：
  - 前端接入 `askApi`，支持问题提交并调用 `/api/ask`。
  - 问答面板实现回答结果渲染，形成“提问 -> 返回 answer”闭环。
  - `@repo/api-client` 增加 `ask` 模块并统一导出。
- 验证结果：
  - 命令：`bun run typecheck`
  - 结果：packages + apps 全量通过。
- 问题/风险：
  - 引用代码片段展示与错误可视化仍需增强（下一里程碑完成）。
- 下一步（仅 1 个里程碑）：
  - 推进 `M4-3`：补齐引用展示与错误提示体验。

### Session 2026-04-26 14:02
- 完成内容：
  - 问答面板增加“代码引用”区域，按卡片展示 `file_path/score/snippet`。
  - 错误提示卡片样式强化，统一在页面顶部展示可读错误信息。
  - 无引用场景展示降级文案，避免空白区域。
- 验证结果：
  - 命令：`bun run typecheck`
  - 结果：packages + apps 全量通过。
- 问题/风险：
  - Phase 4 已完成，下一步进入质量门禁与验收收口。
- 下一步（仅 1 个里程碑）：
  - 推进 `M5-1`：建立后端最小测试矩阵并落地基础用例。

### Session 2026-04-26 14:06
- 完成内容：
  - 后端新增最小测试矩阵：`SplitterService` 语义切分测试、`RetrievalService` top-k 检索测试。
  - `@repo/server` 增加 `test` 脚本，统一通过 `bun test` 执行。
- 验证结果：
  - 命令：`bun run --filter @repo/server test`
  - 结果：2/2 通过，无失败。
- 问题/风险：
  - 当前测试仍偏服务层，后续可补充 API 端到端测试覆盖错误码分支。
- 下一步（仅 1 个里程碑）：
  - 推进 `M5-2`：补齐前端最小测试矩阵。

### Session 2026-04-26 14:14
- 完成内容：
  - 前端接入 Vitest + Testing Library + jsdom 测试栈。
  - 新增 `App` 基础渲染测试，建立前端最小测试矩阵入口。
  - `@repo/web` 增加 `test` 脚本，支持 `vitest run` 执行。
- 验证结果：
  - 命令：`bun run --filter @repo/web test`
  - 结果：1/1 通过，无失败。
- 问题/风险：
  - 当前前端测试仍偏基础渲染，后续可补充交互流测试（导入/提问/错误展示）。
- 下一步（仅 1 个里程碑）：
  - 推进 `M5-3`：输出 PRD 验收题集与结果报告。

### Session 2026-04-26 14:18
- 完成内容：
  - 新增 `docs/acceptance-question-set.md`，产出 20 题 PRD 验收题集（函数/位置/调用/错误/参数五类）。
  - 新增 `docs/acceptance-report.md`，沉淀当前版本验收结论、验证记录与已知差异。
  - Phase 5 全部里程碑完成，开发路线闭环收口。
- 验证结果：
  - 命令：`bun run typecheck`、`bun run --filter @repo/server test`、`bun run --filter @repo/web test`
  - 结果：全部通过。
- 问题/风险：
  - `.gitignore` 仍有未提交修改，待你确认是否纳入版本控制。
- 下一步（仅 1 个里程碑）：
  - 如需，我可以继续执行：整理发布说明 / 推送远端 / 创建 PR。
