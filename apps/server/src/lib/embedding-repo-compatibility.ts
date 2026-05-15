import { ErrorCode } from "@repo/types";
import { getDb } from "../db/connection";
import { AppError } from "./errors";
import {
  getCanonicalEmbeddingModelId,
  parseConfiguredEmbeddingDimension,
} from "./embedding-model-config";

export type IndexedEmbeddingFingerprint = {
  model: string;
  dimension: number;
};

/**
 * Reads the indexed embedding space for a repo from `embeddings` (source of truth).
 * Returns null when there are no embedding rows (dense path will be empty).
 */
export function getIndexedEmbeddingFingerprint(
  repoId: string,
): IndexedEmbeddingFingerprint | null {
  const db = getDb();
  const countRow = db
    .query<{ n: number }, [string]>(
      "SELECT COUNT(*) AS n FROM embeddings WHERE repo_id = ?",
    )
    .get(repoId);
  if (!countRow || countRow.n === 0) return null;

  const distinctRow = db
    .query<{ n: number }, [string]>(
      "SELECT COUNT(DISTINCT model) AS n FROM embeddings WHERE repo_id = ?",
    )
    .get(repoId);
  if (!distinctRow || distinctRow.n !== 1) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      "仓库中存在多种嵌入模型记录，数据不一致，请删除索引后重建",
    );
  }

  const row = db
    .query<{ model: string; blen: number }, [string]>(
      "SELECT model, length(embedding) AS blen FROM embeddings WHERE repo_id = ? LIMIT 1",
    )
    .get(repoId);
  if (!row || !row.model) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      "无法读取嵌入元数据，请重建索引",
    );
  }
  const dimension = Math.floor(row.blen / 4);
  if (dimension <= 0 || row.blen % 4 !== 0) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      "嵌入向量 BLOB 长度异常，请重建索引",
    );
  }
  return { model: row.model, dimension };
}

/**
 * P4-3 / P4-4: forbid mixing vector spaces — reject retrieval when indexed model
 * differs from the currently configured embedder identity.
 */
export function assertRetrievalEmbeddingModelMatchesIndex(
  repoId: string,
): IndexedEmbeddingFingerprint | null {
  const fp = getIndexedEmbeddingFingerprint(repoId);
  if (!fp) return null;

  const current = getCanonicalEmbeddingModelId();
  if (fp.model !== current) {
    throw new AppError(
      ErrorCode.EMBEDDING_MODEL_MISMATCH,
      `索引使用的嵌入模型为「${fp.model}」，当前服务配置为「${current}」。请保持 EMBEDDING_MODEL 与索引一致或重建索引后再查询。`,
    );
  }

  const expected = parseConfiguredEmbeddingDimension();
  if (expected !== null && fp.dimension !== expected) {
    throw new AppError(
      ErrorCode.EMBEDDING_FAILED,
      `索引向量维度为 ${fp.dimension}，与 EMBEDDING_DIMENSION=${expected} 不一致；请修正环境变量或重建索引。`,
    );
  }

  return fp;
}

export function assertQueryVectorDimension(
  queryDim: number,
  indexDim: number,
): void {
  if (queryDim !== indexDim) {
    throw new AppError(
      ErrorCode.EMBEDDING_FAILED,
      `查询向量维度 ${queryDim} 与索引维度 ${indexDim} 不一致；请检查 EMBEDDING_MODEL 并重建索引。`,
    );
  }
}
