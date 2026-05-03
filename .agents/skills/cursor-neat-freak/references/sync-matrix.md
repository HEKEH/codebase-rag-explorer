# 变更影响矩阵

遇到不确定「这次改动要同步哪些文件」时查这张表。

## 文件名与仓库对齐

表中 `integration-guide.md`、`operator-runbook.md`、`architecture.md`、`handoff.md` 为**常见约定名**。若本仓库采用其他结构（例如仅 `docs/README.md`、`docs/02-technical/TRD.md`、按编号分目录），将矩阵里的职责**映射到实际文件**（「对外接入说明」「运维/排障」「数据与组件边界」「交接/现状清单」各自落在哪几个 md），不要机械复制不存在的路径。

## 代码层变更 → 文档层变更

| 本次对话发生的事        | 要改的文件(按受众)                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 新增 API / 路由         | 项目根 markdown 路由清单 · `docs/integration-guide.md` API 速查表 · `docs/architecture.md` Routes 小节           |
| 新增 / 改名 环境变量    | 项目根 markdown 环境变量表 · `docs/operator-runbook.md` 环境变量章节 · `docs/integration-guide.md`(如果下游要配) |
| 新增数据库表 / 列       | 项目根 markdown 数据库表 · `docs/architecture.md` Data Model                                                     |
| 新增 / 改动 用户流程    | 项目根 markdown 用户流程 · README 相关命令行示例 · `docs/handoff.md` What Exists Today                           |
| 新增大特性(能跨多文件)  | 以上全部 + `docs/architecture.md` 新增章节 + `docs/handoff.md` 已完成清单                                        |
| 新增术语 / 改命名       | `docs/integration-guide.md` 术语表(如果有)+ 全局搜索旧术语替换                                                   |
| 部署参数 / 基础设施变化 | `docs/operator-runbook.md` · 项目根 markdown 部署章节                                                            |
| 下游项目接入方式变化    | 下游项目的 `docs/<integration>.md` · 上游项目对外集成文档（常为 `docs/integration-guide.md`，以映射为准）        |

## 持久化上下文层（Rules / 根说明）

下表对应 **`AGENTS.md` / `CLAUDE.md`、Project Rules（`.mdc` / `.md` / `.cursorrules` 等）及仓库内 Skills（`.cursor/skills/`、`.agents/skills/`）** 中的事实与约定。

| 情况                         | 处理方式                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 过期事实                     | 改对应段落；若写在带 frontmatter 的规则文件（如 `.mdc`）且 `description` 与正文不一致，同步更新 frontmatter |
| 相对时间（「今天」「最近」） | 全部转成绝对日期（如 `2026-05-03`）                                                                         |
| 重复（多条说同一件事）       | 合并为一条，或拆到单一 Rule 文件                                                                            |
| 已完成的待办                 | 删除——知识库不是历史档案                                                                                    |
| 推翻的决策                   | 删旧条目，只保留当前决策                                                                                    |
| 跨会话只用一次的临时上下文   | 删除                                                                                                        |

## 跨项目影响检查

最容易漏改的场景：

- **上游 API 变了 → 下游 SDK 文档**：协议变化必须两边对齐
- **共享子域 / 路由 / 环境变量改了 → 所有 consumer 项目的 setup 文档**
- **认证中台变更 → 所有接入应用的 integration guide**
- **公共组件 / 基础设施升级 → 各项目的 operator-runbook 提及版本号的地方**

判断方法：这次改的东西有没有 SDK、子域、共享配置、跨进程协议？有就要在所有依赖项目里搜一遍提到这件事的文档。

## 文档结构通用约定

新增一个能力（API、flow、特性）的标准动作是**四处都补**：

1. **integration-guide / 外部视角文档**：怎么用（curl / SDK 示例 / 错误码）
2. **architecture**：怎么工作（数据流、状态机、设计取舍）
3. **runbook**：怎么运维（冒烟命令、故障排查、环境变量）
4. **handoff / CHANGELOG**：已完成

API 速查表、环境变量表、术语表是高频查询的结构化信息，**必须保持「所见即最新」**。
