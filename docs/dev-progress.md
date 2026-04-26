# Codebase RAG Explorer Progress Log

## 记录规范
- 每次会话追加一条记录，不覆盖历史。
- 每条记录至少包含：完成内容、验证结果、问题风险、下一步。
- 只记录“已验证事实”，不要写模糊结论。

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
