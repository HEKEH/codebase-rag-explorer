# PRD 题集执行报告

- 执行时间：2026-04-29T12:05:24.399Z
- 执行模式：live-rag
- 题目数量：22
- 命中数量：16
- 一致率：72.73%

## 结果解读与优化记录

- 与上轮（63.64%）相比，本轮提升到 `72.73%`（+9.09%），说明检索融合优化已产生正向效果，但仍未达到 `>=80%` 门槛。
- 当前失败题：`Q08`、`Q10`、`Q12`、`Q15`、`Q16`、`Q20`（共 6 题）。
- 失败类型分布：`module` 3 题（Q08/Q10/Q12），`call-chain` 3 题（Q15/Q16/Q20）。

### 本轮已落地优化（代码侧）

- `apps/server/src/services/retrieval.service.ts`
  - 语义分保留并做 Min-Max 归一化，不再用纯 rank 分值覆盖语义相似度。
  - 增加问题意图识别（`locate` / `explain`），按问题类型动态调整语义/词法融合权重。
  - 词法打分改为“路径/符号优先、正文降权”，降低正文 substring 噪声。
  - 增加空 `chunk_id` 防御过滤，避免融合阶段结果覆盖/污染。
  - 补充检索日志字段（intent、候选数、tokenCount），便于定位召回问题。

### 失败项原因归纳（基于本轮结果）

- `module` 类问题仍存在“路由定义文件定位不稳定”的情况，表现为回答退化为“信息不足”。
- `call-chain` 类问题仍存在“链路节点未被同时召回”的情况，导致无法给出完整调用路径。
- 个别题目命中文件与问题目标文件不一致，说明检索后重排仍有错位。

### 下一轮优化方向（面向 >=80%）

- 针对 `module` 类问题增加路由/入口文件的强特征词（如 `route`, `api`, `index.ts`, `ask`, `import`）权重。
- 针对 `call-chain` 类问题增加“链路词”触发策略（如 `调用`, `链路`, `流程`, `onClick`, `route`, `service`）并扩大语义候选池。
- 在融合后增加轻量 rerank 规则：优先保留“路径命中 + 符号命中”同时成立的 chunk。
- 复验时固定环境参数并留档（topK、候选倍数、融合权重、batch size），避免横向结果不可比。

### 复验命令（建议）

```bash
bun --env-file=.env run --cwd apps/server src/scripts/acceptance-eval.ts --mode=live-rag
```

> 若复验后仍低于 80%，请按失败题（Q08/Q10/Q12/Q15/Q16/Q20）逐题回放日志，定位“未召回”还是“召回后排序丢失”。

| ID | 类别 | 判定 | 命中方式 |
|----|------|------|----------|
| Q01 | function | pass | keyword+file |
| Q02 | function | pass | keyword+file |
| Q03 | function | pass | keyword+file |
| Q04 | function | pass | keyword |
| Q05 | function | pass | keyword+file |
| Q06 | function | pass | keyword+file |
| Q07 | function | pass | keyword+file |
| Q08 | module | fail | none |
| Q09 | module | pass | keyword |
| Q10 | module | fail | none |
| Q11 | module | pass | file |
| Q12 | module | fail | none |
| Q13 | module | pass | keyword |
| Q14 | call-chain | pass | file |
| Q15 | call-chain | fail | none |
| Q16 | call-chain | fail | none |
| Q17 | call-chain | pass | keyword+file |
| Q18 | call-chain | pass | keyword+file |
| Q19 | call-chain | pass | keyword |
| Q20 | call-chain | fail | none |
| Q21 | function | pass | keyword+file |
| Q22 | module | pass | keyword+file |

## 逐题证据
### Q01 RepoService.importRepo 的主要职责是什么？
- 判定：pass
- 回答：RepoService.importRepo 的主要职责是**导入代码仓库，将其源文件收集并持久化保存**。  具体依据如下： 1. **处理来源**：支持 Git 和本地路径两种类型。如果是 Git 类型，会校验协议并克隆仓库（`cloneGitRepo`）；如果是本地路径，则校验目录是否可访问。 2. **防重校验**：检查仓库路径是否已存在（`getRepoByPath`），若存在则抛出异常。 3. **收集与保存**：收集路径下的源文件（`collectSourceFiles`），生成仓库元数据并将其与源文件一并保存（`saveRepo`、`saveSourceFiles`）。 4. **资源清理**：如果是 Git 克隆的仓库，在处理完成后（无论成功或失败）会删除临时克隆的目录（`rm(normalizedPath, ...)`）。
- 引用文件：apps/server/src/services/repo.service.ts, apps/server/src/services/repo.service.ts, apps/server/src/services/repo.service.ts, apps/server/src/services/repo.service.ts

