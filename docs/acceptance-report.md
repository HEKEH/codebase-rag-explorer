# MVP 验收报告（当前版本）

## 版本与范围
- 分支：`main`
- 覆盖范围：Phase 0 ~ Phase 5
- 基线来源：`PRD.md`、`TRD.md`、`docs/acceptance-gates.md`

## 验收结论（当前）
- 功能闭环：通过（导入 -> 建索引 -> 检索 -> 问答 -> 引用展示）
- 类型检查：通过（packages + apps）
- 后端测试：通过（Phase 5 后端测试矩阵已补齐）
- 前端测试：通过（Phase 5 前端组件与 Hook 测试已补齐）
- 验收题集：已执行（22 题，详见 `docs/acceptance-eval-report.md`，一致率 100%）

## 关键验证记录
- `bun run typecheck`：通过
- `bun run --filter @repo/server test`：2 passed
- `bun run --filter @repo/web test`：1 passed

## 已知差异与后续优化
- Embedding 当前为本地可重复 hash 向量，后续可替换 OpenAI embedding API。
- 语义切分当前为 AST-like 轻量策略，后续可升级为 Tree-sitter 精确解析。
- 向量检索当前为线性扫描，后续可替换 ANN 索引提升大规模性能。

## 交付物清单
- 可运行系统：Monorepo 前后端与共享包
- 使用说明：已在文档与脚本中提供（`dev`/`build`/`test`/`typecheck`）
- 示例测试：后端与前端基础测试已落地
