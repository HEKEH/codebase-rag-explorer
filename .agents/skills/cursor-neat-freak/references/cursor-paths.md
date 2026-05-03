# Cursor 知识载体路径速查

在 **Cursor IDE** 里执行「盘点」时用这张表。Cursor **没有**独立的多文件「记忆索引」目录；**持久化上下文主要来自 Rules、项目说明 markdown、Skills 与 MCP 配置**。

## 项目内（仓库根）

| 用途                           | 路径                                                  | 备注                                                                                                                               |
| ------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Project Rules**              | `.cursor/rules/` 下 `*.mdc`、`*.md`（以仓库实际为准） | 常见为 `.mdc`（YAML frontmatter：`description`、`globs`、`alwaysApply`）。短、可组合；易与代码不同步。                             |
| **旧式单文件规则（若存在）**   | 根目录 `.cursorrules` 或项目文档约定的单文件          | 仍纳入盘点；与 `.cursor/rules` 内文件勿重复矛盾。                                                                                  |
| **项目级 Agent 说明**          | 根目录 `AGENTS.md`                                    | Cursor 会读；适合「本仓库约定、命令、红线、事实清单」。可与 `CLAUDE.md` 并存（团队混用时）。                                       |
| **Claude 风格项目说明**        | 根目录 `CLAUDE.md`（若存在）                          | 若仓库为兼容多工具而保留，同步时与 `AGENTS.md` 二选一主维护或互相引用，避免两处矛盾。                                              |
| **项目 Skills（Cursor 目录）** | `.cursor/skills/<name>/SKILL.md`                      | 与本仓库一起版本化；改工作流时记得更新对应 SKILL。                                                                                 |
| **项目 Skills（Agents 目录）** | `.agents/skills/<name>/SKILL.md`                      | 部分仓库将技能放在此处；与 `.cursor/skills/` 可能并存——**盘点时两处都列**，避免只改一处。                                          |
| **MCP 配置**                   | `.cursor/mcp.json`（或文档中声明的等价位置）          | 工具名、参数、启用状态变了 → `docs/` / runbook 里若提到 MCP 要一起改。仓库若无该文件，以 Cursor 设置或 `docs/` 中的 MCP 说明为准。 |
| **Plans（可选）**              | `.cursor/plans/*.plan.md`                             | 多为阶段性计划；若已过期或已被代码取代，删除或归档说明，避免新人误当现状。                                                         |

## 用户本机（不进仓库）

| 用途                           | 路径                               | 备注                                                                                |
| ------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------- |
| **个人 Skills**                | `~/.cursor/skills/<name>/SKILL.md` | 跨项目；**不要**往 `~/.cursor/skills-cursor/` 写技能（Cursor 内置保留目录）。       |
| **User Rules（Rules for AI）** | Cursor 设置 / 账户侧 UI 配置       | 通常不是仓库里的单文件；**本 skill 默认不改**，除非用户明确要求同步「跨项目原则」。 |

## 与「记忆」的对应关系

- 把「本会话要留给下一会话的事实」收敛到 **`AGENTS.md` / `CLAUDE.md` + 合适的 Project Rules**（`.cursor/rules/*` 或 `.cursorrules`；短、可检索），不要把长篇架构塞进单条 User Rule。
- **`docs/` + README** 的受众是人类与下游集成方：**Project Rules 替代不了** integration-guide 类文档。

## 与 `CLAUDE.md` / `AGENTS.md` 共存

同一仓库若同时存在两者：以团队约定为准选「主文件」，另一份用短跳转或 symlink，**禁止两处长期各写一套矛盾事实**。