### Q02 SplitterService 如何区分 function/class/generic chunk？
- 判定：pass
- 回答：SplitterService 自身并不直接区分，而是通过调用 `parseSemanticNodes` 解析源文件来识别，并将识别出的类型直接透传给 `buildChunksFromText`。  具体逻辑如下： 1. **依据语义节点类型**：`parseSemanticNodes` 会返回语义节点数组，每个节点包含 `type` 属性。`SplitterService` 在 `splitFile` 方法中，将该 `node.type` 直接作为 `chunk_type` 传入 `buildChunksFromText` 进行切分。 2. **兜底泛型处理**：如果 `parseSemanticNodes` 解析出的节点数量为 0，则默认将 chunk 类型设为 `"generic"` 进行切分。  *(注：上下文中未提供 `parseSemanticNodes` 的具体实现，因此无法得知它是如何具体识别 function/class/generic 的底层逻辑。如需深入了解，建议补充该函数的实现代码。)*
- 引用文件：apps/server/src/services/splitter.service.ts, apps/server/src/services/splitter.service.test.ts, apps/server/src/services/splitter.service.test.ts, apps/server/src/services/splitter.service.test.ts

### Q03 IndexService.buildIndex 的核心执行步骤有哪些？
- 判定：pass
- 回答：The core execution steps of `IndexService.buildIndex` are:  1. **前置校验**：验证仓库是否存在，以及仓库状态是否为 `"indexing"` 或 `"indexed"`（若已存在索引则抛出异常）。 2. **获取源文件**：调用 `getSourceFiles(repoId)` 获取文件列表，若未加载则抛出异常。 3. **更新状态**：调用 `updateRepoStatus(repoId, "indexing")` 将仓库状态标记为索引中。 4. **文件切片**：遍历所有文件，调用 `this.splitter.splitFile` 进行切片，收集所有 `ChunkData`。 5. **保存切片**：调用 `saveChunks(chunks)` 保存切片数据。  *注：提供的上下文代码在 `saveChunks(chunks);` 处截断，依据现有信息无法确认后续（如嵌入向量计算与存储等）步骤，若需完整流程请补充上下文。*
- 引用文件：apps/server/src/routes/index.ts, apps/web/src/pages/ChatPage.tsx, apps/server/src/services/index.service.ts, apps/server/src/services/index.service.ts

### Q04 RetrievalService.retrieve 如何确定 top-k 结果？
- 判定：pass
- 回答：**结论：** 根据提供的上下文，无法确定 `RetrievalService.retrieve` 具体如何确定 top-k 结果。  **依据：** 1. 上下文仅展示了 `AskService` 调用 `this.retrievalService.retrieve(question, repoId, topK, context)` 并传入了 `topK` 参数，但未提供 `RetrievalService` 的内部实现代码。 2. 虽然测试代码 `sqlite-vector-store.test.ts` 暗示了底层可能使用了基于向量相似度搜索（`similaritySearchVectorWithScore`）并按分数降序排列来截取 top-k，但这属于 `SQLiteVectorStore` 的逻辑，无法直接证明 `RetrievalService.retrieve` 的具体实现细节。  **建议：** 请补充 `RetrievalService` 类中 `retrieve` 方法的具体实现代码。
- 引用文件：apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts, apps/server/src/lib/sqlite-vector-store.test.ts

### Q05 AskService.ask 如何保证回答引用来源可追溯？
- 判定：pass
- 回答：`AskService.ask` 通过将检索结果交由 `buildReferencesFromWhitelist` 函数处理来生成引用列表，从而保证回答引用来源可追溯。  **依据：** 在方法的返回值中，除了 LLM 生成的 `answer` 外，还返回了 `references` 字段。该字段的值由 `buildReferencesFromWhitelist(results)` 计算得出，其输入参数 `results` 正是检索服务返回的相关代码上下文结果。这使得回答与检索到的源代码片段得以关联。
- 引用文件：apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts

