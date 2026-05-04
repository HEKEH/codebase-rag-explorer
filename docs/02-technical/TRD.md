# 技术需求文档（TRD）

## 项目名称

Codebase RAG Explorer（代码库智能问答系统）

---

## 一、技术栈总览

| 层面          | 技术选型                      | 版本要求               | 说明                                   |
| ------------- | ----------------------------- | ---------------------- | -------------------------------------- |
| 运行时        | Bun                           | >= 1.1                 | 后端运行时，原生 TypeScript 支持       |
| 后端框架      | Elysia                        | >= 1.4                 | Bun 原生 Web 框架，类型安全            |
| RAG 管线      | LangChain.js                  | >= 1.3.4               | 文档加载、切分、检索、生成链路         |
| 代码解析      | Tree-sitter                   | -                      | AST 级语义切分（按函数/类）            |
| Embedding     | nomic-embed-text-v1.5        | via Transformers.js    | 768 维，本地运行，无需外部 API          |
| LLM           | Anthropic Claude API          | claude-sonnet-4-6      | 回答生成，via LangChain                |
| 向量存储      | SQLite                        | -                      | 存储 chunks + embeddings，内存余弦检索 |
| 前端框架      | React 19 + Vite               | React >= 19, Vite >= 6 | SPA 架构                               |
| UI 组件       | shadcn/ui + Tailwind CSS      | Tailwind >= 4          | 代码展示场景尤佳                       |
| 代码高亮      | Shiki                         | >= 1.0                 | 多语言语法高亮                         |
| 服务端状态    | TanStack Query                | >= 5                   | API 请求缓存、重试、loading            |
| 客户端状态    | Jotai                         | >= 2.0                 | 原子化状态管理                         |
| Markdown 渲染 | react-markdown + remark-gfm   | -                      | LLM 回答渲染                           |
| 包管理        | Bun workspace                 | -                      | Monorepo 统一管理                      |

---

## 二、系统架构

## 2.1 整体架构图

```text
┌─────────────────────────────────────────────────┐
│                   Frontend (SPA)                │
│  React 19 + Vite + shadcn/ui + Jotai           │
│  TanStack Query (API 状态)                      │
├─────────────────────────────────────────────────┤
│                 HTTP / REST API                  │
├─────────────────────────────────────────────────┤
│                Backend (Elysia)                  │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Repo     │ │ Index    │ │ Ask            │  │
│  │ Service  │ │ Service  │ │ Service        │  │
│  └────┬─────┘ └────┬─────┘ └──────┬─────────┘  │
│       │            │              │              │
│  ┌────▼────────────▼──────────────▼──────────┐  │
│  │          LangChain.js Pipeline            │  │
│  │  DirectoryLoader → Splitter → Embedding   │  │
│  │  (Transformers.js / nomic-embed)          │  │
│  │  → VectorStore → Retriever → LLM         │  │
│  │  (Claude API)                              │  │
│  └────┬────────────┬────────────┬────────────┘  │
│       │            │            │                │
│  ┌────▼─────┐ ┌───▼────┐ ┌────▼─────┐         │
│  │Tree-sitter│ │ SQLite │ │ Claude   │         │
│  │(AST 切分) │ │(存储)  │ │ API      │         │
│  └──────────┘ └────────┘ └──────────┘         │
└─────────────────────────────────────────────────┘
```

## 2.2 Monorepo 结构

采用 Bun workspace + `apps/` + `packages/` 的标准 Monorepo 架构，`packages/` 下提取前后端共用包：

```text
codebase-rag-explorer/
├── package.json                # workspace 根配置
├── tsconfig.base.json          # 共享 TS 配置
├── .env.example                # 环境变量模板
├── bunfig.toml                 # Bun 配置
│
├── apps/
│   ├── server/                 # 后端应用
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts            # Elysia 启动入口
│   │   │   ├── routes/
│   │   │   │   ├── repo.ts         # 仓库导入 API
│   │   │   │   ├── index.ts        # 索引构建/状态 API
│   │   │   │   └── ask.ts          # 问答 API
│   │   │   ├── services/
│   │   │   │   ├── repo.service.ts       # 代码库导入逻辑
│   │   │   │   ├── splitter.service.ts   # 代码切分（Tree-sitter + LangChain）
│   │   │   │   ├── embedder.service.ts   # Embedding 服务
│   │   │   │   ├── retrieval.service.ts  # 检索服务
│   │   │   │   └── ask.service.ts        # 问答编排（RAG 完整链路）
│   │   │   ├── db/
│   │   │   │   ├── connection.ts         # SQLite 连接
│   │   │   │   ├── schema.sql            # 建表语句
│   │   │   │   ├── chunk.repository.ts   # Chunk CRUD
│   │   │   │   └── embedding.repository.ts # 按 repo 删除 embeddings（重建索引）
│   │   │   └── lib/
│   │   │       ├── tree-sitter.ts        # Tree-sitter 封装
│   │   │       ├── langchain.ts          # LangChain 实例工厂
│   │   │       ├── sqlite-vector-store.ts # embeddings 表读写与向量检索（VectorStore）
│   │   │       └── prompts.ts            # Prompt 模板
│   │   └── types/
│   │       └── index.ts                  # 后端内部类型（ChunkData 等）
│   └── tests/
│
│   └── web/                    # 前端应用
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── atoms/               # Jotai atoms
│       │   │   ├── repo.atom.ts
│       │   │   └── chat.atom.ts
│       │   ├── components/
│       │   │   ├── ui/              # shadcn/ui 组件
│       │   │   ├── repo/            # 仓库管理组件
│       │   │   │   ├── RepoInput.tsx
│       │   │   │   └── RepoStatus.tsx
│       │   │   ├── chat/            # 问答组件
│       │   │   │   ├── ChatInput.tsx
│       │   │   │   ├── ChatMessage.tsx
│       │   │   │   ├── CodeReference.tsx
│       │   │   │   └── ChatPanel.tsx
│       │   │   └── layout/
│       │   │       └── AppLayout.tsx
│       │   ├── hooks/
│       │   │   ├── use-repo.ts      # 仓库相关 TanStack Query hooks
│       │   │   └── use-ask.ts       # 问答相关 TanStack Query hooks
│       │   └── lib/
│       │       └── utils.ts              # 通用工具函数（cn 等）
│       └── tests/
│
└── packages/
    ├── types/                  # @repo/types - 共享类型定义
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts            # 统一导出
    │       ├── api.ts              # API 请求/响应类型 + 统一响应结构
    │       ├── models.ts           # 数据模型（Repo, Reference, Message）
    │       └── enums.ts            # 枚举常量（RepoStatus, ChunkType, ErrorCode）
    │
    ├── api-client/              # @repo/api-client - 前端 API 请求客户端
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts            # 统一导出
    │       ├── client.ts           # fetch 封装，baseURL、错误处理
    │       ├── repo.ts             # repo 相关 API 方法
    │       ├── index-api.ts        # index 相关 API 方法
    │       └── ask.ts              # ask 相关 API 方法
    │
    └── constants/               # @repo/constants - 共享常量
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts            # 统一导出
            ├── file-extensions.ts  # 支持的源码扩展名
            ├── ignore-patterns.ts  # 忽略目录/文件模式
            ├── chunking.ts         # 切分参数默认值
            └── retrieval.ts        # 检索参数默认值
```

