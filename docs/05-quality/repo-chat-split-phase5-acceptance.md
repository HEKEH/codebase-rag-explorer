# Repo Chat Split Phase 5 验收记录（PRD §11.7）

## 范围与说明

- 范围：`PRD.md` 第 11.7 节追加验收标准（共 9 项）
- 目标：给出 Phase 5 的可追溯验收产物，明确每项对应实现与验证证据
- 执行日期：2026-04-30

## 11.7 九项逐条验收

| # | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 前端存在独立仓库管理页与聊天页，且可互相跳转 | 通过 | 页面实现：`apps/web/src/pages/ReposPage.tsx`、`apps/web/src/pages/ChatPage.tsx`；导航链接存在；测试：`apps/web/src/pages/repos-page.test.tsx`、`apps/web/src/pages/chat-page.test.tsx` |
| 2 | 仓库管理页可完成新增、删除、单仓库重载 | 通过 | 实现与交互：`apps/web/src/pages/ReposPage.tsx`；测试覆盖：`supports list, create, remove and reload actions` |
| 3 | 聊天页未选择仓库时不可提问，选择后可正常问答 | 通过 | `canAsk` 由选中仓库状态控制：`apps/web/src/pages/ChatPage.tsx`；问答流程测试：`isolates messages by repo...` |
| 4 | 问答结果严格限定在选中仓库范围内 | 通过 | 仓库维度消息状态：`messagesByRepoAtom` 使用于 `apps/web/src/pages/ChatPage.tsx`；测试：切换仓库后仅显示当前仓库消息 |
| 5 | 删除仓库后，聊天页不可继续使用该仓库提问 | 通过 | 后端删除行为与不存在错误码：`apps/server/src/routes/api-p0.route.test.ts`（`DELETE /api/repos/:repo_id` + `1003` 路径）；前端对 `1003` 错误提示已覆盖 |
| 6 | 重载期间状态可观测，完成后可恢复问答 | 通过 | 仓库状态轮询：`apps/web/src/pages/ReposPage.tsx`；测试：`polls indexing repo status and re-enables actions...` |
| 7 | 重复添加仓库时，前端可接收错误并弹“是否重载”确认 | 通过 | 重复添加 `1002` + confirm 分支：`apps/web/src/pages/ReposPage.tsx`；测试：确认/取消两分支均覆盖 |
| 8 | 刷新后恢复上次打开仓库（localStorage） | 通过 | `lastOpenedRepoId` 读写逻辑：`apps/web/src/pages/ChatPage.tsx`；测试：`restores selected repo from localStorage` |
| 9 | 每仓库聊天历史可保留并可手动清空；删除仓库会同步删除其历史 | 通过 | 前端按仓库隔离 + 清空：`apps/web/src/pages/ChatPage.tsx`；测试：`isolates messages by repo and clears only current repo history`、`does not clear history when confirm dialog is cancelled`；后端级联删除与按仓库清空：`apps/server/src/routes/api-p0.route.test.ts` |

## 执行记录

- 前端回归命令：
  - `bun run --filter @repo/web test src/hooks/use-rag-hooks.test.tsx src/pages/repos-page.test.tsx src/pages/chat-page.test.tsx`
  - 结果：3 files passed, 25 tests passed
- 后端回归命令：
  - `bun run --filter @repo/server test apps/server/src/routes/api-p0.route.test.ts`
  - 结果：server 测试集执行通过（50 passed, 0 failed），含 `/api/repos*` 相关分支与集成断言

## 结论

Phase 5 对应 PRD §11.7 的九项验收已具备代码与测试双重证据，满足“可回归、可验收、可发布”的交付口径。