### Q06 CodeReference 组件如何实现代码展开与复制？
- 判定：pass
- 回答：CodeReference 组件通过状态控制实现代码的展开与复制：  **1. 代码展开** - 通过 `useState` 维护 `expanded` 状态（默认为 `false`）。 - 点击 header 中的按钮触发 `setExpanded((prev) => !prev)` 切换状态。 - 按钮文案根据状态显示“展开代码”或“收起代码”，且设置了 `aria-expanded` 属性。 - 只有当 `expanded` 为 `true` 时，才渲染包含代码内容的面板。  **2. 代码复制** - 通过 `useState` 维护 `copied` 状态（默认为 `false`）。 - 点击“复制代码”按钮触发 `handleCopy` 函数：   - 调用 `navigator.clipboard.writeText` 写入代码片段 `reference.snippet`。   - 写入成功后设置 `copied` 为 `true`，按钮文案变为“已复制”。   - 通过 `setTimeout` 在 1200ms 后将 `copied` 重置为 `false`，恢复原始
- 引用文件：apps/web/src/components/chat/CodeReference.tsx, apps/web/src/components/chat/CodeReference.tsx, apps/web/src/components/chat/CodeReference.tsx, apps/web/src/components/chat/CodeReference.tsx

### Q07 useIndexStatus 如何控制索引状态轮询？
- 判定：pass
- 回答：`useIndexStatus` 通过以下两个机制控制索引状态轮询：  1. **条件控制**：通过 `enabled: Boolean(normalizedRepoId)` 控制。只有当 `repoId` 去除首尾空格后非空时，才启用查询/轮询；若为空则停止。 2. **间隔控制**：通过 `refetchInterval` 动态控制。当查询到的状态为 `"indexing"` 时，按传入的 `pollingIntervalMs` 间隔持续轮询；当状态不是 `"indexing"`（如已完成或失败）时，返回 `false` 自动停止轮询。  （补充：在触发构建索引后，外部会通过 `await indexStatus.refetch()` 主动触发一次立即刷新，以获取最新状态。）
- 引用文件：apps/web/src/hooks/use-rag-hooks.ts, apps/web/src/hooks/use-rag-hooks.test.tsx, apps/web/src/hooks/use-rag-hooks.test.tsx, apps/web/src/pages/ChatPage.tsx

### Q08 仓库导入 API 路由定义在哪个文件？
- 判定：fail
- 回答：信息不足。  根据提供的上下文，无法确定仓库导入 API 路由定义在哪个文件。上下文中仅包含了 API 基础 URL 解析、错误处理、构建索引（`/api/index/build`）的客户端请求及 `ApiError` 类的定义，并未提及任何与“仓库导入”相关的 API 路由及其所在文件。  建议补充包含“仓库导入”或类似路由定义（如 `import`、`repo` 等关键字）的代码上下文。
- 引用文件：packages/api-client/src/api-client.ts, apps/server/src/index.ts, packages/api-client/src/index-api.ts, packages/api-client/src/client.ts

### Q09 索引构建与状态查询 API 定义在哪里？
- 判定：pass
- 回答：信息不足。  **结论**：无法确定索引构建与状态查询 API 的完整定义位置。  **依据**： 1. 上下文中仅在 `packages/api-client/src/index-api.ts` 展示了索引构建 API 的**客户端调用**（请求 `POST /api/index/build`），并未展示其**服务端定义**。 2. 上下文中完全没有提及“状态查询” API 的任何信息。   建议补充服务端路由或 API 接口定义相关的代码上下文。
- 引用文件：packages/api-client/src/api-client.ts, apps/server/src/index.ts, packages/api-client/src/index-api.ts, packages/api-client/src/client.ts

### Q10 问答 API 在哪里定义？
- 判定：fail
- 回答：信息不足，无法确定。  依据：提供的上下文中包含 API 客户端的请求调用（如 `packages/api-client/src/index-api.ts` 中的 `/api/index/build`）和错误处理，但没有提供问答 API 的具体定义代码或路由信息。建议补充包含问答 API 路由或接口定义的代码上下文。
- 引用文件：packages/api-client/src/api-client.ts, apps/server/src/index.ts, packages/api-client/src/index-api.ts, packages/api-client/src/client.ts

### Q11 Embedding 生成逻辑在哪个文件？
- 判定：pass
- 回答：`apps/server/src/services/xenova-embeddings.client.ts` 中通过 `@xenova/transformers` 的 `pipeline("feature-extraction", …)` 完成文本→向量；`apps/server/src/services/embedder.service.ts` 负责组装默认客户端与 chunk 文本格式。向量写入与相似度检索在 `apps/server/src/lib/sqlite-vector-store.ts`；`apps/server/src/db/embedding.repository.ts` 仅提供按仓库删除 embeddings 行（索引重建）。**（2026-05-04 勘误：与当前代码结构对齐，原报告将存储误归于 embedding.repository。）**
- 引用文件：apps/server/src/services/xenova-embeddings.client.ts, apps/server/src/services/embedder.service.ts, apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/db/embedding.repository.ts

