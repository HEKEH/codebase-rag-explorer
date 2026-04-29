# PRD 题集执行报告（严格模式）

- 执行时间：2026-04-29T09:37:22.952Z
- 执行模式：live-rag（严格）
- 执行结果：失败（embedding 推理阶段执行报错）
- 一致率：N/A

## 失败原因

- 在索引阶段 embedding 模型加载成功后，在特征提取（feature-extraction）推理执行时发生运行时错误：
  - Error: `TypeError: Tensor.location must be a string`

- 受该错误影响，索引/验收流程中断，因此未进入题集评分阶段，一致率无法计算。

## 结论

- 当前环境下 **T5-7 尚未完成真实验收**。
- 恢复外网访问（或预置可用本地模型缓存）后，需要重新执行：
  - `bun --env-file=.env apps/server/src/scripts/acceptance-eval.ts`