### 2.2.1 包依赖关系

```text
@repo/types          ← 零依赖，纯类型包
@repo/constants      ← 零依赖，纯常量包
@repo/api-client     ← 依赖 @repo/types
apps/server           ← 依赖 @repo/types, @repo/constants
apps/web              ← 依赖 @repo/types, @repo/api-client, @repo/constants
```

### 2.2.2 Workspace 配置

根 `package.json`：

```json
{
    "name": "codebase-rag-explorer",
    "private": true,
    "workspaces": ["apps/*", "packages/*"],
    "scripts": {
        "dev": "bun run --parallel --filter './apps/*' dev",
        "dev:server": "bun run --filter @repo/server dev",
        "dev:web": "bun run --filter @repo/web dev",
        "build": "bun run --filter @repo/web build",
        "test": "bun run --filter './packages/*' test && bun run --filter './apps/*' test",
        "typecheck": "bun run --filter './packages/*' typecheck && bun run --filter './apps/*' typecheck"
    }
}
```

各包 `package.json` 命名规范：

| 包                  | name               | 说明                                        |
| ------------------- | ------------------ | ------------------------------------------- |
| packages/types      | `@repo/types`      | 共享 TypeScript 类型（纯类型包，无需构建）  |
| packages/api-client | `@repo/api-client` | 前端 API 请求客户端（纯 TS 源码，无需构建） |
| packages/constants  | `@repo/constants`  | 共享常量与默认值（纯 TS 源码，无需构建）    |
| apps/server         | `@repo/server`     | 后端 Elysia 服务                            |
| apps/web            | `@repo/web`        | 前端 React 应用                             |

> Bun workspace 原生支持 TypeScript 源码引用，packages 下的纯 TS 包无需构建步骤，直接通过 `"exports"` 指向 `src/index.ts` 即可。

---

## 三、后端详细设计

## 3.1 API 设计

### 3.1.1 统一响应格式

所有 API 响应遵循统一结构：

```typescript
interface ApiResponse<T = unknown> {
    code: number; // 0 = 成功，非 0 = 错误码
    message: string; // 描述信息
    data: T; // 成功时为实际数据，失败时为 null
}
```

成功响应示例：

```json
{
    "code": 0,
    "message": "success",
    "data": {
        "repo_id": "abc-123",
        "file_count": 42
    }
}
```

错误响应示例：

```json
{
    "code": 1001,
    "message": "目录不存在或无法读取",
    "data": null
}
```

### 3.1.2 错误码枚举

| 错误码 | 含义           | 触发条件                         |
| ------ | -------------- | -------------------------------- |
| 0      | 成功           | -                                |
| 1001   | 仓库加载失败   | 目录不存在/不可读/Git clone 失败 |
| 1002   | 仓库已存在     | 同一路径已导入                   |
| 1003   | 仓库不存在     | repo_id 不存在或已删除           |
| 1004   | 仓库重载中     | 目标仓库 status=indexing         |
| 2001   | 索引未构建     | 询问时仓库未索引                 |
| 2002   | 索引已存在     | 重复构建索引                     |
| 3001   | 无相关代码     | 检索结果为空                     |
| 4001   | Embedding 失败 | Embedding API 调用失败           |
| 4002   | LLM 调用失败   | LLM API 调用失败                 |
| 5000   | 内部错误       | 未知服务端错误                   |

> 设计原则：错误码分段，1xxx=仓库相关，2xxx=索引相关，3xxx=检索相关，4xxx=外部 API 相关，5xxx=系统内部。

---

### 3.1.3 仓库导入

#### POST /api/repo/import

请求：

```json
{
    "path": "/absolute/path/to/repo",
    "type": "local"
}
```

或：

```json
{
    "path": "https://github.com/org/repo.git",
    "type": "git"
}
```

成功响应：

```json
{
    "code": 0,
    "message": "success",
    "data": {
        "repo_id": "string",
        "file_count": 42,
        "status": "loaded"
    }
}
```

错误响应：

```json
{
    "code": 1001,
    "message": "目录不存在或无法读取",
    "data": null
}
```

---

### 3.1.4 索引构建

#### POST /api/index/build

请求：

```json
{
    "repo_id": "string"
}
```

成功响应：

```json
{
    "code": 0,
    "message": "success",
    "data": {
        "repo_id": "string",
        "status": "indexing"
    }
}
```

说明：索引构建为异步任务。`POST /api/index/build` 仅负责触发任务并返回当前状态（通常为 `indexing`），前端通过 `GET /api/index/status` 轮询状态直到 `indexed` 或 `failed`。若仓库已处于 `indexing` 或 `indexed`，返回 `2002 (INDEX_ALREADY_EXISTS)`。

兼容性说明：`/api/index/*` 为历史兼容接口，标记为 deprecated。新增页面与新逻辑统一使用 `/api/repos/:repo_id/reload` 与 `/api/repos/:repo_id/status`，不再新增对 `/api/index/*` 的依赖。