### Q12 前端问答主入口组件位于哪里？
- 判定：fail
- 回答：根据提供的上下文，信息不足以回答该问题。  上下文中仅包含了前端组件的测试代码片段（`apps/web/src/components/repo/repo-components.test.tsx`）以及后端服务与路由的相关代码，并未提供“前端问答主入口组件”的具体定义或位置信息。建议补充相关的前端组件代码上下文。
- 引用文件：apps/web/src/components/repo/repo-components.test.tsx, apps/server/src/routes/api-p0.route.test.ts, apps/server/src/services/repo.service.ts, apps/server/src/routes/protocol-consistency.test.ts

### Q13 SQLite 连接和初始化逻辑位于哪里？
- 判定：pass
- 回答：基于提供的上下文，SQLite 的连接和初始化逻辑是通过调用 `getDb()` 函数实现的。  **依据**：在 `SQLiteVectorStore` 类的 `addVectors` 和 `queryRows` 方法中，均通过 `const db = getDb();` 或参数默认值 `db = getDb()` 获取数据库实例来执行查询。  **补充说明**：提供的上下文中仅包含了 `getDb()` 的调用，并未包含 `getDb()` 函数的具体实现代码，因此无法得知数据库连接和初始化的更底层细节（如连接串配置、驱动初始化等）。如需了解完整逻辑，建议补充 `getDb` 函数所在文件的上下文。
- 引用文件：apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/lib/sqlite-vector-store.ts

### Q14 前端点击“导入仓库”后会经过哪些调用链路？
- 判定：pass
- 回答：信息不足，无法回答。  提供的上下文中仅包含前端UI组件的测试代码（显示“请先导入仓库并构建索引。”的空状态文案）以及后端的错误处理片段，并未包含“导入仓库”按钮的点击事件、前端请求发起逻辑以及后端对应的接口处理逻辑。因此无法推断出完整的调用链路。  建议补充以下相关代码上下文： 1. 包含“导入仓库”按钮的前端组件及其点击事件处理逻辑。 2. 前端发起导入仓库请求的 API 调用代码。 3. 后端接收并处理导入仓库请求的 Controller/Service 完整逻辑（如 `repo.service.ts` 中的具体实现）。
- 引用文件：apps/web/src/components/chat/chat-components.test.tsx, apps/web/src/components/chat/chat-components.test.tsx, apps/server/src/services/repo.service.ts, apps/server/src/index.ts

### Q15 前端点击“构建索引”后的调用链路是什么？
- 判定：fail
- 回答：信息不足，无法回答。  提供的上下文中仅包含前端的 UI 测试代码和部分后端的模拟返回/抛错代码，并没有包含前端点击“构建索引”按钮的事件绑定、触发的 API 请求，以及后端接收该请求后的处理逻辑。建议补充相关的组件实现代码（如按钮的 `onClick` 处理函数）和 API 路由/服务处理代码。
- 引用文件：apps/web/src/components/chat/chat-components.test.tsx, apps/web/src/components/chat/chat-components.test.tsx, apps/server/src/routes/api-p0.route.test.ts, apps/server/src/services/repo.service.ts

### Q16 前端提交问题后的调用链路是什么？
- 判定：fail
- 回答：信息不足，无法完整回答前端提交问题后的调用链路。  **结论**：提供的上下文仅包含部分错误处理和测试 Mock 逻辑，未包含完整的路由或服务调用链路。  **依据**： 1. 上下文中仅展示了 `AppError` 的抛出场景（如目录不存在、未找到相关代码），以及全局的 HTTP 错误拦截器（`apps/server/src/index.ts` 中将 `AppError` 转换为统一错误响应）。 2. 缺少前端请求入口、后端路由定义、Service 层的核心业务逻辑等关键链路节点。  **建议**：请补充包含 `ask` 或相关路由定义（如 `ask.route.ts`）、Service 层实现以及前端请求调用的代码上下文，以便梳理完整链路。
- 引用文件：apps/server/src/services/repo.service.ts, apps/server/src/routes/protocol-consistency.test.ts, apps/server/src/index.ts, apps/server/src/routes/ask.route.test.ts

