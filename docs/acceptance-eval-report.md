# PRD 题集执行报告（严格模式）

- 执行时间：2026-04-29T03:33:45.636Z
- 执行模式：live-rag（严格）
- 执行结果：失败（未进入题集评分阶段）
- 一致率：N/A

## 失败原因

- 在索引阶段下载 embedding 模型失败：
  - URL: `https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/resolve/main/config.json`
  - Error: `ConnectionRefused`
- 受该阻塞影响，本次未产出有效题集回答，因此无法计算一致率。

## 结论

- 当前环境下 **T5-7 尚未完成真实验收**。
- 恢复外网访问（或预置可用本地模型缓存）后，需要重新执行：
  - `bun --env-file=.env apps/server/src/scripts/acceptance-eval.ts`
