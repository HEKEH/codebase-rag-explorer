# Codebase RAG Explorer Acceptance Gates

## 使用原则
- 只有通过当前阶段 Gate，才允许进入下一阶段。
- Gate 由“必过项”组成；任一不通过都视为阶段未完成。
- 对失败项记录复现步骤与修复动作，再重新验证。

## Gate P0：项目骨架与共享契约
### 必过项
- monorepo 目录存在：`apps/server`、`apps/web`、`packages/types`、`packages/api-client`、`packages/constants`。
- 根脚本可执行：`dev`、`dev:server`、`dev:web`、`typecheck`。
- 共享协议已定义：`ApiResponse`、核心请求/响应类型、`ErrorCode`。
- `.env.example` 与 SQLite schema 已提供。

### 最小验证
- `bun install`
- `bun run typecheck`
- `bun run dev`（可启动）

## Gate P1：导入与切分
### 必过项
- 本地路径导入成功，返回统一成功结构。
- 异常路径导入失败，返回约定错误码（如 `1001`）。
- 语义切分可识别 function/class，兜底切分可控制 chunk 长度。
- chunks 数据可持久化并与 repo 关联。

### 最小验证
- 导入存在/不存在目录各 1 次。
- 对示例仓库执行切分并检查 chunk 元数据完整性。

## Gate P2：索引与检索
### 必过项
- embeddings 成功生成并落库。
- query 检索返回 top-k，且按相似度降序。
- 检索结果可追溯到原始 chunk 与文件路径。

### 最小验证
- 运行 3 个代表性问题，检查结果数量、排序、可追溯性。

## Gate P3：问答与引用可信
### 必过项
- `/api/ask` 成功时 `code=0` 且 `answer` 非空。
- 未建索引与无相关代码分支返回约定错误码与文案。
- `references` 仅来源于检索白名单，禁止 LLM 自行构造引用。

### 最小验证
- 成功/未索引/无结果/外部依赖失败路径各验证 1 次。

## Gate P4：前端 MVP
### 必过项
- 用户可完整走通：导入 → 建索引 → 提问 → 查看回答与引用。
- 回答与引用分区展示，错误提示清晰可操作。
- 索引状态流转可视化（至少覆盖 loaded/indexing/indexed）。

### 最小验证
- 按主流程手工演示 1 次，错误流程演示 2 次（未索引、无结果）。

## Gate P5：质量与交付
### 必过项
- 后端与前端最小测试矩阵可运行。
- PRD 验收题集（>=20）完成统计，达到既定质量门槛。
- 交付物齐全：可运行系统、使用说明、示例测试仓库。

### 最小验证
- 执行测试命令并保存结果摘要。
- 输出验收报告与问题清单（若有）。
