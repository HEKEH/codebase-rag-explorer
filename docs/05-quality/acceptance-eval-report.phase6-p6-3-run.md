# PRD 题集执行报告

- 执行时间：2026-05-15T09:25:20.132Z
- 执行模式：live-rag
- 题目数量：26
- 命中数量：18
- 一致率：69.23%

| ID | 类别 | 判定 | 命中方式 |
|----|------|------|----------|
| Q01 | function | pass | keyword |
| Q02 | function | pass | keyword |
| Q03 | function | pass | keyword |
| Q04 | function | pass | keyword |
| Q05 | function | pass | keyword |
| Q06 | function | fail | none |
| Q07 | function | fail | none |
| Q08 | module | fail | none |
| Q09 | module | pass | keyword |
| Q10 | module | pass | keyword |
| Q11 | module | fail | none |
| Q12 | module | fail | none |
| Q13 | module | pass | keyword |
| Q14 | call-chain | fail | none |
| Q15 | call-chain | fail | none |
| Q16 | call-chain | fail | none |
| Q17 | call-chain | pass | keyword |
| Q18 | call-chain | pass | keyword |
| Q19 | call-chain | pass | keyword |
| Q20 | call-chain | pass | keyword |
| Q21 | function | pass | keyword |
| Q22 | module | pass | keyword |
| Q23 | function | pass | keyword |
| Q24 | function | pass | keyword |
| Q25 | function | pass | keyword |
| Q26 | function | pass | keyword |

## 逐题证据
### Q01 RepoService.importRepo 的主要职责是什么？
- 判定：pass
- 回答：RepoService.importRepo 的主要职责是**导入代码仓库源文件并持久化仓库记录**。  具体依据如下： 1. **校验与准备**：校验仓库是否已存在，并根据输入类型（git 或本地目录）进行预处理。如果是 git 类型，则克隆仓库；如果是本地目录，则校验目录可访问性。 2. **收集与保存**：通过 `collectSourceFiles` 收集源文件，生成包含唯一ID、状态等为 "loaded" 的仓库对象，并通过 `saveRepo` 和 `saveSourceFiles` 持久化仓库记录和源文件数据。 3. **清理与返回**：如果处理的是 git 仓库（临时克隆的目录），在最终阶段（finally）会清理临时目录，并返回导入结果（包含 repo_id、file_count 和 status）。
- 引用文件：src/services/repo.service.ts, src/services/repo.service.ts, src/services/repo.service.ts, src/services/repo.service.ts

### Q02 SplitterService 如何区分 function/class/generic chunk？
- 判定：pass
- 回答：根据提供的上下文，`SplitterService` 通过 `chunk_type` 属性来区分不同类型的 chunk，具体对应关系如下：  1. **function chunk**: `chunk.chunk_type === "function"` 2. **class chunk**: `chunk.chunk_type === "class"` 3. **generic chunk**: `chunk.chunk_type === "generic"`  **依据**：测试文件中分别使用上述条件对三种 chunk 进行了过滤/断言（如 `chunk.chunk_type === "class"`）。  *(注：上下文中未提供 `SplitterService.splitFile` 内部是如何解析并赋值 `chunk_type` 的具体实现逻辑，若需了解底层的区分机制，建议补充相关源码。)*
- 引用文件：src/services/splitter.service.test.ts, src/services/splitter.service.test.ts, src/services/index.service.ts, src/services/splitter.service.test.ts

### Q03 IndexService.buildIndex 的核心执行步骤有哪些？
- 判定：pass
- 回答：`IndexService.buildIndex` 的核心执行步骤如下：  1. **状态校验与初始化**：校验仓库是否存在，以及是否正在构建中（若状态为 `indexing` 则抛出异常）；获取源文件列表，并将仓库状态更新为 `indexing`，记录文件数量。 2. **清理旧数据**：如果仓库状态为 `indexed` 或 `failed`，为避免残留脏数据，会删除该仓库对应的 embeddings、chunks 并清除 embedding 元信息。 3. **文件拆分**：遍历源文件，使用 `splitter.splitFile` 将文件拆分为 chunks，并在过程中让出事件循环。 4. **保存 Chunks**：将拆分得到的所有 chunks 调用 `saveChunks` 进行持久化保存。 5. **向量化**：调用 `embedder.embedChunks` 对 chunks 进行向量化，并校验生成的向量数量与 chunks 数量是否一致。  *(注：上下文到此截断，后续步骤如向量存储、状态更新等缺失，信息不足。)*
- 引用文件：src/services/index.service.ts, src/routes/index.ts, src/services/index.service.ts, src/services/index.service.ts

