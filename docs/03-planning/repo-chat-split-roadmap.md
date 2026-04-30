# PRD/TRD 增量需求开发路线图（仓库管理页 + 聊天页分离）

基于最新 `docs/01-product/PRD.md` 与 `docs/02-technical/TRD.md` 的增量需求，按依赖关系将实施工作拆分为 5 个阶段。

## 原则

- 需求以 PRD 第十一章为准，技术细节以 TRD 追加接口与前端设计为准
- 后端接口与错误码先行，前端页面与交互后行
- 每个 Task 必须具备可验证验收口径，避免“完成但不可测”
- 保持增量兼容：旧能力可保留短期兼容层，但新流程必须走 `/api/repos*`

## 执行原则

- 每个 Task 必须先补齐测试用例（先红），再进行功能开发（后绿）；开发阶段应避免针对测试用例“对题作答”。
- 每完成一个 Task，AI 需立即更新对应的 checkbox 状态，并在会话结束前同步更新 memory。
- 每完成一个 Task 后，提交一次独立的 `git commit`（保持单任务单提交）
- 如果对Task有不明确的地方，必须先与用户沟通后再进行开发
- 安装依赖时，如非必要避免加到仓库根目录；应尽量安装到对应的 `app` 或 `package` 目录中。
- 若与现有行为冲突，以“文档对齐后再实现”为前置条件
- 新增错误场景必须同步更新前后端错误处理映射

---

## Phase 1：后端仓库管理接口落地

> 目标：完成仓库管理核心 API（创建、列表、删除、重载、状态、清空历史）及约束

- [x] **P1-1** | TRD §3.1.7 | 实现 `POST /api/repos`（`source_type/source_value/auto_reload`） | 验收：创建成功返回 `code=0` 且包含 `repo_id`
- [x] **P1-2** | TRD §3.1.7 | 实现仓库唯一约束（`source_type + source_value`）与 `1002` 返回 | 验收：重复添加返回 `REPO_ALREADY_EXISTS`
- [x] **P1-3** | TRD §3.1.7 | 实现 `GET /api/repos`（返回全部仓库与状态） | 验收：可返回 `loaded/indexing/indexed/failed` 混合状态列表
- [x] **P1-4** | TRD §3.1.7 | 实现 `DELETE /api/repos/:repo_id` 级联删除（含聊天历史） | 验收：删除后 repo/chunks/embeddings/chat-history 均不可查
- [x] **P1-5** | TRD §3.1.7 | 实现 `POST /api/repos/:repo_id/reload` 异步重载 | 验收：成功立即返回 `status=indexing`
- [x] **P1-6** | TRD §3.1.7 | 重载并发冲突处理（正在 indexing 返回 `1004`，不排队） | 验收：重复触发 reload 返回 `REPO_RELOADING`
- [x] **P1-7** | TRD §3.1.7 | 实现 `GET /api/repos/:repo_id/status` | 验收：轮询可观测 `indexing -> indexed|failed`
- [x] **P1-8** | TRD §3.1.7 | 实现 `DELETE /api/repos/:repo_id/chat-history` | 验收：仅清空当前仓库历史，不影响仓库记录

**Phase 1 完成标志**：`/api/repos*` 新接口全量可用，错误码 `1002/1003/1004` 行为与 TRD 一致。

---

## Phase 2：共享契约与服务层对齐

> 目标：统一 types、api-client、service 状态机，避免新旧接口并存导致语义漂移

