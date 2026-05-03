---
name: cursor-neat-freak
description: >
  End-of-session knowledge cleanup for Cursor IDE — reconciles .cursor/rules,
  .cursorrules when present, .cursor/skills and .agents/skills when present,
  AGENTS.md / CLAUDE.md, README.md,
  docs/, and project-declared MCP docs against the code.
  MUST trigger on: "sync up", "tidy up docs", "update memory", "clean up docs",
  "/sync", "/neat", "cursor neat", "同步一下", "整理文档", "整理一下", "更新记忆",
  "梳理一下", "收尾", "这个阶段做完了", "新人能直接上手", or stale docs / handoff requests.
  Use when the primary environment is Cursor.
---

# Cursor 洁癖 — Knowledge Base Neat-Freak (Cursor)

> **Cursor IDE 专用**：以**知识库编辑**的方式做收尾——审查全局、合并重复、修正过期、删除废弃；盘点与修改围绕 **Project Rules**（`.cursor/rules/*`、`.cursorrules`）、**根目录 `AGENTS.md` / `CLAUDE.md`**、**`.cursor/skills/`** 与 **`.agents/skills/`**（若有）、**MCP 配置** 与 **`docs/` / README** 展开。

你是**知识库编辑**：让 **Rules、Skills、项目说明 markdown、`docs/`、README** 与代码一致，并对下一个 Cursor 会话与接手的同事友好。

## 为什么这件事重要

在 Cursor 里，代码可以随时改，但 **Rules、Skills 和文档是跨会话、跨协作者的桥梁**。持久上下文分散在多个文件里，**最容易漏的是 Project Rules（`.cursor/rules/` 或 `.cursorrules`）及 `docs/` 未随代码更新**（含带 frontmatter 时 `description` 与正文脱节）。本 skill 强制把这些载体和 `docs/` 一起纳入同一套收尾流程。

## 关键概念：三层（Cursor）

**不要只改 `AGENTS.md` 就结束，忽略 Project Rules、`docs/` 或未盘点 Skills。**

| 位置                                                                  | 受众                    | 职责                                          | 不同步的代价                                |
| --------------------------------------------------------------------- | ----------------------- | --------------------------------------------- | ------------------------------------------- |
| **Cursor User Rules**（设置里，非仓库文件）                           | 所有项目的 Agent        | 个人偏好、跨项目红线                          | 默认不在本 skill 内改；仅用户明确要求时处理 |
| **`.cursor/rules/*` / `.cursorrules` + 根 `AGENTS.md` / `CLAUDE.md`** | 本仓库里的 Cursor Agent | 约定、globs、命令、环境变量与路由清单、短事实 | 下一会话走错路、误用旧命令                  |
| **`docs/` + `README.md`**                                             | 人类、下游、未来接手者  | 接入、架构、运维、交接、API                   | 外部无法正确接入或运维                      |

**受众不混**：`AGENTS.md` 里一条「路由清单」≠ `docs/` 里承担**对外接入 / 集成说明**的文档中「下游怎么调」——前者服务 Cursor 会话，后者服务人；具体文件名按 **[references/sync-matrix.md](references/sync-matrix.md)** 首节的职责映射。**两份都要对。**

路径与文件类型细节见 **[references/cursor-paths.md](references/cursor-paths.md)**。

## 执行流程

### 第一步：盘点现状（强制枚举）

**先 ls / glob，再判断。**

1. **Cursor 项目侧**
   - `ls <project-root>/.cursor/rules/ 2>/dev/null` → 每个规则文件必读（常见 `.mdc` / `.md`，含 frontmatter 若有）
   - 若存在：根目录 **`.cursorrules`**（或其它单文件规则）通读
   - `ls <project-root>/.cursor/skills/ 2>/dev/null` → 列出子目录，按需读 `SKILL.md`
   - `ls <project-root>/.agents/skills/ 2>/dev/null` → 同上（与 `.cursor/skills/` 可能并存，**两处都扫**）
   - 若存在：读 `.cursor/mcp.json`（或项目文档声明的 MCP 路径）
   - 若存在：扫 `.cursor/plans/` — 过期计划标「删 / 归档」
2. **项目根说明文件**
   - 读 `README.md`、`AGENTS.md`、若存在则 `CLAUDE.md`