### Q04 RetrievalService.retrieve 如何把稠密向量召回与 BM25（FTS5）稀疏候选融合并截断为 top-k？
- 判定：pass
- 回答：根据提供的上下文，无法完整回答 `RetrievalService.retrieve` 如何把稠密向量召回与 BM25（FTS5）稀疏候选融合并截断为 top-k。  **结论**：信息不足。  **依据**： 1. 上下文仅提供了 `ask.service.ts` 中 `retrieve` 的签名和调用方式，没有 `retrieval.service.ts` 中 `retrieve` 方法的具体实现代码。 2. 上下文只展示了稀疏召回（BM25）的部分辅助逻辑：`fullTableLexicalSliceLimit` 计算了全表词法搜索的截断上限（基于 `topK * 4` 及特定模态的深度乘数），`modalityBm25TopN` 计算了特定模态下的 BM25 Top N 数量，以及一个提取 BM25 分数的片段 `(h) => h.bm25`。 3. 缺失稠密向量的召回逻辑、分数归一化方式、具体的融合/排序算法（如 RRF 或加权求和）以及最终截断为 top-k 的代码细节。  建议补充 `src/services/retrieval.service.ts` 中 `retrie
- 引用文件：src/services/ask.service.ts, src/services/retrieval.service.ts, src/services/retrieval.service.ts, src/services/retrieval.service.ts

### Q05 AskService.ask 如何保证回答引用来源可追溯？
- 判定：pass
- 回答：**结论：** `AskService.ask` 通过调用 `buildReferencesFromWhitelist(results)` 函数，基于检索结果构建引用信息（`references`），从而保证回答引用来源可追溯。  **依据：** 在 `ask` 方法的返回值中，将检索服务（`this.retrievalService.retrieve`）获取到的结果 `results` 传入了 `buildReferencesFromWhitelist` 函数，并将其返回值作为 `references` 字段返回给调用方。  **补充说明：** 当前上下文信息不足，无法得知 `buildReferencesFromWhitelist` 函数内部的具体实现逻辑（如具体提取了哪些字段作为来源标识），建议补充该函数的实现代码以获取更详细的追溯机制。
- 引用文件：src/services/ask.service.ts, src/services/ask.service.ts, src/services/ask.service.ts, src/services/ask.service.ts

### Q06 CodeReference 组件如何实现代码展开与复制？
- 判定：fail
- 回答：信息不足，无法回答。  提供的代码上下文中没有包含 `CodeReference` 组件的实现细节，上下文主要涉及 `AskService`、路由测试以及错误处理逻辑。请补充 `CodeReference` 组件的相关代码上下文。
- 引用文件：src/routes/protocol-consistency.test.ts, src/services/ask.service.ts, src/services/ask.service.ts, src/routes/ask.route.test.ts

### Q07 useIndexStatus 如何控制索引状态轮询？
- 判定：fail
- 回答：根据提供的代码上下文，信息不足，无法说明 `useIndexStatus` 如何控制索引状态轮询。  **依据：** 上下文中并未包含 `useIndexStatus` 的定义或实现代码。仅在路由代码 (`src/routes/index.ts`) 的注释中提到 "Real-time progress is read from /api/index/status"，暗示状态可能通过该接口读取，但缺乏具体轮询机制（如定时器、间隔时间、停止条件等）的实现细节。  建议补充 `useIndexStatus` 的源码或相关上下文以便准确解答。
- 引用文件：src/services/index.service.test.ts, src/services/index.service.ts, src/services/index.service.test.ts, src/routes/index.ts

### Q08 仓库导入 API 路由定义在哪个文件？
- 判定：fail
- 回答：信息不足。  提供的上下文仅包含测试文件（`src/routes/api-p0.route.test.ts` 和 `src/routes/protocol-consistency.test.ts`）的部分代码，并没有包含仓库导入 API 路由的定义文件。建议补充路由定义相关的源码上下文以便准确回答。
- 引用文件：src/routes/api-p0.route.test.ts, src/routes/api-p0.route.test.ts, src/routes/protocol-consistency.test.ts, src/routes/protocol-consistency.test.ts

### Q09 索引构建与状态查询 API 定义在哪里？
- 判定：pass
- 回答：索引构建与状态查询 API 定义在 `src/routes/index` 中。  依据：在 `src/index.ts` 中，导入了 `indexRoutes` 并注明其来源为 `"./routes/index"`，表明索引相关的路由定义在此模块中。
- 引用文件：src/routes/api-p0.route.test.ts, src/index.ts, src/routes/api-p0.route.test.ts, src/services/ask.service.ts

### Q10 问答 API 在哪里定义？
- 判定：pass
- 回答：信息不足，无法回答。  **依据**：提供的上下文仅包含测试代码片段（如调用 `http://localhost/api/ask` 的测试），提到了问答 API 的路由路径为 `/api/ask`，但未包含该 API 路由的具体定义文件（如 `*.route.ts` 或控制器文件）。建议补充相关的路由定义代码上下文。
- 引用文件：src/routes/api-p0.route.test.ts, src/services/retrieval.service.test.ts, src/routes/protocol-consistency.test.ts, src/routes/api-p0.route.test.ts

