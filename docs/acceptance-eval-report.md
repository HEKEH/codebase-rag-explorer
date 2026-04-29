# PRD 题集执行报告（严格模式）

- 执行时间：2026-04-29T10:08:47.000Z
- 执行模式：live-rag（严格）
- 执行结果：失败（LLM 请求阶段被 sandbox 网络策略拦截）
- 一致率：N/A

## 失败原因

- 在题集执行的提问阶段调用 LLM 时，网络请求被 sandbox 拦截（403）：
  - 目的域名：`api.anthropic.com:443`
  - Error: `403 Blocked by sandbox network policy`

- 由于该阻塞未产出有效的题集回答，因此未进入逐题评分阶段，一致率无法计算。

## 结论

- 当前环境下 **T5-7 尚未完成真实验收**。
- 恢复外网访问（或预置可用本地模型缓存）后，需要重新执行：
  - `bun --env-file=.env apps/server/src/scripts/acceptance-eval.ts`
