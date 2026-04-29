# PRD 题集执行报告

- 执行时间：2026-04-29T11:39:42.272Z
- 执行模式：live-rag
- 题目数量：22
- 命中数量：13
- 一致率：59.09%

| ID | 类别 | 判定 | 命中方式 |
|----|------|------|----------|
| Q01 | function | pass | keyword+file |
| Q02 | function | pass | keyword+file |
| Q03 | function | pass | keyword+file |
| Q04 | function | pass | keyword+file |
| Q05 | function | pass | keyword+file |
| Q06 | function | pass | keyword+file |
| Q07 | function | pass | keyword+file |
| Q08 | module | fail | none |
| Q09 | module | fail | none |
| Q10 | module | fail | none |
| Q11 | module | pass | file |
| Q12 | module | fail | none |
| Q13 | module | fail | none |
| Q14 | call-chain | pass | file |
| Q15 | call-chain | fail | none |
| Q16 | call-chain | fail | none |
| Q17 | call-chain | pass | keyword+file |
| Q18 | call-chain | pass | keyword+file |
| Q19 | call-chain | pass | keyword |
| Q20 | call-chain | fail | none |
| Q21 | function | pass | keyword+file |
| Q22 | module | fail | none |

## 逐题证据
### Q01 RepoService.importRepo 的主要职责是什么？
- 判定：pass
- 回答：RepoService.importRepo 的主要职责是**导入代码仓库并收集其源文件信息**。  具体依据如下： 1. **获取并校验仓库路径**：对于 `git` 类型，校验协议并克隆仓库；对于本地路径，校验目录是否可访问。 2. **防重复校验**：检查该路径的仓库是否已存在，若存在则抛出异常。 3. **收集与存储**：收集仓库下的源文件，生成仓库记录（含 id、状态、文件数等），并调用 `saveRepo` 和 `saveSourceFiles` 保存。 4. **清理与日志**：Git 仓库在导入结束（无论成功或失败）后清理克隆的临时目录，并记录开始、完成或失败的日志。
- 引用文件：apps/server/src/services/repo.service.ts, apps/server/src/services/repo.service.ts, apps/server/src/services/repo.service.ts, apps/server/src/services/repo.service.ts

### Q02 SplitterService 如何区分 function/class/generic chunk？
- 判定：pass
- 回答：SplitterService 通过**语义解析节点（semantic node）的 `type` 属性**来区分 function/class/generic chunk。  **依据：** 1. 在 `splitFile` 方法中，代码首先解析出语义节点 `const semanticNodes = parseSemanticNodes(file.path, file.content);`。 2. 遍历这些节点时，直接将 `node.type` 作为 `chunk_type` 传入 `buildChunksFromText` 方法（即 `node.type` 对应了 `ChunkType` 的 "function" | "class" | "generic"）。 3. 如果没有解析到任何语义节点（`semanticNodes.length === 0`），则默认将 chunk_type 置为 `"generic"`。
- 引用文件：apps/server/src/services/splitter.service.test.ts, apps/server/src/services/splitter.service.test.ts, apps/server/src/services/splitter.service.ts, apps/server/src/types/chunk.ts

### Q03 IndexService.buildIndex 的核心执行步骤有哪些？
- 判定：pass
- 回答：`IndexService.buildIndex` 的核心执行步骤如下：  1. **记录开始日志**：记录索引构建开始事件及对应的 `repoId`。 2. **校验仓库状态**：获取仓库信息，若仓库不存在，或状态为 "indexing"/"indexed"，则抛出错误终止执行。 3. **获取源文件**：获取仓库的源文件列表，若未加载则抛出错误。 4. **更新状态**：将仓库状态更新为 "indexing"。 5. **切分文件**：遍历所有源文件，使用 `splitter.splitFile` 进行切分，收集所有生成的代码块（chunks），并记录切分完成的日志。 6. **保存代码块**：调用 `saveChunks` 保存切分后的代码块数据。  *注：提供的代码上下文在 `saveChunks(chunks)` 处截断，后续是否还有嵌入（embedding）等步骤信息不足。*
- 引用文件：apps/server/src/services/index.service.ts, apps/server/src/routes/index.ts, apps/web/src/components/app/AppShell.tsx, apps/server/src/index.ts