### Q11 Embedding 生成逻辑在哪个文件？
- 判定：fail
- 回答：信息不足。  提供的上下文中只包含了 Embedding 相关的校验逻辑（如维度和模型检查）、模型配置获取逻辑以及获取 Embedding 客户端的接口，但没有包含具体的 Embedding 生成（如将文本转化为向量的执行）逻辑。因此无法确定 Embedding 生成逻辑所在的具体文件。建议补充相关的调用或实现代码上下文。
- 引用文件：src/lib/embedding-repo-compatibility.ts, src/lib/embedding-repo-compatibility.ts, src/lib/embedding-model-config.test.ts, src/services/embedder.service.ts

### Q12 前端问答主入口组件位于哪里？
- 判定：fail
- 回答：信息不足，无法回答。  依据：提供的上下文中不包含前端问答主入口组件的任何位置信息，现有代码主要涉及后端测试逻辑（如协议一致性测试、API路由测试）和数据库仓库层（如chunk repository）。建议补充前端相关的代码上下文。
- 引用文件：src/routes/protocol-consistency.test.ts, src/db/chunk.repository.ts, src/db/chunk.repository.ts, src/routes/api-p0.route.test.ts

### Q13 SQLite 连接和初始化逻辑位于哪里？
- 判定：pass
- 回答：根据提供的上下文，SQLite 的连接逻辑位于 `src/db/connection` 模块导出的 `getDb` 方法中。  **依据：**在 `src/lib/sqlite-vector-store.ts` 的导入语句中，存在 `import { getDb } from "../db/connection";`。但是，关于 SQLite 的**初始化逻辑**（如建表、配置等），上下文中信息不足，无法确定其具体位置。建议补充 `src/db/connection` 或该类的内部方法代码以作进一步确认。
- 引用文件：src/lib/sqlite-vector-store.ts, src/lib/sqlite-vector-store.ts, src/lib/sqlite-vector-store.ts, src/lib/sqlite-vector-store.ts

### Q14 前端点击“导入仓库”后会经过哪些调用链路？
- 判定：fail
- 回答：信息不足，无法回答。  提供的上下文仅包含部分测试文件和错误处理片段（如 `REPO_LOAD_FAILED`、`INDEX_NOT_BUILT` 等），缺乏前端点击“导入仓库”触发的主流程代码、路由定义及服务层的完整调用逻辑，因此无法推断出具体的调用链路。建议补充前端触发事件代码、路由入口及 `repo.service.ts` 的完整实现。
- 引用文件：src/routes/protocol-consistency.test.ts, src/services/repo.service.ts, src/services/repo.service.ts, src/routes/protocol-consistency.test.ts

### Q15 前端点击“构建索引”后的调用链路是什么？
- 判定：fail
- 回答：信息不足，无法回答。  提供的上下文中仅包含了 `AskService` 的检索（retrieve）逻辑、部分测试代码和查询标准化逻辑，并未包含任何与“构建索引”相关的前端触发事件、API 路由或后端服务调用链路的代码。建议补充与“构建索引”相关的前端组件、路由或后端 Service/Controller 代码。
- 引用文件：src/services/ask.service.ts, src/routes/protocol-consistency.test.ts, src/lib/fts-query-normalize.test.ts, src/services/ask.service.ts

### Q16 前端提交问题后的调用链路是什么？
- 判定：fail
- 回答：基于提供的上下文，前端提交问题后的调用链路如下：  1. **调用检索服务**：首先调用 `retrievalService.retrieve` 方法，传入问题（`question`）、仓库ID（`repoId`）、topK参数和上下文（`context`）来检索相关代码。 2. **结果判断**：    - **无结果**：如果检索结果为空（`results.length === 0`），则记录警告日志并抛出 `AppError`（错误码：`NO_RELEVANT_CODE`，提示："未找到相关代码，请尝试更具体的问题"）。    - **有结果**：继续后续流程（注：上下文中未提供有结果后的具体调用细节）。  *注：上下文信息不足以说明 `retrievalService.retrieve` 的内部实现以及检索到结果后的完整链路（如调用大模型等），建议补充相关问题上下文。*
- 引用文件：src/routes/protocol-consistency.test.ts, src/services/ask.service.ts, src/services/repo.service.ts, src/services/ask.service.ts

