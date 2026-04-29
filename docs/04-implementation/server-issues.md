# Server 实现问题清单

基于 PRD.md 与 TRD.md 对比当前 `apps/server` 实现的分析结果。

---

## 一、核心管线占位实现（阻塞产品可用性）

### 1.1 Embedding 使用 Hash 伪向量

- **当前**：`embedder.service.ts` 用 SHA-256 哈希生成 256 维伪向量，无语义信息
- **要求**：nomic-embed-text-v1.5 (768 维) + Transformers.js，通过 `@langchain/community` 的 `HuggingFaceTransformersEmbeddings` 调用
- **影响**：语义检索完全失效，cosine similarity 计算结果无意义，整个 RAG 检索链路不可用

### 1.2 LLM 回答使用模板字符串

- **当前**：`ask.service.ts` 的 `generateAnswer` 返回固定中文模板字符串
- **要求**：Anthropic Claude API (`claude-sonnet-4-6`) via `@langchain/anthropic` + `ChatPromptTemplate`
- **影响**：问答无实际内容，无法基于代码上下文生成解释，核心产品价值为零

### 1.3 代码切分使用正则而非 AST

- **当前**：`splitter.service.ts` 按行扫描 `class`/`function`/`def` 关键字正则匹配
- **要求**：Tree-sitter AST 语义切分（阶段一）+ LangChain `RecursiveCharacterTextSplitter` 兜底（阶段二）
- **影响**：无法准确识别嵌套函数、方法、装饰器、async 箭头函数等复杂结构；非 TS/JS/PY 文件仅做固定长度切分，无语义

### 1.4 LangChain 管线完全未引入

- **当前**：无 LangChain 依赖，各服务手动实现
- **要求**：LangChain >= 1.3.4 贯穿全链路（加载、切分、Embedding、VectorStore、Prompt、LLM）
- **影响**：整个 RAG 管线需要基于 LangChain 重构

---

## 二、存储层缺失（影响数据可靠性）

### 2.1 数据库未使用

- **当前**：`repo.store.ts` 使用内存 Map + JSON 文件持久化（`data/chunks/*.json`、`data/embeddings/*.json`）
- **要求**：SQLite 三表（repos/chunks/embeddings），有 `schema.sql` 但运行时未使用
- **影响**：
  - 服务重启数据全部丢失
  - 无并发安全保证
  - 无事务支持
  - 无法按 repo_id 高效查询 chunks

### 2.2 VectorStore 未实现

- **当前**：JSON 文件全量加载到内存计算余弦相似度
- **要求**：自定义 `SQLiteVectorStore` 实现 `@langchain/core` 的 `VectorStore` 接口
- **影响**：无法接入 LangChain 的 `asRetriever()` 等生态方法，扩展困难

---

## 三、API 与业务逻辑差异

### 3.1 索引构建非异步

- **当前**：`buildIndex` 同步执行，路由直接 await 返回 `status: "indexed"`
- **要求**：异步触发返回 `status: "indexing"`，前端通过 `GET /api/index/status` 轮询
- **影响**：大型仓库索引时前端请求超时，无进度反馈

### 3.2 多余的检索路由

- **当前**：`POST /api/retrieval/search` 单独暴露
- **要求**：TRD 无此端点，检索应为 AskService 内部调用
- **影响**：API 表面与文档不一致

### 3.3 NO_RELEVANT_CODE 响应结构不合规

- **当前**：全局 error handler 返回 `{code:3001, message, data:null}`
- **要求**（PRD §7.1）：`data` 应包含 `{answer, references:[]}`，code=3001 属业务预期非系统错误
- **影响**：前端无法区分"无结果"和"系统错误"

### 3.4 BuildIndexData 返回状态错误

- **当前**：直接返回 `status: "indexed"`
- **要求**：应返回 `status: "indexing"`（异步任务的初始状态）
- **影响**：与异步索引设计矛盾

### 3.5 RepoStatus 枚举偏差

- **当前**：`@repo/types` 增加了 `"failed"` 状态
- **要求**：TRD 定义为 `"idle" | "loaded" | "indexing" | "indexed"`
- **影响**：偏差但属合理补充（索引失败时需要此状态），需同步更新 TRD

---

## 四、前端架构严重缺失

### 4.1 组件未拆分

- **当前**：全部逻辑在 `App.tsx` 单文件（~6KB）
- **要求**：6+ 组件（RepoInput、RepoStatus、ChatInput、ChatMessage、CodeReference、ChatPanel、AppLayout）
- **影响**：不可维护、不可测试

### 4.2 状态管理