---

### 3.1.5 索引状态查询

#### GET /api/index/status?repo_id=xxx

成功响应：

```json
{
    "code": 0,
    "message": "success",
    "data": {
        "repo_id": "string",
        "status": "indexed",
        "chunk_count": 128,
        "file_count": 42
    }
}
```

索引失败响应示例：

```json
{
    "code": 0,
    "message": "success",
    "data": {
        "repo_id": "string",
        "status": "failed",
        "chunk_count": 0,
        "file_count": 42,
        "error_code": 4001,
        "error_message": "Embedding API 调用失败"
    }
}
```

---

### 3.1.6 问答

#### POST /api/ask

请求：

```json
{
    "repo_id": "string",
    "question": "string",
    "top_k": 5
}
```

成功响应：

```json
{
    "code": 0,
    "message": "success",
    "data": {
        "answer": "string",
        "references": [
            {
                "chunk_id": "string",
                "file_path": "src/services/auth.ts",
                "snippet": "function validateToken(token: string) { ... }",
                "score": 0.87
            }
        ]
    }
}
```

索引未构建时：

```json
{
    "code": 2001,
    "message": "请先构建索引",
    "data": null
}
```

仓库重载中时：

```json
{
    "code": 1004,
    "message": "仓库正在重载，请稍后再试",
    "data": null
}
```

---

### 3.1.7 仓库管理新增接口（追加需求）

以下接口用于支持“仓库管理页 / 聊天页分离”：

#### POST /api/repos

用于创建仓库记录并导入代码。

请求：

```json
{
    "source_type": "local",
    "source_value": "/absolute/path/to/repo",
    "auto_reload": true
}
```

约束：

- `source_type + source_value` 必须全局唯一
- 重复添加时返回 `1002 (REPO_ALREADY_EXISTS)`，由前端提示并询问是否改为调用 reload 接口
- 重复添加不等于重载，不自动触发重载

#### GET /api/repos

返回所有仓库（聊天页下拉展示全部，仅 `indexed` 前端可选可问答）。

#### DELETE /api/repos/:repo_id

删除仓库及其关联数据：

- `repos`、`chunks`、`embeddings`
- 当前仓库的全部聊天历史（强制删除，和 PRD 保持一致）

不存在时返回 `1003 (REPO_NOT_FOUND)`。

#### POST /api/repos/:repo_id/reload

触发单仓库异步重载（重新索引），立即返回 `indexing`。

- 若仓库不存在：`1003 (REPO_NOT_FOUND)`
- 若已在 `indexing`：`1004 (REPO_RELOADING)`（直接失败，不排队、不重复触发）

#### GET /api/repos/:repo_id/status

单仓库状态查询，用于仓库管理页轮询刷新状态。

#### DELETE /api/repos/:repo_id/chat-history

清空指定仓库的聊天历史（不删除仓库本身）。

- 成功时返回 `{ repo_id, cleared: true }`
- 仓库不存在时返回 `1003 (REPO_NOT_FOUND)`

## 3.2 数据库设计

### 3.2.1 repos 表

| 字段        | 类型             | 说明                                       |
| ----------- | ---------------- | ------------------------------------------ |
| id          | TEXT PRIMARY KEY | UUID                                       |
| path        | TEXT             | 仓库路径或地址                             |
| type        | TEXT             | "local" 或 "git"                           |
| status      | TEXT             | "idle" / "loaded" / "indexing" / "indexed" / "failed" |
| file_count  | INTEGER          | 源码文件数量                               |
| chunk_count | INTEGER          | 切分后 chunk 数量                          |
| created_at  | TEXT             | ISO 8601 时间戳                            |
| updated_at  | TEXT             | ISO 8601 时间戳                            |

### 3.2.2 chunks 表

| 字段       | 类型             | 说明                             |
| ---------- | ---------------- | -------------------------------- |
| id         | TEXT PRIMARY KEY | chunk_id                         |
| repo_id    | TEXT             | 所属仓库，外键                   |
| content    | TEXT             | 代码内容                         |
| file_path  | TEXT             | 源文件路径                       |
| chunk_type | TEXT             | "function" / "class" / "generic" |
| chunk_name | TEXT             | 函数名或类名，可为 NULL          |
| start_line | INTEGER          | 在源文件中的起始行               |
| end_line   | INTEGER          | 在源文件中的结束行               |

### 3.2.3 embeddings 表

| 字段      | 类型             | 说明                                       |
| --------- | ---------------- | ------------------------------------------ |
| id        | TEXT PRIMARY KEY | 与 chunk_id 一一对应                       |
| chunk_id  | TEXT             | 外键，关联 chunks                          |
| embedding | BLOB             | 向量数据，存储为 Float32Array 的序列化形式（768 维） |
| model     | TEXT             | Embedding 模型名称                         |

### 3.2.4 SQL Schema

```sql
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('local', 'git')),
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'loaded', 'indexing', 'indexed', 'failed')),
  file_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(path, type)
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  file_path TEXT NOT NULL,
  chunk_type TEXT NOT NULL DEFAULT 'generic' CHECK(chunk_type IN ('function', 'class', 'generic')),
  chunk_name TEXT,
  start_line INTEGER,
  end_line INTEGER
);

CREATE TABLE embeddings (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL UNIQUE REFERENCES chunks(id) ON DELETE CASCADE,
  embedding BLOB NOT NULL,
  model TEXT NOT NULL
);

CREATE INDEX idx_chunks_repo_id ON chunks(repo_id);
CREATE INDEX idx_chunks_file_path ON chunks(file_path);
CREATE INDEX idx_embeddings_chunk_id ON embeddings(chunk_id);
```

---

## 3.3 核心服务设计

### 3.3.1 RepoService（代码库导入）

```text
输入：path (本地路径或 Git 地址), type ("local" | "git")
流程：
  1. 若 type=git，通过 Bun.spawn 执行 git clone 到临时目录
  2. 若 type=local，校验目录存在且可读
  3. 递归扫描目录，收集源代码文件
  4. 过滤忽略目录：node_modules, .git, dist, build, __pycache__, .next, vendor
  5. 过滤忽略文件类型：.lock, .min.js, .min.css, .map, 二进制文件
  6. 读取每个文件内容，构造 {path, content} 列表
  7. 写入 repos 表，状态设为 "loaded"
输出：repo_id, file_count
```