### Q04 RetrievalService.retrieve 如何确定 top-k 结果？
- 判定：pass
- 回答：`RetrievalService.retrieve` 通过将问题向量化后，在向量存储中执行相似度搜索来确定 top-k 结果。  **依据：** 1. 获取 top-k 值：若调用时未显式传入 `topK` 参数，则默认使用 `runtimeConfig.defaultTopK`。 2. 向量搜索：调用 `this.vectorStore.similaritySearchVectorWithScore(queryVector, topK, { repo_id: repoId })`，基于问题的嵌入向量（`queryVector`）和指定的 `topK` 值，在向量库中进行带分数的相似度搜索，从而筛选出得分最高的 top-k 个结果。
- 引用文件：apps/server/src/services/ask.service.ts, apps/server/src/services/retrieval.service.ts, apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts

### Q05 AskService.ask 如何保证回答引用来源可追溯？
- 判定：pass
- 回答：**结论：** `AskService.ask` 通过将检索结果 `results` 交由 `buildReferencesFromWhitelist` 函数处理，生成并返回 `references` 字段，从而保证回答引用来源可追溯。  **依据：** 在 `ask` 方法的返回值中，包含了 `references: buildReferencesFromWhitelist(results)`。该函数直接基于检索到的代码结果构建引用白名单，确保返回给调用方的数据中带有明确的来源引用信息。
- 引用文件：apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts, apps/server/src/services/ask.service.ts

