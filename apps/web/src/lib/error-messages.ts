const ERROR_MESSAGE_MAP: Record<number, string> = {
  1002: "仓库已存在。你可以直接使用该仓库，或返回仓库管理页触发重载。",
  1003: "仓库不存在。请先到仓库管理页确认仓库仍在列表中，再重试当前操作。",
  1004: "仓库正在重载中。请稍后刷新状态，待索引完成后再继续操作。",
  2001: "仓库索引尚未完成。请先在仓库管理页执行“构建索引/重建索引”。",
  3001: "未检索到相关代码片段。建议缩小问题范围或更换关键词后重试。",
  4001:
    "向量化失败或与索引维度不匹配。请检查 EMBEDDING_MODEL、EMBEDDING_DIMENSION（若设置）是否与 `.env.example` 一致，必要时在仓库页重建索引。",
  4002: "大语言模型调用失败，服务暂不可用。请稍后重试。",
  4003:
    "当前嵌入模型与已建索引不一致。请将 EMBEDDING_MODEL 恢复为建索引时的配置，或在仓库页执行重建索引后再提问。",
};

export function getFriendlyErrorMessage(
  code: number | undefined,
  fallback: string,
): string {
  if (typeof code === "number" && code in ERROR_MESSAGE_MAP) {
    return ERROR_MESSAGE_MAP[code];
  }
  return fallback;
}
