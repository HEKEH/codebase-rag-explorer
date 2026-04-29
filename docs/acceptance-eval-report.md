# PRD 题集执行报告（严格模式）

- 执行时间：2026-04-29T09:27:37.881Z
- 执行模式：live-rag（严格）
- 执行结果：失败（在索引阶段中断）
- 一致率：N/A

## 失败原因

- 在索引阶段加载 embedding 模型失败：
  - 本地路径：`/Users/hekai/Desktop/ai-agent/models/nomic-ai/nomic-embed-text-v1.5/config.json`
  - Error: `Local file missing ... and download aborted due to invalid model ID "/Users/hekai/Desktop/ai-agent/models/nomic-ai/nomic-embed-text-v1.5".`

  因为 embedding 模型目录缺失必要配置文件，本次未产出有效题集回答，因此无法计算一致率。

## 结论

- 当前环境下 **T5-7 尚未完成真实验收**。
- 恢复外网访问（或预置可用本地模型缓存）后，需要重新执行：
  - `bun --env-file=.env apps/server/src/scripts/acceptance-eval.ts`