3. **文档树**
   - `ls <project-root>/docs/ 2>/dev/null`（若有子目录，继续递归列全）
   - 若 `docs/` 存在：`find <project-root>/docs -name "*.md" 2>/dev/null` → 枚举 **整个** `docs/` 树（勿仅用 `maxdepth 2`，否则会漏 `docs/03-planning/*.md` 这类路径）；若不存在则跳过本行
   - `find <project-root> -maxdepth 2 -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*"` → 兜底抓根目录与浅层散落 `.md`
4. **回顾本次对话**

内部维护一张清单：每个文件标「已评估 / 要改 / 不用改」。**漏一个应盘点的 Rules 文件、Skills（`.cursor` / `.agents`）、或 `docs` 内 md 都算失败。**

### 第二步：识别变更

**用变更影响矩阵想「会波及哪些层」**。

完整映射表见 **[references/sync-matrix.md](references/sync-matrix.md)**。

**Cursor 增补**：

| 本次发生的事                         | 额外要看的层                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 改了命令 / 脚本入口 / pnpm workspace | `AGENTS.md` / `CLAUDE.md` + README；若规则里写了命令，更新对应规则文件（含 `.cursorrules`）                                |
| 改了路径、命名规范、只适用于某类文件 | 考虑拆/改 `.cursor/rules/*` 的 `globs` 与正文，避免 always-on 里堆过期细节                                                 |
| 新增 MCP 或改 tool 名                | `docs/` / runbook 中 MCP 章节 + 若 Rules 里写了工具名则更新                                                                |
| 新增可复用工作流                     | 评估是进 **`.cursor/skills/`**、**`.agents/skills/`** 还是进 `docs/`；`SKILL.md` 的 `description` 与正文一致且可被检索发现 |

**跨项目**：上游 API / 环境变量变了 → 下游仓库的 `docs/` 同样要改。

### 第三步：实际修改

必须 **Edit / Write / 删除** 真实文件，不能停在「我会怎么改」。

**顺序建议**：`docs/` 与 README → 根 `AGENTS.md` / `CLAUDE.md` → `.cursorrules`（若有）→ `.cursor/rules/*` → `.cursor/skills/` 与 `.agents/skills/`（若有）→ 清理 `.cursor/plans` 中明确过期的条目。**User Rules（全局）**：仅当用户在本对话中明确要求同步跨项目原则时再动（本机设置，谨慎）。

**编辑原则**：合并优于追加；删除优于保留；**绝对日期**（如 `2026-05-03`）；`docs/` 面向第一次读的人；不在 Rules 里粘贴整篇 architecture。

### 第四步：自检清单

- [ ] 第一步列出的每个文件已判定「不用改」或「已改」
- [ ] 每个带 frontmatter 的规则文件：`description` 与正文一致；若有 `globs` / `alwaysApply` 则仍正确；若有 **`.cursorrules`**，其内容与 `.cursor/rules/` 内文件无矛盾
- [ ] `AGENTS.md` / `CLAUDE.md` 中的路径、命令、环境变量在仓库中真实存在
- [ ] README 安装与运行步骤与代码一致
- [ ] 新增 API：**integration-guide + architecture**（若项目有这两类文档）
- [ ] 新增环境变量：**runbook + 根说明文件**
- [ ] 跨项目：下游 `docs/` 已对齐
- [ ] `grep -E "今天|昨天|刚刚|最近|上周|today|yesterday|recently"` 在已改文件中清零

### 第五步：变更摘要

在所有修改完成后输出：

```markdown
## Cursor 同步完成

### Rules / 说明文件

- 更新：…（原因）

### Skills / MCP / Plans

- …

### 文档变更（按项目分组）

- …

### 未处理

- …（需用户确认的原因）
```

只列有实际变更的项。

## 特殊情况

- **既无根目录 `AGENTS.md` / `CLAUDE.md`，也无 Project Rules（`.cursor/rules/` 内无规则文件且无 `.cursorrules`）**：若项目已有可运行代码，应创建最小可用的 `README` + 根说明；仍在早期探索可跳过，但在摘要中说明。
- **对话无新事实**：仍审查 Rules 与 `docs/` 是否过期、矛盾、含相对时间。
- **Rules 之间或与 `AGENTS.md` / `CLAUDE.md` 矛盾**：合并或删旧条；无法自动判断则列入「未处理」。

## 参考资料

- **[references/cursor-paths.md](references/cursor-paths.md)** — Cursor 载体路径速查
- **[references/sync-matrix.md](references/sync-matrix.md)** — 变更类型 → 文档层映射