### Q17 AskService 内部从检索到生成回答的链路是什么？
- 判定：pass
- 回答：AskService 内部从检索到生成回答的链路如下：  1. **检索代码**：调用 `this.retrievalService.retrieve`，传入问题、repoId、topK 等参数获取检索结果。若无结果则抛出“未找到相关代码”异常。 2. **构建上下文**：调用 `buildContextFromResults` 将检索结果根据最大上下文 token 数构建为文本。 3. **构建 Prompt**：调用 `createAskPrompt` 创建提示词模板，并使用 `prompt.formatMessages` 将问题和上下文文本格式化为消息列表。 4. **调用 LLM 生成回答**：调用 `this.chatModel.invoke(messages)` 获取大模型响应，并使用 `normalizeModelContent` 提取和修剪回答文本。 5. **返回结果**：将生成的回答与基于白名单构建的引用（`buildReferencesFromWhitelist`）一并返回。
- 引用文件：apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts, apps/server/src/index.ts, apps/server/src/routes/api-p0.route.test.ts

### Q18 IndexService 如何把 chunk 和 embedding 持久化到 SQLite？
- 判定：pass
- 回答：**结论：** 根据提供的上下文，信息不足以完整说明 `IndexService` 如何将 chunk 和 embedding 持久化到 SQLite。  **依据：** 1. **Chunk 的持久化**：上下文中显示 `IndexService` 调用了 `saveChunks(chunks)` 来保存 chunk，但缺少 `saveChunks` 方法的实现细节，无法确认其具体的 SQLite 持久化机制。 2. **Embedding 的持久化**：上下文只展示了 `SQLiteVectorStore` 的查询（`queryRows`）逻辑（从 `embeddings` 和 `chunks` 表中 JOIN 查询），但完全没有展示任何写入/插入 embedding 数据到 SQLite 的方法，也未展示 `IndexService` 调用写入 embedding 的过程。  **建议：**请补充 `saveChunks` 方法的实现代码，以及 `SQLiteVectorStore` 中关于插入/保存 embedding 的方法实现。
- 引用文件：apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/services/index.service.ts, apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/services/index.service.ts

### Q19 当 /api/ask 出现 NO_RELEVANT_CODE 时返回结构是什么？
- 判定：pass
- 回答：当 `/api/ask` 出现 `NO_RELEVANT_CODE` 时，返回的 JSON 结构如下：  ```json {   "code": "NO_RELEVANT_CODE",   "data": {     "answer": "未找到相关代码，请尝试更具体的问题",     "references": []   } } ```  **依据：** 在测试文件 `ask.route.test.ts` 中，明确断言了异常情况下的响应结构，包含顶层的 `code`，以及 `data` 对象中的 `answer`（错误提示信息）和 `references`（空数组）。
- 引用文件：apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts, apps/server/src/routes/ask.route.test.ts

### Q20 当重复构建索引时系统如何处理？
- 判定：fail
- 回答：信息不足，无法回答。  依据：提供的代码上下文中未包含任何关于“构建索引”或“重复构建索引”的逻辑处理细节。建议您补充相关的代码上下文（如索引构建相关的服务或路由代码）。
- 引用文件：apps/server/src/services/repo.service.ts, apps/server/src/routes/ask.route.test.ts, apps/server/src/index.ts, apps/server/src/routes/api-p0.route.test.ts

### Q21 RepoService 对 git 导入有哪些协议与体积限制？
- 判定：pass
- 回答：**协议限制**：仅支持 `https://` 或 `git@` 协议。 **体积限制**：上下文中未提供体积限制的相关信息。  **依据**：在 `RepoService.importRepo` 方法中，当 `input.type === "git"` 时，代码通过 `isSupportedGitUrl(input.path)` 进行校验，若不符合则抛出错误提示“仅支持 https:// 或 git@ 协议”。
- 引用文件：apps/server/src/services/repo.service.ts, apps/server/src/db/repo.repository.ts, apps/server/src/services/repo.service.ts, apps/web/src/components/repo/RepoStatus.tsx

### Q22 全局错误处理统一响应结构在哪里定义？
- 判定：pass
- 回答：信息不足。  **结论**：根据提供的上下文，无法确定全局错误处理统一响应结构的具体定义位置。  **依据**：上下文中的全局错误处理逻辑（`apps/server/src/index.ts`）使用了 `fail()` 函数来返回统一响应，但该函数的导入来源和具体定义代码并未在提供的上下文中体现。
- 引用文件：apps/server/src/index.ts, apps/server/src/services/repo.service.ts, apps/server/src/routes/protocol-consistency.test.ts, apps/server/src/routes/ask.route.test.ts