Git 导入边界与安全约束（MVP）：

- 单仓库大小上限默认 200MB（可配置）
- clone 超时默认 120 秒（可配置）
- 仅允许 `https://` 与 `git@` 协议
- clone 到临时目录，按清理策略删除临时目录
- 私有仓库认证失败返回 `1001`，message 仅包含可读错误信息，不回显敏感凭据

支持的源码文件扩展名（MVP），定义在 `@repo/constants` 的 `SUPPORTED_EXTENSIONS` 中：

```text
.ts, .tsx, .js, .jsx, .py, .go, .rs, .java, .rb, .c, .cpp, .h, .hpp, .cs, .php, .swift, .kt
```

忽略目录和文件模式，定义在 `@repo/constants` 的 `IGNORED_DIRECTORIES` 和 `IGNORED_FILE_PATTERNS` 中。

### 3.3.2 SplitterService（代码切分）

采用**两阶段切分策略**：

#### 阶段一：Tree-sitter AST 语义切分

```text
输入：文件 {path, content} + 语言类型
流程：
  1. 根据 file_path 扩展名选择语言 grammar
  2. 解析生成 AST
  3. 提取顶层节点中类型为 function_declaration / class_declaration / method_declaration 的节点
  4. 每个节点生成一个 chunk，包含：
     - content: 节点完整文本
     - chunk_type: "function" 或 "class"
     - chunk_name: 节点标识符
     - start_line / end_line: 行号范围
  5. 无法归入函数/类的剩余代码，标记为 "generic" chunk
输出：Chunk[]
```

#### 阶段二：LangChain RecursiveCharacterTextSplitter 兜底

```text
输入：阶段一产出的超长 chunk（`content.length > CHUNK_MAX_LENGTH`）
流程：
  1. 对超过长度阈值的 chunk 进行二次切分
  2. 使用 LangChain 的 RecursiveCharacterTextSplitter，按语言配置分隔符
  3. 二次切分产生的 chunk 保留原 chunk_name，chunk_type 标记为 "generic"
输出：拆分后的 Chunk[]
```

切分参数（默认值定义在 `@repo/constants` 的 `CHUNK_MAX_LENGTH`、`CHUNK_OVERLAP`）：

- 最大 chunk 长度：1500 字符
- 重叠长度：200 字符
- 长度计量：字符数

说明：切分阈值使用字符长度控制（`CHUNK_MAX_LENGTH`）；上下文截断使用 token 估算控制（`MAX_CONTEXT_TOKENS`）。二者职责不同，不混用。

### 3.3.3 EmbedderService（向量化）

```text
输入：Chunk[]
流程：
  1. 为每个 chunk 构造 embedding 输入文本，格式：
     "File: {file_path}\n{chunk_type}: {chunk_name}\n\n{content}"
  2. 使用 Transformers.js 加载 nomic-embed-text-v1.5 模型（本地运行，首次自动下载缓存）
  3. 批量 embed，每批最多 2048 条
  4. 将返回的 embedding（Float32 数组）序列化存储到 embeddings 表
输出：写入 embeddings 表
```

Transformers.js 初始化：

```typescript
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';

const embeddings = new HuggingFaceTransformersEmbeddings({
    model: 'nomic-ai/nomic-embed-text-v1.5',
});
```

### 3.3.4 RetrievalService（检索）

```text
输入：question (string), repo_id, top_k (默认 5)
流程：
  1. 对 question 调用 Embedding API 生成查询向量
  2. 从 embeddings 表加载该 repo_id 下所有 embedding 向量
  3. 计算查询向量与每个 chunk 向量的余弦相似度
  4. 按相似度降序排序，取 top_k
  5. 关联 chunks 表获取 content、file_path 等元数据
输出：{ chunk_id, content, file_path, chunk_type, chunk_name, score }[]
```

余弦相似度计算：

```typescript
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0,
        normA = 0,
        normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

> 扩展预留：当向量规模增长时，可替换为 hnswlib-node 或引入 ChromaDB，无需改动 RetrievalService 接口。

### 3.3.5 AskService（问答编排）

````text
输入：question, repo_id, top_k
流程：
  1. 校验 repo 状态为 "indexed"，否则返回 code: 2001 (INDEX_NOT_BUILT)
  2. 调用 RetrievalService.retrieve(question, repo_id, top_k)
  3. 若检索结果为空，返回 code: 3001 (NO_RELEVANT_CODE) 及默认回答
  4. 构建上下文：
     - 将每个检索结果格式化为：
       "---\nFile: {file_path}\n{chunk_type}: {chunk_name}\n```{lang}\n{content}\n```\n"
     - 拼接所有片段，总长度控制在 8000 token 以内
     - 超长时按 score 从低到高截断
  5. 组装 Prompt（见 3.4）
  6. 调用 Claude API 生成回答
  7. 引用信息不从 LLM 文本中抽取；仅从检索结果白名单（chunk_id、file_path、snippet、score）生成
  8. 返回 { code: 0, data: { answer, references } }，其中 references 必须可追溯到 chunks 表
输出：ApiResponse<AskData>
````

---

## 3.4 Prompt 设计

### System Prompt

```text
你是一个代码分析助手。你的任务是根据提供的代码片段回答用户问题。

规则：
1. 只根据提供的代码片段回答问题，不要编造代码中不存在的信息
2. 如果代码片段不足以回答问题，明确说明缺少哪些信息
3. 回答中引用代码时，标注文件路径
4. 使用 Markdown 格式，代码块标注语言类型
5. 回答要简洁准确，先给出直接结论，再补充细节
```

### User Prompt Template

```text
以下是代码库中的相关代码片段：

{context}

---

用户问题：{question}