- [x] **P2-1** | TRD §5.1 | 更新 `@repo/types`：新增 `CreateRepoRequest`、`DeleteRepoData`、`ClearRepoChatHistoryData` | 验收：类型检查通过
- [x] **P2-2** | TRD §5.1/§7.1 | 更新 `ErrorCode` 枚举：`REPO_NOT_FOUND(1003)`、`REPO_RELOADING(1004)` | 验收：前后端可共享引用
- [x] **P2-3** | TRD §5.2 | 更新 `@repo/api-client`：`repoApi.create/list/remove/reload/status`、`chatApi.clearHistory` | 验收：客户端方法与路由 1:1 对齐
- [x] **P2-4** | PRD §11.4.2 | 调整 `/api/ask` 前置校验（repo 不存在/未索引/重载中） | 验收：返回预期业务错误码与 message
- [x] **P2-5** | TRD §3.2 | 仓储层与 schema 对齐（`repos.status` 含 `failed`、唯一约束、`updated_at`） | 验收：迁移后读写与约束生效

**Phase 2 完成标志**：共享包与后端实现契约一致，前端可直接按新类型接入。

---

## Phase 3：前端页面拆分与主流程改造

> 目标：从旧单页流程切到 `/repos` + `/chat` 双页面流程

- [ ] **P3-1** | PRD §11.2 / TRD §4.5 | 引入路由并新增页面：`/repos`、`/chat` | 验收：可导航切换且刷新不丢路由
- [ ] **P3-2** | PRD §11.3 | 仓库管理页实现列表、添加、删除、重载 | 验收：四类操作均可触发并反馈状态
- [ ] **P3-3** | PRD §11.4.1 | 聊天页实现仓库选择器（展示全部，禁用 `indexing/failed`） | 验收：禁用项不可发问
- [ ] **P3-4** | PRD §11.4.1 | 默认仓库恢复：`localStorage.lastOpenedRepoId` | 验收：刷新后恢复上次仓库
- [ ] **P3-5** | PRD §11.4.3 | 对话按仓库隔离（`messagesByRepoAtom`） | 验收：切换仓库可恢复各自历史
- [ ] **P3-6** | PRD §11.4.3 | 增加“清空当前仓库聊天历史”交互 | 验收：清空后仅当前仓库历史被移除
- [ ] **P3-7** | PRD §11.3.2 | 重复添加交互：收到 `1002` 后弹窗询问是否重载 | 验收：确认后调用 reload，取消则不触发

**Phase 3 完成标志**：用户可在管理页维护仓库，在聊天页按仓库上下文稳定提问。

---

## Phase 4：错误体验与可观测性完善

> 目标：让新增错误场景可理解、可恢复、可追踪

- [ ] **P4-1** | TRD §7.1 | 前端统一错误映射：`1002/1003/1004/2001/3001` | 验收：各错误有明确中文提示与下一步操作
- [ ] **P4-2** | PRD §11.6 | 删除不存在仓库、重载冲突、未索引提问等边界提示优化 | 验收：无“静默失败”
- [ ] **P4-3** | docs/06-operations | 记录关键事件日志：create/delete/reload/clear-history/ask-failed | 验收：日志字段可关联 `repo_id`
- [ ] **P4-4** | TRD §3.1.7 | 状态轮询与按钮禁用联动 | 验收：indexing 阶段防重复操作

**Phase 4 完成标志**：错误行为一致、可解释，运维可通过日志定位关键路径。

---

## Phase 5：测试与验收回归

> 目标：补齐新增需求测试矩阵并完成 PRD 增量验收

- [ ] **P5-1** | 后端 API 测试 | 覆盖 `/api/repos*` 全接口成功/失败分支 | 验收：包含 1002/1003/1004 用例
- [ ] **P5-2** | 后端集成测试 | 覆盖“删除仓库级联删除聊天历史”与“清空聊天历史” | 验收：数据库与历史状态一致
- [ ] **P5-3** | 前端组件测试 | 覆盖 RepoManagementPage、RepoSelector、ClearHistoryButton | 验收：禁用与确认流程可测
- [ ] **P5-4** | 前端 Hook 测试 | 覆盖 `useCreateRepo/useReloadRepo/useClearRepoChatHistory/useAskQuestion` | 验收：loading/error/success 状态完整
- [ ] **P5-5** | 验收脚本回归 | 新增“多仓库切换、重复添加提示重载、localStorage 恢复”验收用例 | 验收：PRD §11.7 九项全部通过