### Q06 CodeReference 组件如何实现代码展开与复制？
- 判定：pass
- 回答：**结论：** CodeReference 组件通过 `expanded` 状态控制代码区块的渲染来实现展开/收起，通过 `navigator.clipboard` API 配合 `copied` 状态来实现复制及反馈。  **依据与实现细节：**  1. **代码展开与收起：**    - 使用 `useState` 维护 `expanded` 状态（默认为 `false`）。    - 头部区域渲染一个按钮，点击时触发 `setExpanded((prev) => !prev)` 切换状态，按钮文字根据状态显示“展开代码”或“收起代码”，并通过 `aria-expanded` 和 `aria-controls` 关联控制面板。    - 代码面板（`id={codePanelId}`）使用条件渲染 `{expanded && (...)}`，仅在展开时显示。  2. **代码复制：**    - 使用 `useState` 维护 `copied` 状态（默认为 `false`）。    - 代码面板内渲染“复制代码”按钮，点击触发 `handleCopy` 函数。    - `ha
- 引用文件：apps/web/src/components/chat/CodeReference.tsx, apps/web/src/components/chat/CodeReference.tsx, apps/web/src/components/chat/CodeReference.tsx, apps/web/src/components/chat/ChatMessage.tsx

### Q07 useIndexStatus 如何控制索引状态轮询？
- 判定：pass
- 回答：`useIndexStatus` 通过 `useQuery` 的 `enabled` 和 `refetchInterval` 两个配置项来控制索引状态轮询：  1. **启动/停止轮询**：通过 `enabled: Boolean(normalizedRepoId)` 控制，只有当 `repoId` 有效（非空格）时，才启用查询和轮询；若 `repoId` 为空则停止。 2. **轮询间隔控制**：通过 `refetchInterval` 控制。当查询返回的状态为 `"indexing"` 时，按传入的 `pollingIntervalMs` 间隔持续轮询；当状态不为 `"indexing"` 时，返回 `false` 停止轮询。  **依据**：代码中 `enabled` 和 `refetchInterval` 的配置逻辑，以及测试用例对有效 `repoId`（`"repo-1"`）和无效 `repoId`（`"   "`）的验证。
- 引用文件：apps/web/src/hooks/use-rag-hooks.ts, apps/web/src/hooks/use-rag-hooks.test.tsx, apps/web/src/hooks/use-rag-hooks.test.tsx, apps/web/src/components/app/AppShell.tsx

### Q08 仓库导入 API 路由定义在哪个文件？
- 判定：fail
- 回答：信息不足。  提供的上下文中没有包含仓库导入 API 路由的定义文件。上下文仅包含了错误测试代码、全局错误处理、`/api/ask` 请求客户端代码以及通用 API 客户端类，未涉及任何与“仓库导入”相关的路由实现。建议补充包含路由定义（如 `import` 或 `repository` 相关）的代码上下文。
- 引用文件：apps/server/src/routes/protocol-consistency.test.ts, apps/server/src/index.ts, packages/api-client/src/ask.ts, packages/api-client/src/client.ts

### Q09 索引构建与状态查询 API 定义在哪里？
- 判定：fail
- 回答：信息不足。  提供的上下文中没有包含“索引构建与状态查询 API 定义”的具体位置（如路由文件或 API 接口定义代码）。上下文仅展示了 API 的错误处理测试用例，以及前端调用这些 API 的逻辑（`buildIndex.mutateAsync` 和 `indexStatus.refetch`），但未指明后端 API 的具体定义文件和路径。建议补充后端路由或 API 接口定义相关的代码上下文。
- 引用文件：apps/server/src/index.ts, apps/server/src/routes/api-p0.route.test.ts, apps/server/src/routes/protocol-consistency.test.ts, apps/web/src/components/app/AppShell.tsx

### Q10 问答 API 在哪里定义？
- 判定：fail
- 回答：信息不足。  依据：提供的上下文仅包含部分错误处理逻辑和测试代码片段，没有包含定义“问答 API”的路由或接口代码，因此无法确定其具体定义位置。建议补充更多包含路由定义的代码上下文。
- 引用文件：apps/server/src/routes/api-p0.route.test.ts, apps/server/src/index.ts, apps/server/src/routes/protocol-consistency.test.ts, apps/server/src/routes/protocol-consistency.test.ts

### Q11 Embedding 生成逻辑在哪个文件？
- 判定：pass
- 回答：Embedding 生成逻辑在文件 `apps/server/src/services/embedder.service.ts` 中。  **依据：**  该文件中的 `constructor` 内定义了 `embedDocuments` 方法，该方法通过调用模型管道（pipeline）、设置分批处理（batch size 64）、并执行 pooling 和 normalize 等操作，实现了将文本转换为向量的具体生成逻辑。
- 引用文件：apps/server/src/services/embedder.service.ts, apps/server/src/services/embedder.service.ts, apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/services/embedder.service.ts

### Q12 前端问答主入口组件位于哪里？
- 判定：fail
- 回答：信息不足，无法回答。  依据：提供的代码上下文中未包含前端问答主入口组件的位置信息。建议补充包含前端路由配置或组件目录结构的代码上下文。
- 引用文件：apps/server/src/services/repo.service.ts, apps/server/src/routes/api-p0.route.test.ts, apps/server/src/routes/protocol-consistency.test.ts, apps/web/src/components/repo/repo-components.test.tsx

### Q13 SQLite 连接和初始化逻辑位于哪里？
- 判定：fail
- 回答：**信息不足，无法准确回答。**  **结论及依据：** 根据提供的上下文，仅能得知 SQLite 向量存储的类型定义（`_vectorstoreType` 返回 `"sqlite"`）及部分占位符逻辑位于 `apps/server/src/lib/sqlite-vector-store.ts` 文件中，但**没有包含任何关于数据库连接建立或表结构初始化的具体逻辑代码**。  建议补充 `sqlite-vector-store.ts` 文件中更完整的代码（如构造函数、`connect` 或 `init` 等相关方法）以便准确回答。
- 引用文件：apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/lib/sqlite-vector-store.ts

### Q14 前端点击“导入仓库”后会经过哪些调用链路？
- 判定：pass
- 回答：信息不足，无法回答。  依据：提供的上下文仅包含几个错误处理和抛出异常的代码片段，没有任何关于“导入仓库”功能的前端点击事件、API请求或后端具体业务逻辑的调用链路实现细节。建议补充相关的前端事件处理代码或后端路由/服务层的入口代码。
- 引用文件：apps/server/src/routes/protocol-consistency.test.ts, apps/server/src/services/repo.service.ts, apps/server/src/routes/protocol-consistency.test.ts, apps/server/src/index.ts

### Q15 前端点击“构建索引”后的调用链路是什么？
- 判定：fail
- 回答：信息不足，无法回答。  提供的代码上下文中仅包含一些错误处理（如“未找到相关代码”、“目录不存在”）、测试代码及前端代码复制按钮的实现，并未包含任何与“构建索引”按钮点击事件及对应调用链路相关的实现细节。建议补充包含“构建索引”相关路由或服务调用的代码上下文。
- 引用文件：apps/server/src/routes/protocol-consistency.test.ts, apps/server/src/services/repo.service.ts, apps/server/src/routes/ask.route.test.ts, apps/web/src/components/chat/CodeReference.tsx

### Q16 前端提交问题后的调用链路是什么？
- 判定：fail
- 回答：信息不足，无法得出完整结论。  **结论**：根据提供的上下文，只能推断出前端提交问题后的部分异常处理和索引构建逻辑，无法梳理出完整的调用链路。  **依据**： 1. 上下文中仅包含前端构建索引的流程（`handleBuildIndex`：触发 `buildIndex.mutateAsync`，成功后更新状态并刷新，失败则提示）。 2. 缺少前端实际“提交问题”的入口代码（如发送提问请求的 API 调用）以及后端接收提问后的核心处理逻辑（仅有异常抛出的片段 `NO_RELEVANT_CODE` 和 `REPO_LOAD_FAILED`）。  **建议**：请补充前端提交问题的请求代码（如类似 `ask.mutateAsync` 的调用）及后端处理提问的路由/服务实现。
- 引用文件：apps/server/src/routes/protocol-consistency.test.ts, apps/server/src/services/repo.service.ts, apps/server/src/routes/ask.route.test.ts, apps/web/src/components/app/AppShell.tsx

### Q17 AskService 内部从检索到生成回答的链路是什么？
- 判定：pass
- 回答：AskService 内部从检索到生成回答的链路如下：  1. **检索代码**：调用 `this.retrievalService.retrieve` 获取相关代码结果 `results`；若无结果则抛出“未找到相关代码”异常。 2. **构建上下文**：使用 `buildContextFromResults` 根据 `maxContextTokens` 限制将检索结果转换为文本 `contextText`。 3. **组装提示词**：通过 `createAskPrompt` 创建 Prompt，并将 `question` 和 `contextText` 格式化为 LLM 的 `messages`。 4. **调用大模型**：调用 `this.chatModel.invoke(messages)` 获取 LLM 响应。 5. **处理与返回**：使用 `normalizeModelContent` 提取并清理响应内容生成最终 `answer`，同时通过 `buildReferencesFromWhitelist` 从检索结果中提取 `references`，最后将两者一并返回。
- 引用文件：apps/server/src/index.ts, apps/server/src/services/ask.service.ts, apps/server/src/services/repo.service.ts, apps/server/src/services/ask.service.ts

### Q18 IndexService 如何把 chunk 和 embedding 持久化到 SQLite？
- 判定：pass
- 回答：基于提供的上下文，信息不足以完整回答 `IndexService` 是如何将 chunk 和 embedding **持久化**到 SQLite 的。具体原因如下：  1. **Chunk 持久化**：上下文显示了 `IndexService` 调用了 `saveChunks(chunks)`，但未提供 `saveChunks` 的具体实现，无法确认它是如何与 SQLite 交互并写入数据的。 2. **Embedding 持久化**：上下文显示了存在 `embedChunks` 函数用于获取 embedding，以及 `SQLiteVectorStore` 中有从 `chunks` 和 `embeddings` 表联合查询的代码，但**完全缺失** `IndexService` 调用写入 embedding 到数据库的代码（如类似 `saveEmbeddings` 的方法或 `SQLiteVectorStore` 的插入方法）。  **结论**：已知 `IndexService` 分割出 chunks 后调用了 `saveChunks`，并依赖 `SQLiteVectorStore`
- 引用文件：apps/server/src/lib/sqlite-vector-store.ts, apps/server/src/services/index.service.ts, apps/server/src/services/index.service.ts, apps/server/src/services/index.service.ts

### Q19 当 /api/ask 出现 NO_RELEVANT_CODE 时返回结构是什么？
- 判定：pass
- 回答：当 `/api/ask` 出现 `NO_RELEVANT_CODE` 时，返回的 JSON 结构如下：  ```json {   "code": "NO_RELEVANT_CODE",   "data": {     "answer": "未找到相关代码，请尝试更具体的问题",     "references": []   } } ```  **依据**：根据测试代码中的断言，`payload.code` 为 `ErrorCode.NO_RELEVANT_CODE`，`payload.data.answer` 为对应的错误提示信息，`payload.data.references` 为空数组。
- 引用文件：apps/server/src/routes/ask.route.test.ts, apps/server/src/routes/ask.route.test.ts, apps/server/src/routes/ask.route.test.ts, apps/server/src/services/ask.service.ts

### Q20 当重复构建索引时系统如何处理？
- 判定：fail
- 回答：根据提供的上下文，信息不足，无法回答“当重复构建索引时系统如何处理”的问题。  **依据**：提供的代码片段仅涉及目录加载失败、未找到相关代码时的错误抛出，以及一个测试用的模拟回答，并未包含任何与“构建索引”或“重复构建索引”相关的逻辑处理代码。建议您补充包含索引构建逻辑的代码上下文。
- 引用文件：apps/server/src/services/repo.service.ts, apps/server/src/routes/protocol-consistency.test.ts, apps/server/src/routes/ask.route.test.ts, apps/server/src/routes/api-p0.route.test.ts

### Q21 RepoService 对 git 导入有哪些协议与体积限制？
- 判定：pass
- 回答：根据提供的代码上下文，**信息不足，无法回答该问题**。  **依据**： 1. 上下文中仅出现了 `GIT_CLONE_TIMEOUT_MS` 这一与 Git 相关的超时变量，并未提供其具体赋值或说明是否代表体积限制。 2. 代码中虽然有 `"local" | "git"` 的类型定义，但没有任何关于支持的具体 Git 协议（如 HTTP/SSH）或体积限制的配置与逻辑。  建议补充包含 `GIT_CLONE_TIMEOUT_MS` 定义、Git 导入相关配置或 RepoService 完整逻辑的上下文。
- 引用文件：apps/web/src/components/repo/RepoStatus.tsx, apps/server/src/services/repo.service.ts, apps/server/src/db/repo.repository.ts, apps/server/src/services/repo.service.ts

### Q22 全局错误处理统一响应结构在哪里定义？
- 判定：fail
- 回答：信息不足，无法回答。  **依据**：提供的代码上下文中虽然使用了 `AppError` 抛出错误，并在前端 `catch` 中处理了错误信息，但没有任何代码片段展示“全局错误处理”的逻辑，也没有定义“统一响应结构”的代码（如中间件、拦截器或统一的返回格式定义）。  建议补充全局错误处理中间件或响应格式定义的相关代码上下文。
- 引用文件：apps/server/src/routes/protocol-consistency.test.ts, apps/server/src/services/repo.service.ts, apps/web/src/components/repo/RepoStatus.tsx, apps/web/src/components/app/AppShell.tsx

