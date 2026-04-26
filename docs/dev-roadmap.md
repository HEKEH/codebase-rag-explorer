# Codebase RAG Explorer Roadmap

## 使用说明
- 这是项目级里程碑清单，只维护“可验证交付”，不做过细任务拆分。
- 每次开发会话只推进 1 个里程碑，完成后更新状态与证据链接。
- 状态仅允许：`pending` / `in_progress` / `done` / `blocked`。

## Phase 0：项目骨架与共享契约
- [x] M0-1 初始化 monorepo 目录（`apps/server`、`apps/web`、`packages/*`）`done`
- [x] M0-2 建立 workspace scripts 与 TS 基础配置 `done`
- [x] M0-3 落地共享类型与错误码（`ApiResponse`、`ErrorCode`）`done`
- [x] M0-4 提供 `.env.example` 与 SQLite schema 初版 `done`

## Phase 1：后端导入与切分
- [x] M1-1 `RepoService` 本地路径导入与过滤规则 `done`
- [x] M1-2 Git 导入约束（协议、超时、上限）`done`
- [x] M1-3 `SplitterService` AST 语义切分 `done`
- [ ] M1-4 超长 chunk 兜底切分与 chunks 持久化 `pending`

## Phase 2：索引与检索
- [ ] M2-1 `EmbedderService` 批处理与 embeddings 落库 `pending`
- [ ] M2-2 `RetrievalService` 余弦 top-k 与回查 `pending`
- [ ] M2-3 检索参数配置联通（top_k/chunk/context）`pending`

## Phase 3：问答编排与可信引用
- [ ] M3-1 `/api/ask` 主流程（状态校验、检索、上下文、LLM）`pending`
- [ ] M3-2 空检索与未建索引分支（`3001`、`2001`）`pending`
- [ ] M3-3 引用白名单生成（不从 LLM 文本反推）`pending`

## Phase 4：前端 MVP
- [ ] M4-1 仓库导入与索引状态面板 `pending`
- [ ] M4-2 问答提交流程与结果渲染 `pending`
- [ ] M4-3 引用代码展示与错误提示体验 `pending`

## Phase 5：质量门禁与验收
- [ ] M5-1 后端单元/集成/API 最小测试矩阵 `pending`
- [ ] M5-2 前端组件/Hook 最小测试矩阵 `pending`
- [ ] M5-3 PRD 验收题集与结果报告 `pending`

## 变更记录
- 初始化：建立阶段与里程碑骨架，后续按会话增量维护。