**Phase 5 完成标志**：新增需求可回归、可验收、可发布。

---

## 阶段依赖关系

```text
Phase 1（后端接口）
  └─→ Phase 2（共享契约）
       └─→ Phase 3（前端双页面与交互）
            └─→ Phase 4（错误体验与可观测）
                 └─→ Phase 5（测试与验收回归）
```

## 工期估算

| 阶段 | Task 数 | 预估会话数 | 风险点 |
| ---- | ------- | ---------- | ------ |
| Phase 1 | 8 | 2-3 | 重载并发状态机、级联删除一致性 |
| Phase 2 | 5 | 1-2 | 新旧接口兼容期的类型漂移 |
| Phase 3 | 7 | 2-3 | 路由切换与仓库级消息状态同步 |
| Phase 4 | 4 | 1-2 | 错误提示覆盖不完整、日志字段不统一 |
| Phase 5 | 5 | 2-3 | 验收用例覆盖面与稳定性 |
| **合计** | **29** | **8-13** | |

---

## 变更记录

- 2026-04-29：初始化该路线图，基于 PRD 第十一章与 TRD 追加接口重建阶段与任务拆分。
- 2026-04-30：完成 P1-1，新增 `POST /api/repos` 接口（含 `source_type/source_value/auto_reload`）并通过路由测试验收。
- 2026-04-30：完成 P1-2，落地 `source_type + source_value` 唯一约束，重复创建返回 `1002(REPO_ALREADY_EXISTS)`。
- 2026-04-30：完成 P1-3，新增 `GET /api/repos` 并验证可返回 `loaded/indexing/indexed/failed` 混合状态列表。
- 2026-04-30：完成 P1-4，新增 `DELETE /api/repos/:repo_id`，并验证删除后 `repo/chunks/embeddings/chat-history` 均不可查。
- 2026-04-30：完成 P1-5，新增 `POST /api/repos/:repo_id/reload` 异步重载接口并验证立即返回 `status=indexing`。
- 2026-04-30：完成 P1-6，补齐 reload 并发冲突处理：仓库 `indexing` 时返回 `1004(REPO_RELOADING)` 且不排队。
- 2026-04-30：完成 P1-7，新增 `GET /api/repos/:repo_id/status`，支持轮询查询单仓库状态与计数信息。
- 2026-04-30：完成 P1-8，新增 `DELETE /api/repos/:repo_id/chat-history`，并验证仅清空当前仓库历史不影响其他仓库。
- 2026-04-30：完成 P2-1，更新 `@repo/types` 新增 `CreateRepoRequest`、`DeleteRepoData`、`ClearRepoChatHistoryData`，并通过 `@repo/types` 类型检查。
- 2026-04-30：完成 P2-2，统一测试侧错误码引用为 `ErrorCode.REPO_NOT_FOUND/REPO_RELOADING`，验证前后端共享枚举可直接引用。
- 2026-04-30：完成 P2-3，更新 `@repo/api-client` 增加 `repoApi.create/list/remove/reload/status` 与 `chatApi.clearHistory`，并通过 `@repo/web` 回归测试。
- 2026-04-30：完成 P2-4，补齐 `/api/ask` 对仓库不存在/重载中/未索引三类前置校验，返回 `1003/1004/2001` 业务错误码与对应提示。
- 2026-04-30：完成 P2-5，仓储 schema 新增 `repos.updated_at` 并将仓储层读写/更新语句对齐，验证唯一约束与更新时间字段生效。
- 2026-04-30：Phase 2 收尾修复：补齐老库 `repos.updated_at` 自动迁移，统一 `/api/index` 缺仓库错误码为 `1003(REPO_NOT_FOUND)`，并同步更新测试命名与断言。
