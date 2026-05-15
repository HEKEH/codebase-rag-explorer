# 检索管线发布后核验（Retrieval post-release verification）

路线图：[Phase 7 · P7-2](../../03-planning/retrieval-enhancement-roadmap.md#phase-7发布与运维)。

## 目的

- 抽样 **`retrieval.started` / `retrieval.finished`** JSON 字段，确认融合模式、稀疏源、分段耗时、Jaccard 等可追溯。
- 对比上线前后 **`ask.failed`** 量级是否突变（告警阈值由各环境自定）。

字段词典：[`logging-events.md`](./logging-events.md)。

## 建议操作顺序

1. 在 **`LOG_LEVEL=debug`**（或等价）下，对任意已入库仓库触发 **单次 Ask / 等价 API**。
2. 从日志中取 **一条完整的 `retrieval.finished`** 行（或经 `jq -c .` 等格式化为 JSON 的对象）。
3. 勾选下列抽样项（值为示例类型，不要求与下列字面量一致）：
   - [ ] `fusionMode`: `weighted` 或 `rrf`
   - [ ] `sparseSource`: `bm25_fts`、`full_table` 或 **`none`**（跳过稀疏候选时）；与 [`logging-events.md`](./logging-events.md) 枚举一致
   - [ ] `queryContentModality`: `nl` 或 `pl`
   - [ ] 数值：`durationSparseMs`、`durationDenseMs`、`denseBm25RankJaccard`（非 `null` 时应在合理范围；全空候选时 Jaccard 可能为 `0`）
4. 统计窗口内（如 1h）：
   - [ ] `event` = `ask.failed` 条数 / 与 `ask.succeeded` 比例，与上周同环境或预发基线对比无 **数量级** 跳变。

### 命令片段（示例）

```bash
# 原始 JSON 行日志（按实际 logger 格式调整）
grep '"event":"retrieval.finished"' /var/log/... | tail -n 3
grep '"event":"ask.failed"' /var/log/... | wc -l
```

若日志为单行 JSON，可用 `jq` 过滤子集：

```bash
grep '"event":"retrieval.finished"' app.log | tail -n 1 | jq '{fusionMode, sparseSource, queryContentModality, durationSparseMs, denseBm25RankJaccard}'
```

## 已登记演练（示例）

以下用于满足路线图 **「记录一次演练结果」**；与生产真实日志脱敏要求不冲突时，可替换为线上抽样。

| 项 | 内容 |
|----|------|
| **日期** | 2026-05-15 |
| **环境** | 本地开发机；CI/沙箱 |
| **检索回归** | `bun test apps/server/src/services/retrieval.service.test.ts` → **12 pass, 0 fail**（覆盖 weighted/rrf、FTS 与 `full_table`、chunk 白名单、P6-1 单路桩等） |
| **质量脚本（同日军备）** | [`docs/05-quality/acceptance-eval-report.phase6-p6-3-run.md`](../05-quality/acceptance-eval-report.phase6-p6-3-run.md)：`live-rag`、26 题、一致率 69.23%；用于 **问答链路** 业务结果对照（非结构化 `retrieval.*` 日志） |
| **结构化日志** | 本演练未保留完整 JSON 行；**生产**请按上文 §建议操作顺序 粘贴一条 `retrieval.finished` 归档到工单或本段下方 |

**结论（本次登记）**：自动化检索单测与 Phase 6 验收脚本在同日通过；生产部署后应补一条真实 `retrieval.finished` 抽样与 `ask.failed` 计数截图/指标。