### Q17 AskService 内部从检索到生成回答的链路是什么？
- 判定：pass
- 回答：AskService 内部从检索到生成回答的链路如下：  1. **检索阶段**：调用 `this.retrievalService.retrieve(question, repoId, topK, context)` 获取相关代码结果。如果结果为空，则抛出 `NO_RELEVANT_CODE` 错误。 2. **生成与返回阶段**：基于检索结果生成回答（`answer`，若无效则返回兜底提示“未生成有效回答，请重试”），并调用 `buildReferencesFromWhitelist(results)` 构建引用信息（`references`），最后连同 `runtimeConfig.retrievalFusion` 一起返回。  *(注：上下文中缺失了检索结果如何具体传递给大模型生成回答的中间细节，如 `createAskPrompt` 和 `ChatAnthropic` 的调用过程，若需了解该部分实现，建议补充相关代码上下文。)*
- 引用文件：src/services/ask.service.ts, src/services/ask.service.ts, src/routes/api-p0.route.test.ts, src/routes/api-p0.route.test.ts

### Q18 IndexService 如何把 chunk 和 embedding 持久化到 SQLite？
- 判定：pass
- 回答：IndexService 通过以下两步将 chunk 和 embedding 持久化到 SQLite：  1. **持久化 chunks**：调用 `saveChunks(chunks)` 将拆分好的 chunk 数据存入 SQLite（由 `chunk.repository` 负责）。 2. **持久化 embeddings**：将 chunks 转换为 `Document` 对象（包含 content 和 metadata），然后调用 `this.vectorStore.addVectors(vectors, documents, { model: modelId })`，将向量和对应的 Document 一并存入 SQLite（由 `SQLiteVectorStore` 负责，数据最终写入 `embeddings` 表并通过 `chunk_id` 关联 `chunks` 表）。
- 引用文件：src/services/index.service.ts, src/services/index.service.ts, src/lib/sqlite-vector-store.ts, src/services/index.service.ts

### Q19 当 /api/ask 出现 NO_RELEVANT_CODE 时返回结构是什么？
- 判定：pass
- 回答：当 `/api/ask` 出现 `NO_RELEVANT_CODE` 时，返回的 JSON 结构如下：  ```json {   "code": "NO_RELEVANT_CODE",   "data": {     "answer": "未找到相关代码，请尝试更具体的问题",     "references": []   } } ```  **依据**：测试用例 (`protocol-consistency.test.ts`) 中断言了返回的 payload 结构，其中 `code` 为 `ErrorCode.NO_RELEVANT_CODE`，`data` 对象包含 `answer` 和空的 `references` 数组。
- 引用文件：src/services/ask.service.ts, src/services/ask.service.ts, src/routes/protocol-consistency.test.ts, src/routes/protocol-consistency.test.ts

### Q20 当重复构建索引时系统如何处理？
- 判定：pass
- 回答：根据提供的上下文，信息不足，无法回答“当重复构建索引时系统如何处理”的问题。  **依据**：提供的代码上下文仅包含问答服务、仓库加载错误处理和意图检测的逻辑，并未涉及索引构建（如去重、覆盖或报错）的相关实现细节。  建议补充与索引构建（Indexing/Build Service）相关的代码上下文。
- 引用文件：src/services/ask.service.ts, src/services/repo.service.ts, src/services/repo.service.ts, src/services/retrieval.service.ts

### Q21 RepoService 对 git 导入有哪些协议与体积限制？
- 判定：pass
- 回答：**协议限制**：仅支持 `https://` 或 `git@` 协议。 **体积限制**：上下文中信息不足，未提供相关体积限制的细节。
- 引用文件：src/services/repo.service.ts, src/services/repo.service.ts, src/services/repo.service.ts, src/services/repo.service.ts

### Q22 全局错误处理统一响应结构在哪里定义？
- 判定：pass
- 回答：结论：全局错误处理统一响应结构在 `src/index.ts` 中定义。  依据：在 `src/index.ts` 的错误处理回调中，通过调用 `fail` 函数（从 `./lib/response` 导入）来返回统一响应结构。对于 `AppError` 返回 `fail(error.code, error.message)`，对于其他内部错误返回 `fail(ErrorCode.INTERNAL_ERROR, "服务器内部错误")`。
- 引用文件：src/services/repo.service.ts, src/routes/protocol-consistency.test.ts, src/services/retrieval.service.ts, src/index.ts