请基于以上代码回答问题。
```

---

## 3.5 LangChain 管线映射

LangChain 版本：**>= 1.3.4**（基于 `@langchain/core` 新版架构）

> 注意：LangChain 1.x 已将核心包统一为 `langchain`，子包结构为 `@langchain/core`、`@langchain/openai`、`@langchain/anthropic`、`@langchain/community` 等。以下均基于 1.3.4+ API。

PRD 步骤与 LangChain 组件的对应关系：

| PRD 步骤       | LangChain 组件                   | 包名                       | 说明                    |
| -------------- | -------------------------------- | -------------------------- | ----------------------- |
| 导入代码库     | `DirectoryLoader`                | `langchain`                | 递归加载目录文件        |
| 代码切分       | `RecursiveCharacterTextSplitter` | `@langchain/textsplitters` | 阶段二兜底切分          |
| 构建 Embedding | `HuggingFaceTransformersEmbeddings` | `@langchain/community`  | nomic-embed-text-v1.5，本地运行 |
| 向量存储       | 自定义 `SQLiteVectorStore`       | `@langchain/core`          | 实现 VectorStore 接口   |
| 检索           | `VectorStore.asRetriever()`      | `@langchain/core`          | 余弦相似度检索          |
| 上下文构建     | `ChatPromptTemplate`             | `@langchain/core`          | 组装 context + question |
| 回答生成       | `ChatAnthropic`                  | `@langchain/anthropic`     | Claude API 调用         |

### 安装依赖

```bash
# apps/server 依赖
bun add langchain @langchain/core @langchain/anthropic @langchain/textsplitters @langchain/community @xenova/transformers
```

### LangChain 1.3.4 关键 API 变更

```typescript
// 1. ChatAnthropic 初始化（@langchain/anthropic）
import { ChatAnthropic } from '@langchain/anthropic';

const llm = new ChatAnthropic({
    model: 'claude-sonnet-4-6',
    apiKey: process.env.ANTHROPIC_API_KEY,
    temperature: 0,
    maxTokens: 2048,
});

// 2. Transformers.js Embeddings（@langchain/community）
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';

const embeddings = new HuggingFaceTransformersEmbeddings({
    model: 'nomic-ai/nomic-embed-text-v1.5',
});

// 3. RecursiveCharacterTextSplitter（@langchain/textsplitters）
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const splitter = RecursiveCharacterTextSplitter.fromLanguage('typescript', {
    chunkSize: 1500,
    chunkOverlap: 200,
});

// 4. ChatPromptTemplate（@langchain/core）
import { ChatPromptTemplate } from '@langchain/core/prompts';

const prompt = ChatPromptTemplate.fromMessages([
    ['system', SYSTEM_PROMPT],
    [
        'human',
        '以下是代码库中的相关代码片段：\n\n{context}\n\n---\n\n用户问题：{question}\n\n请基于以上代码回答问题。',
    ],
]);

// 5. 链式调用
const chain = prompt.pipe(llm);

// 6. 调用
const result = await chain.invoke({
    context: formattedContext,
    question: userQuestion,
});
```

### 自定义 SQLite VectorStore

基于 `@langchain/core` 的 VectorStore 接口实现：

```typescript
import { VectorStore } from '@langchain/core/vectorstores';
import { Document } from '@langchain/core/documents';
import type { Embeddings } from '@langchain/core/embeddings';

class SQLiteVectorStore extends VectorStore {
    // 核心方法
    async addVectors(vectors: number[][], documents: Document[]): Promise<void>;
    async similaritySearchVectorWithScore(
        query: number[],
        k: number,
    ): Promise<[Document, number][]>;
    async delete(params: { ids: string[] }): Promise<void>;

    // 辅助方法
    static async fromTexts(
        texts: string[],
        metadatas: object[],
        embeddings: Embeddings,
    ): Promise<SQLiteVectorStore>;
}
```

内部实现直接操作 embeddings 表，检索时从 SQLite 读取全部向量并内存计算余弦相似度。

---

## 四、前端详细设计

## 4.1 页面结构

```text
/repos
┌──────────────────────────────────────────────────────┐
│ RepoManagementPage                                   │
│  - RepoInput（添加仓库）                             │
│  - RepoList（状态、删除、重载）                      │
└──────────────────────────────────────────────────────┘

/chat
┌──────────────────────────────────────────────────────┐
│ ChatPage                                             │
│  - RepoSelector（显示全部仓库；仅 indexed 可选）      │
│  - ChatMessageList（按 repo_id 隔离历史）            │
│  - ChatInput（仅 indexed 可用）                      │
│  - ClearHistoryButton（清空当前仓库历史）            │
└──────────────────────────────────────────────────────┘
```

布局规范：

- 两个页面共享顶部导航（`/repos`、`/chat`）
- 页面内容区最小宽度 1024px
- Chat 页消息区与输入区纵向布局，消息区可滚动

## 4.2 Jotai Atom 设计

### repo.atom.ts

```typescript
// 当前仓库信息
const repoAtom = atom<Repo | null>(null);

// 仓库状态派生
const repoStatusAtom = atom((get) => get(repoAtom)?.status ?? 'idle');

// 是否已索引（控制问答功能可用性）
const isIndexedAtom = atom((get) => get(repoAtom)?.status === 'indexed');
```

### chat.atom.ts

```typescript
// 每仓库独立的对话消息列表
const messagesByRepoAtom = atom<Record<string, Message[]>>({});

// 当前输入的问题
const currentQuestionAtom = atom<string>('');

// 是否正在等待回答
const isAskingAtom = atom<boolean>(false);

// 当前选中的仓库（由 localStorage 恢复默认值）
const selectedRepoIdAtom = atom<string | null>(null);
```

### 类型定义

前端类型从 `@repo/types` 引入，无需本地重复定义：

```typescript
import type { Repo, Message, Reference } from '@repo/types';
import type { RepoStatus } from '@repo/types';
```

## 4.3 TanStack Query Hooks

### use-repo.ts

```typescript
import type {
    CreateRepoRequest,
    IndexStatusData,
} from '@repo/types';

// 创建仓库（新主流程）
const useCreateRepo = () =>
    useMutation({
        mutationFn: (params: CreateRepoRequest) => repoApi.create(params),
        onSuccess: (data) => {
            /* 刷新仓库列表 */
        },
    });

// 删除仓库
const useDeleteRepo = () =>
    useMutation({
        mutationFn: (repoId: string) => repoApi.remove(repoId),
    });

