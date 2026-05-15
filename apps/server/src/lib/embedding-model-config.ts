import path from "node:path";
import { existsSync } from "node:fs";
import { monorepoRootFromCwd } from "./monorepo-root";

/** Default HuggingFace-style id when `EMBEDDING_MODEL` is unset. */
export const DEFAULT_EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";

export type LocalModelSpec = {
  modelId: string;
  localModelPath: string;
};

export function resolveEmbeddingModelEnvRaw(): string {
  const v = process.env.EMBEDDING_MODEL?.trim();
  return v && v.length > 0 ? v : DEFAULT_EMBEDDING_MODEL;
}

/**
 * Resolved filesystem path for local snapshots, or hub-style id string for remote ids.
 */
export function resolveEmbeddingModelPathOrId(): string {
  const model = resolveEmbeddingModelEnvRaw();
  if (
    model.startsWith(".") ||
    model.startsWith("/") ||
    model.startsWith("..")
  ) {
    return path.resolve(monorepoRootFromCwd(), model);
  }
  return model;
}

export function resolveLocalModelSpec(
  modelAbsOrId: string,
): LocalModelSpec | null {
  if (!existsSync(modelAbsOrId)) return null;

  const owner = path.basename(path.dirname(modelAbsOrId));
  const modelIdName = path.basename(modelAbsOrId);
  const localModelPath = path.dirname(path.dirname(modelAbsOrId));

  if (!owner || !modelIdName) return null;
  return { modelId: `${owner}/${modelIdName}`, localModelPath };
}

/**
 * Stable id stored in `embeddings.model` and `repos.embedding_model_id`.
 * Local layouts use `local:<owner>/<name>`; unknown local paths use `file:<abs>`;
 * hub ids use the id string as-is (e.g. `nomic-ai/nomic-embed-text-v1.5`).
 */
export function getCanonicalEmbeddingModelId(): string {
  const resolved = resolveEmbeddingModelPathOrId();
  if (existsSync(resolved)) {
    const spec = resolveLocalModelSpec(resolved);
    if (spec) return `local:${spec.modelId}`;
    return `file:${resolved}`;
  }
  return resolved;
}

/**
 * Optional hard check from `EMBEDDING_DIMENSION`; when unset, runtime uses model output only.
 * Disabled under `NODE_ENV=test` so host `.env` does not break unit tests that use stub vectors.
 */
export function parseConfiguredEmbeddingDimension(): number | null {
  if (process.env.NODE_ENV === "test") return null;
  const raw = process.env.EMBEDDING_DIMENSION?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}