### Q23 RETRIEVAL_FUSION、RETRIEVAL_SPARSE_MODE、RETRIEVAL_QUERY_MODALITY 等检索相关环境变量在服务端哪里解析为 runtime 配置？
- 判定：pass
- 回答：信息不足。  提供的上下文中仅展示了在测试代码中通过 `process.env` 设置这些环境变量，以及 `resolveQueryContentModality` 函数使用了 `RetrievalQueryModality` 类型，但**没有包含**服务端将这些环境变量解析为 runtime 配置的具体实现代码（如解析配置的模块或文件）。建议补充服务端配置加载相关的代码上下文。
- 引用文件：src/lib/query-modality.ts, src/services/retrieval.service.test.ts, src/services/retrieval.service.test.ts, src/services/retrieval.service.test.ts

### Q24 双路倒数排名融合（RRF）在代码中的独立实现文件与导出函数是什么？dense / BM25 两个有序列表如何合并？
- 判定：pass
- 回答：1. **独立实现文件与导出函数**：    - 独立实现文件：`src/lib/reciprocal-rank-fusion.ts`    - 导出函数：`reciprocalRankFusionTwoList`  2. **dense / BM25 两个有序列表合并逻辑**：    - 根据测试用例推断，合并逻辑基于 RRF 算法：对两个列表中的元素按排名计算得分（公式通常为 $1/(k+rank)$，代码中参数为 `k`），并将两列表的 RRF 得分相加（支持通过 `bm25Weight` 参数调整 BM25 列表的权重贡献）。    - 得分相同时的平局决断（Tie-break）：按 `chunk_id` 的字典序（lexicographic order）排列。    - 单列表贡献：如果某一列表为空，则最终排序保持另一列表的原有顺序。
- 引用文件：src/services/retrieval.service.ts, src/services/retrieval.service.test.ts, src/lib/reciprocal-rank-fusion.test.ts, src/services/retrieval.service.ts

### Q25 稀疏检索调用 FTS5 MATCH 前，用户检索词如何通过分词入口与 MATCH 表达式构建（含 OR/短语引号策略）？
- 判定：pass
- 回答：**结论：** 用户检索词通过 `normalizeUserQueryForFts5Match` 函数进行分词与重构，核心策略是将所有分出的词元（token）用**双引号包裹**，并以**空格分隔**（FTS5 默认空格即为 AND 逻辑）；对于用户输入的 FTS5 保留关键字（如 OR, AND, NOT, NEAR），同样作为独立词元用双引号包裹使其转义为普通字面量，而非布尔操作符；同时，对连续的中文等字符会按特定粒度切分为短语词元。  **依据：** 1. **短语引号策略**：从测试用例 `如何在app里用validateToken？` -> `"如何在" "app" "里用" "validateToken"` 可知，分词器将连续中文切分为短语（如 `如何在`、`里用`），英文/拼音切分为独立词，所有词元均强制加双引号包裹，以实现短语精确匹配。 2. **OR 策略**：从测试用例 `Foo OR bar foo` -> `"Foo" "OR" "bar"` 可知，用户输入的 `OR` 并未被当作逻辑操作符，而是被双引号包裹转义成了普通查询词。这意味着当前构建策略是消除用户输入
- 引用文件：src/lib/fts-query-normalize.test.ts, src/lib/fts-query-normalize.test.ts, src/lib/fts-query-normalize.test.ts, src/lib/fts-query-normalize.test.ts

### Q26 如何判断用户问题是 PL（更像代码片段）还是 NL（自然语言），以及如何与 force_nl / force_pl 覆盖组合？
- 判定：pass
- 回答：**结论：** 1. **判断 PL/NL**：当配置非强制时，通过 `inferAutoQueryContentModality(rawQuestion)` 函数对原始问题进行自动推断。 2. **与 force 覆盖组合**：通过 `resolveQueryContentModality(setting, rawQuestion)` 函数处理，`force_nl` 和 `force_pl` 具有最高优先级，会直接忽略自动推断结果；若无 force 前缀，则回退到自动推断。  **依据：** - 由 `resolveQueryContentModality` 实现可知：若 `setting === "force_nl"` 直接返回 `"nl"`，若 `setting === "force_pl"` 直接返回 `"pl"`，否则返回 `inferAutoQueryContentModality(rawQuestion)`。 - 测试用例验证了此逻辑：即使输入是自然语言 `nlQuestion`，只要 setting 为 `"force_pl"`，结果也会被强制覆盖为 `"pl"`；反之
- 引用文件：src/lib/query-modality.test.ts, src/config/runtime.fusion-parse.test.ts, src/lib/query-modality.test.ts, src/lib/query-modality.ts