// 重载仓库
const useReloadRepo = () =>
    useMutation({
        mutationFn: (repoId: string) => repoApi.reload(repoId),
    });

// 查询仓库状态（仓库管理页轮询）
const useRepoStatus = (repoId: string | null) =>
    useQuery({
        queryKey: ['repoStatus', repoId],
        queryFn: () => repoApi.status(repoId!),
        enabled: !!repoId,
        refetchInterval: (query) => {
            return (query.state.data as IndexStatusData)?.status === 'indexing'
                ? 2000
                : false;
        },
    });

// 清空某仓库聊天历史
const useClearRepoChatHistory = () =>
    useMutation({
        mutationFn: (repoId: string) => chatApi.clearHistory(repoId),
    });
```

### use-ask.ts

```typescript
import type { AskRequest } from '@repo/types';

// 提交问题
const useAskQuestion = () =>
    useMutation({
        mutationFn: (params: AskRequest) => askApi.ask(params),
        onMutate: () => {
            /* 设置 isAskingAtom = true */
        },
        onSettled: () => {
            /* 设置 isAskingAtom = false */
        },
    });
```

## 4.4 关键组件设计

### ChatMessage

- 用户消息：右侧气泡，纯文本
- 助手消息：左侧，Markdown 渲染（react-markdown + remark-gfm）
- 代码块：Shiki 高亮，带语言标签和复制按钮

### CodeReference

- 每条引用以可折叠卡片展示
- 卡片头部：文件路径 + 相似度分数
- 展开内容：Shiki 高亮的代码片段
- 代码行号：显示 start_line 到 end_line 范围

### RepoInput

- 输入框：支持本地路径或 Git URL
- 类型自动检测：输入以 http/git@ 开头则 type=git，否则 type=local
- 添加按钮：点击后调用 useCreateRepo

### RepoStatus

- 状态指示：idle（灰色）/ loaded（黄色）/ indexing（蓝色+动画）/ indexed（绿色）/ failed（红色）
- 索引构建按钮：仅在 loaded 状态可用
- 统计信息：文件数、chunk 数

## 4.5 路由

采用双页面路由，分离仓库管理与聊天：

- `/repos`：仓库管理页（添加、删除、重载）
- `/chat`：聊天页（仓库选择、问答、手动清空当前仓库历史）

聊天页仓库选择规则：

- 下拉展示全部仓库
- 仅 `indexed` 状态项可选可提问，`loaded/indexing/failed` 状态项显示为禁用
- 默认选中仓库来自前端 `localStorage.lastOpenedRepoId`

```typescript
<Routes>
  <Route path="/repos" element={<RepoManagementPage />} />
  <Route path="/chat" element={<ChatPage />} />
</Routes>
```

---

## 五、共享包详细设计

## 5.1 @repo/types — 共享类型定义

前后端共享类型位于 `packages/types/src/`，通过 workspace 引用。

> 原则：只放前后端都需要用到的类型。纯后端内部模型（如 `ChunkData`）留在 `apps/server/src/types/` 中，不放入共享包。

### api.ts — 统一响应 & 请求/响应类型

```typescript
// ===== 统一响应结构 =====

export interface ApiResponse<T = unknown> {
    code: number;
    message: string;
    data: T | null;
}

// 成功响应的工具类型
export type ApiSuccess<T> = ApiResponse<T> & { code: 0; data: T };

// 错误响应的工具类型
export type ApiErrorResponse = ApiResponse<null> & {
    code: ErrorCode;
    data: null;
};

// ===== 请求类型 =====

export interface ImportRepoRequest {
    path: string;
    type: 'local' | 'git';
}

export interface CreateRepoRequest {
    source_type: 'local' | 'git';
    source_value: string;
    auto_reload?: boolean;
}

export interface BuildIndexRequest {
    repo_id: string;
}

export interface AskRequest {
    repo_id: string;
    question: string;
    top_k?: number;
}

// ===== 响应 data 类型（成功时 data 字段的实际结构）=====

export interface ImportRepoData {
    repo_id: string;
    file_count: number;
    status: 'loaded';
}

export interface BuildIndexData {
    repo_id: string;
    chunk_count: number;
    status: 'indexing';
}

export interface IndexStatusData {
    repo_id: string;
    status: RepoStatus;
    chunk_count: number;
    file_count: number;
}

export interface AskData {
    answer: string;
    references: Reference[];
}

export interface DeleteRepoData {
    repo_id: string;
    deleted: true;
}

export interface ClearRepoChatHistoryData {
    repo_id: string;
    cleared: true;
}
```

### models.ts — 前后端共用数据模型

```typescript
export interface Repo {
    id: string;
    path: string;
    type: 'local' | 'git';
    status: RepoStatus;
    fileCount: number;
    chunkCount: number;
}

export interface Reference {
    chunk_id: string;
    file_path: string;
    snippet: string;
    score: number;
}

// Message 仅前端使用，但放入共享包便于未来多轮对话扩展后端也需用到
export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    references?: Reference[];
    timestamp: number;
}
```

### enums.ts — 枚举常量

```typescript
export type RepoStatus = 'idle' | 'loaded' | 'indexing' | 'indexed' | 'failed';

export type ChunkType = 'function' | 'class' | 'generic';

export type RepoType = 'local' | 'git';

// 错误码：分段设计，1xxx=仓库，2xxx=索引，3xxx=检索，4xxx=外部API，5xxx=系统
export const ErrorCode = {
    SUCCESS: 0,
    REPO_LOAD_FAILED: 1001,
    REPO_ALREADY_EXISTS: 1002,
    REPO_NOT_FOUND: 1003,
    REPO_RELOADING: 1004,
    INDEX_NOT_BUILT: 2001,
    INDEX_ALREADY_EXISTS: 2002,
    NO_RELEVANT_CODE: 3001,
    EMBEDDING_FAILED: 4001,
    LLM_FAILED: 4002,
    INTERNAL_ERROR: 5000,
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
```

### index.ts — 统一导出

```typescript
export * from './api';
export * from './models';
export * from './enums';
```

## 5.2 @repo/api-client — 前端 API 请求客户端

封装所有后端 API 调用，前端通过此包统一调用，避免直接写 fetch：

### client.ts — 基础客户端

```typescript
import type { ApiResponse, ErrorCode } from '@repo/types';

const DEFAULT_BASE_URL = 'http://localhost:5001';

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl = DEFAULT_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    async request<T>(path: string, options?: RequestInit): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        const body: ApiResponse<T> = await res.json();

        if (body.code !== 0) {
            throw new ApiError(body.code as ErrorCode, body.message);
        }

        return body.data as T;
    }

    get<T>(path: string) {
        return this.request<T>(path, { method: 'GET' });
    }

    post<T>(path: string, body: unknown) {
        return this.request<T>(path, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }
}

