# 检索管线回滚 Runbook（Retrieval rollback）

路线图：[Phase 7 · P7-3](../../03-planning/retrieval-enhancement-roadmap.md#phase-7发布与运维)。

各步骤可 **独立执行**；按影响面从小到大尝试。

---

## A. 仅关闭 RRF，回到 legacy **`weighted` 融合**

**适用**：RRF 融合引起排序异常、延迟或解释困难；**无需**回退代码。

1. 在部署环境设置（或取消覆盖以使用默认）：
   - `RETRIEVAL_FUSION=weighted`
   - 若曾显式设 `RETRIEVAL_FUSION=rrf`，删除该变量或改为 `weighted`（解析大小写不敏感）。
2. **重启** 应用进程使 `runtimeConfig` 重新载入。
3. 核验：日志中 `retrieval.finished.fusionMode` 应为 **`weighted`**；抽样 Ask 引用顺序符合预期。
4. （可选）若需进一步弱化稀疏路：`RETRIEVAL_QUERY_MODALITY=force_nl` 会令 dense 侧权重相对更高（加权与 RRF 路径均受此内容模态影响），见 [`retrieval-enhancement-design.md` §3.C](../../02-technical/retrieval-enhancement-design.md)。

---

## B. FTS 稀疏路异常：临时 **`full_table`**

**适用**：`chunk_fts` 损坏、迁移异常导致 BM25 无结果或 SQL 报错；接受更高延迟以恢复召回。

1. 设置 `RETRIEVAL_SPARSE_MODE=full_table`。
2. 重启进程。
3. 核验：`retrieval.finished.sparseSource` 为 **`full_table`**；确认无未处理异常日志。
4. **后续**：修复根因后对受影响仓库执行 **重建索引**，并恢复 **`RETRIEVAL_SPARSE_MODE=fts`**。

---

## C. PL/NL 误判：运维覆盖

**适用**：误判为程序化查询或自然语言查询导致召回深度反常。

1. 设置 **`RETRIEVAL_QUERY_MODALITY=force_nl`** 或 **`force_pl`**（见 `.env.example` 注释）。
2. 重启；核验日志 `queryModality` 与 **`queryContentModality`**。

---

## D. 回退服务端版本（二进制 / 镜像）

**适用**：代码缺陷需回滚到先前 tag。

| 滚动方向 | 数据库 | 注意 |
|----------|--------|------|
| 回滚到 **仍内置 `chunk_fts` 写入** 的版本 | 保留当前 SQLite 文件 | 通常最安全；丢弃仅新迁移若未执行：勿在旧进程上套用仅新迁移后的 DB |
| 回滚到 **`chunk_fts` 不存在** 的极旧构建 | DB 已有 `chunk_fts` 表 | SQLite **多出来的表一般被忽略**；旧代码若不读 FTS，行为等同旧 lexical 路径，但 **不会自动维护 FTS**；日后升级需 **重迁移 + 重建索引** |
| 前进升级 | `001`–`004` 顺序迁移 | **`004`** 为 `repos` 增加 `embedding_*`；新代码校验模型元数据，参见 [`TRD` 附录](../../02-technical/TRD.md) |

**不推荐**在生产手工 `DROP TABLE chunk_fts` 除非已与研发确认且无向前兼容需求。

重启后执行 **发布后核验**：[`retrieval-release-post-verify.md`](./retrieval-release-post-verify.md)。

---

## 快速对照

| 目标 | 环境变量动作 |
|------|----------------|
| 关闭 RRF | `RETRIEVAL_FUSION=weighted` |
| 兜底稀疏路 | `RETRIEVAL_SPARSE_MODE=full_table` |
| 纠偏 NL/PL | `RETRIEVAL_QUERY_MODALITY=force_nl` 或 `force_pl` |

发布前风险提示与默认值：[`retrieval-release-checklist.md`](./retrieval-release-checklist.md)。