- **当前**：`useState` 本地状态
- **要求**：Jotai atoms（repoAtom、chatAtom、isIndexedAtom）+ 派生
- **影响**：无法跨组件共享状态

### 4.3 API 请求管理

- **当前**：直接 fetch 调用，无缓存/重试/loading 管理
- **要求**：TanStack Query hooks（useImportRepo、useBuildIndex、useIndexStatus、useAskQuestion）
- **影响**：索引构建轮询未实现，无请求状态管理

### 4.4 UI 框架与样式

- **当前**：内联 CSSProperties
- **要求**：shadcn/ui + Tailwind CSS 4
- **影响**：无设计系统，外观粗糙

### 4.5 代码高亮

- **当前**：纯文本 `<pre>`
- **要求**：Shiki 语法高亮 + 语言标签 + 复制按钮 + 行号
- **影响**：代码引用不可读

### 4.6 Markdown 渲染

- **当前**：纯文本
- **要求**：react-markdown + remark-gfm
- **影响**：LLM 回答无法正确渲染

### 4.7 布局

- **当前**：垂直堆叠
- **要求**：左面板 320px + 右面板 flex-1
- **影响**：不符合交互设计

---

## 五、共享包问题

### 5.1 ApiClient 多实例

- **当前**：`repo.ts`、`index-api.ts`、`ask.ts` 各自 `new ApiClient()`
- **要求**：单一共享 `apiClient` 实例
- **影响**：baseURL 不可统一配置

### 5.2 IGNORED_DIRECTORIES 不完整

- **当前**：7 个目录（缺少 `.venv`、`target`、`bin`、`obj`）
- **要求**：TRD 明确列出 10+ 个目录

### 5.3 IGNORED_FILE_PATTERNS 格式错误

- **当前**：字符串元组 `[".lock", ...]`
- **要求**：正则表达式 `[/\.lock$/, ...]`，含二进制文件排除模式

### 5.4 Message 类型缺少字段

- **当前**：`{role, content, references}`
- **要求**：应包含 `id: string` 和 `timestamp: number`

### 5.5 缺少 EMBEDDING_BATCH_SIZE

- **当前**：未在 constants 中定义
- **要求**：TRD 定义 `EMBEDDING_BATCH_SIZE = 2048`

---

## 六、测试与质量保证

### 6.1 后端测试严重不足

- **当前**：2 个 service 测试（splitter、retrieval）
- **要求**：12+ 关键测试用例

缺失的测试场景：

| # | 测试场景 | 优先级 |
|---|---------|--------|
| 1 | 导入本地代码库 → code:0, status:loaded | P0 |
| 2 | 导入不存在路径 → code:1001 | P0 |
| 3 | 构建索引 → chunks/embeddings 有数据 | P0 |
| 4 | 语义切分 → 识别出函数/类类型 chunk | P1 |
| 5 | 超长 chunk 二次切分 → 不超 max_length | P1 |
| 6 | 向量检索 → top_k 按相似度降序 | P1 |
| 7 | 问答 → code:0, 含 answer + references | P0 |
| 8 | 未索引时问答 → code:2001 | P0 |
| 9 | 无关问题 → code:3001 | P1 |
| 10 | 协议一致性 → 失败响应均为 `{code,message,data:null}` | P0 |
| 11 | 引用可追溯 → chunk_id 可在 chunks 表找到 | P1 |
| 12 | 索引状态机 → 仅允许合法状态流转 | P1 |

### 6.2 前端测试缺失

- **当前**：1 个 smoke test
- **要求**：组件测试 + Hook 测试

### 6.3 PRD 验收标准未覆盖

- **当前**：无预置题集
- **要求**：20+ 题集，回答一致率 >=80%，引用可追溯

---

## 修复优先级建议

### P0 — 不修复产品不可用

1. Embedding 替换为 nomic-embed-text-v1.5 + Transformers.js
2. LLM 回答替换为 Claude API + ChatPromptTemplate
3. 数据存储替换为 SQLite（三表）
4. 引入 LangChain 管线重构

### P1 — 不修复体验很差

5. 代码切分替换为 Tree-sitter AST + LangChain RecursiveCharacterTextSplitter
6. 索引构建改为异步（返回 indexing 状态 + 轮询）
7. NO_RELEVANT_CODE 响应结构修正
8. 前端重构（组件拆分 + Jotai + TanStack Query + shadcn/ui）

### P2 — 完善与合规

9. 移除多余 `/api/retrieval/search` 路由
10. 共享包修正（ApiClient 单例、常量补全、Message 类型）
11. 补全测试用例
12. 验收题集