export class ApiError extends Error {
    constructor(public code: ErrorCode, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

export const apiClient = new ApiClient();
```

### repo.ts / index-api.ts / ask.ts — 分模块 API 方法

```typescript
// repo.ts
import type {
    ImportRepoRequest,
    ImportRepoData,
    CreateRepoRequest,
    DeleteRepoData,
    Repo,
    BuildIndexData,
    IndexStatusData,
} from '@repo/types';
import { apiClient } from './client';

export const repoApi = {
    // 兼容旧导入接口（逐步废弃）
    import: (params: ImportRepoRequest) =>
        apiClient.post<ImportRepoData>('/api/repo/import', params),
    // 新仓库管理接口
    create: (params: CreateRepoRequest) =>
        apiClient.post<ImportRepoData>('/api/repos', params),
    list: () => apiClient.get<Repo[]>('/api/repos'),
    remove: (repoId: string) =>
        apiClient.delete<DeleteRepoData>(`/api/repos/${repoId}`),
    reload: (repoId: string) =>
        apiClient.post<BuildIndexData>(`/api/repos/${repoId}/reload`, {}),
    status: (repoId: string) =>
        apiClient.get<IndexStatusData>(`/api/repos/${repoId}/status`),
};

// index-api.ts
import type {
    BuildIndexRequest,
    BuildIndexData,
    IndexStatusData,
} from '@repo/types';
import { apiClient } from './client';

export const indexApi = {
    build: (params: BuildIndexRequest) =>
        apiClient.post<BuildIndexData>('/api/index/build', params),
    status: (repoId: string) =>
        apiClient.get<IndexStatusData>(`/api/index/status?repo_id=${repoId}`),
};

// ask.ts
import type { AskRequest, AskData } from '@repo/types';
import { apiClient } from './client';

export const askApi = {
    ask: (params: AskRequest) => apiClient.post<AskData>('/api/ask', params),
};

// chat.ts
import type { ClearRepoChatHistoryData } from '@repo/types';
import { apiClient } from './client';

export const chatApi = {
    clearHistory: (repoId: string) =>
        apiClient.delete<ClearRepoChatHistoryData>(
            `/api/repos/${repoId}/chat-history`,
        ),
};
```

## 5.3 @repo/constants — 共享常量

### file-extensions.ts

```typescript
export const SUPPORTED_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.py',
    '.go',
    '.rs',
    '.java',
    '.rb',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.cs',
    '.php',
    '.swift',
    '.kt',
]);
```

### ignore-patterns.ts

```typescript
export const IGNORED_DIRECTORIES = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '__pycache__',
    '.next',
    'vendor',
    '.venv',
    'target',
    'bin',
    'obj',
]);

export const IGNORED_FILE_PATTERNS = [
    /\.lock$/,
    /\.min\.(js|css)$/,
    /\.map$/,
    /\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/,
];
```

### chunking.ts

```typescript
export const CHUNK_MAX_LENGTH = 1500;
export const CHUNK_OVERLAP = 200;
export const EMBEDDING_BATCH_SIZE = 2048;
```

### retrieval.ts

```typescript
export const DEFAULT_TOP_K = 5;
export const MAX_CONTEXT_TOKENS = 8000;
```

---

## 5.4 包引用示例

后端（apps/server）引用共享包：

```typescript
// apps/server/src/services/repo.service.ts
import type { ImportRepoRequest, ImportRepoData } from '@repo/types';
import { ErrorCode } from '@repo/types';
import {
    SUPPORTED_EXTENSIONS,
    IGNORED_DIRECTORIES,
    IGNORED_FILE_PATTERNS,
} from '@repo/constants';

// 后端内部类型（仅后端使用，不放入共享包）
// apps/server/src/types/index.ts
interface ChunkData {
    chunk_id: string;
    content: string;
    file_path: string;
    metadata: {
        type: ChunkType;
        name: string | null;
    };
    start_line?: number;
    end_line?: number;
}
```

前端（apps/web）引用共享包：

```typescript
// apps/web/src/hooks/use-ask.ts
import { askApi } from '@repo/api-client';
import type { AskRequest, AskData, Message } from '@repo/types';
import { DEFAULT_TOP_K } from '@repo/constants';
```

---

## 六、环境变量

```bash
# .env.example

# LLM
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_BASE_URL=

# Server
PORT=5001
HOST=0.0.0.0

# Database
DB_PATH=./data/codebase-rag.db

# Embedding Model
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
EMBEDDING_DIMENSION=768

# LLM Model
LLM_MODEL=claude-sonnet-4-6

# Chunking
CHUNK_MAX_LENGTH=1500
CHUNK_OVERLAP=200

