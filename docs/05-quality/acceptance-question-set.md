# PRD 验收题集（22 题）

可执行题集位于 `docs/05-quality/acceptance-question-set.json`，用于 T5-7 自动化执行与一致率统计。

## 分类覆盖
- function（函数说明）：8 题
- module（模块定位）：7 题
- call-chain（调用关系/行为）：7 题

## 使用说明
- 题目清单：`docs/05-quality/acceptance-question-set.json`
- 执行脚本：`apps/server/src/scripts/acceptance-eval.ts`（根目录亦可 `bun run acceptance-eval`）
- 输出报告：`docs/05-quality/acceptance-eval-report.md`