# Retrieval
DEFAULT_TOP_K=5
MAX_CONTEXT_TOKENS=8000
```

---

## 七、错误处理规范

## 7.1 错误码体系

错误码分段设计，定义在 `@repo/types` 的 `ErrorCode` 中：

| 错误码 | 枚举值               | 含义                         | 前端处理           |
| ------ | -------------------- | ---------------------------- | ------------------ |
| 0      | SUCCESS              | 成功                         | -                  |
| 1001   | REPO_LOAD_FAILED     | 仓库加载失败                 | 提示用户检查路径   |
| 1002   | REPO_ALREADY_EXISTS  | 仓库已存在                   | 提示并询问是否重载 |
| 1003   | REPO_NOT_FOUND       | 仓库不存在或已删除           | 刷新列表并提示重选 |
| 1004   | REPO_RELOADING       | 仓库重载中                   | 提示稍后重试       |
| 2001   | INDEX_NOT_BUILT      | 索引未构建                   | 引导用户构建索引   |
| 2002   | INDEX_ALREADY_EXISTS | 索引已存在                   | 提示已索引         |
| 3001   | NO_RELEVANT_CODE     | 无相关代码                   | 返回默认回答       |
| 4001   | EMBEDDING_FAILED     | Embedding 模型加载/推理失败  | 提示服务暂不可用   |
| 4002   | LLM_FAILED           | LLM API 调用失败             | 提示服务暂不可用   |
| 5000   | INTERNAL_ERROR       | 内部错误                     | 提示系统异常       |

## 7.2 后端统一响应封装

```typescript
import { ErrorCode } from '@repo/types';
import type { ApiResponse } from '@repo/types';

function success<T>(
    data: T,
    message = 'success',
): ApiResponse<T> & { code: 0 } {
    return { code: 0, message, data };
}

function fail(code: ErrorCode, message: string): ApiResponse<null> {
    return { code, message, data: null };
}

// Elysia 全局 error handler
app.onError(({ error: err }) => {
    if (err instanceof AppError) {
        return fail(err.code, err.message);
    }
    return fail(ErrorCode.INTERNAL_ERROR, '服务器内部错误');
});
```

## 7.3 前端错误处理

- `@repo/api-client` 的 `ApiClient.request` 统一解包 `ApiResponse`：成功返回 `data`，失败抛出 `ApiError`
- TanStack Query 的 `onError` 回调捕获 `ApiError`，按 `code` 展示对应中文提示
- 网络错误（fetch 失败）：显示重试按钮

---

## 八、性能考量

## 8.1 后端

基线环境假设：4C8G、稳定外网、无外部 API 限流。

| 场景                     | SLO 目标（P95）      | 方案                             |
| ------------------------ | -------------------- | -------------------------------- |
| 代码库导入               | 1000 文件内 < 8s     | 并行读取文件，Bun 原生文件 IO    |
| 代码切分                 | 1000 文件内 < 15s    | Tree-sitter 并行解析             |
| 向量检索                 | 10000 向量内 < 800ms | 内存计算余弦相似度，避免磁盘 IO  |
| 问答端到端（含外部 LLM） | < 20s                | 检索裁剪上下文 + Claude API 调用 |

## 8.2 前端

| 场景          | 方案                                   |
| ------------- | -------------------------------------- |
| 代码高亮渲染  | Shiki 使用 Web Worker 避免主线程阻塞   |
| 长对话列表    | 虚拟滚动（MVP 阶段可省略，对话量有限） |
| Markdown 渲染 | react-markdown 按需加载 remark 插件    |

---

## 九、测试策略

## 9.1 后端测试

| 层级     | 工具                   | 覆盖范围                                          |
| -------- | ---------------------- | ------------------------------------------------- |
| 单元测试 | Bun 内置 test          | SplitterService、RetrievalService、余弦相似度计算 |
| 集成测试 | Bun test + 临时 SQLite | RepoService 导入流程、AskService 完整链路         |
| API 测试 | Elysia edict / fetch   | 各 API 端点请求/响应/错误码                       |

关键测试用例：

1. 导入本地代码库 → code: 0，data.status 为 loaded
2. 导入不存在的路径 → code: 1001 (REPO_LOAD_FAILED)
3. 构建索引 → chunks 和 embeddings 表有数据
4. 语义切分 → 识别出函数/类类型的 chunk
5. 超长 chunk 二次切分 → 不超过 max_length
6. 向量检索 → 返回 top_k 结果且按相似度降序
7. 问答 → code: 0，data 包含 answer 和至少一条 reference
8. 未索引时问答 → code: 2001 (INDEX_NOT_BUILT)
9. 无关问题 → code: 3001 (NO_RELEVANT_CODE)
10. 协议一致性 → 所有失败响应均为 `{code,message,data:null}`
11. 引用可追溯 → `references[].chunk_id` 均可在 chunks 表找到对应记录
12. 索引状态机 → 仅允许 `loaded -> indexing -> indexed|failed` 的状态流转

## 9.2 前端测试

| 层级      | 工具                     | 覆盖范围                              |
| --------- | ------------------------ | ------------------------------------- |
| 组件测试  | Vitest + Testing Library | RepoInput、ChatMessage、CodeReference |
| Hook 测试 | Vitest + renderHook      | useCreateRepo、useReloadRepo、useAskQuestion、useClearRepoChatHistory |

---

## 十、开发与部署

## 10.1 本地开发

```bash
# 安装依赖
bun install

# 同时启动前后端
bun run dev

# 仅启动后端（开发模式，热重载）
bun run dev:server

# 仅启动前端（开发模式，HMR）
bun run dev:web

# 类型检查
bun run typecheck
```

## 10.2 构建生产

```bash
# 构建所有 packages + 前端
bun run build

# 后端无需构建，Bun 直接运行 TypeScript
```

## 10.3 运行环境要求

- Bun >= 1.1
- Node.js >= 20（仅 Shiki 编译需要，运行时无需）
- 磁盘空间：SQLite 数据库约 10MB/1000 chunks
- 内存：向量检索阶段需加载全部 embedding 到内存，约 3MB/1000 chunks（768 维 × 4 bytes）；nomic-embed-text-v1.5 模型加载约 600MB

---

## 十一、扩展预留

PRD 明确不实现但设计需预留的能力：

| 扩展能力         | 当前设计预留点                                               |
| ---------------- | ------------------------------------------------------------ |
| 自动代码修改     | AskService 返回结构可扩展 action 字段                        |
| 复杂代码关系分析 | chunks 表可扩展 graph_relations 字段                         |
| 多轮对话         | messagesAtom 已支持消息列表，后端可扩展 session_id           |
| 流式输出         | Elysia 支持 stream，前端可切至 stream parser                 |
| 向量库替换       | RetrievalService 接口隔离，可替换底层实现为 ChromaDB/hnswlib |
| 多仓库查询       | repos 表支持多记录，API 加 repo_id 参数隔离                  |

---

## 结束
