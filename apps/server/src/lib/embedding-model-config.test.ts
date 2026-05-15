import { describe, expect, test } from "bun:test";
import { getCanonicalEmbeddingModelId } from "./embedding-model-config";

describe("lib/embedding-model-config", () => {
  test("getCanonicalEmbeddingModelId uses default hub id when EMBEDDING_MODEL unset", () => {
    const prev = process.env.EMBEDDING_MODEL;
    delete process.env.EMBEDDING_MODEL;
    try {
      expect(getCanonicalEmbeddingModelId()).toBe(
        "nomic-ai/nomic-embed-text-v1.5",
      );
    } finally {
      if (prev === undefined) delete process.env.EMBEDDING_MODEL;
      else process.env.EMBEDDING_MODEL = prev;
    }
  });

  test("getCanonicalEmbeddingModelId passes through hub-style id", () => {
    const prev = process.env.EMBEDDING_MODEL;
    process.env.EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
    try {
      expect(getCanonicalEmbeddingModelId()).toBe("Xenova/all-MiniLM-L6-v2");
    } finally {
      if (prev === undefined) delete process.env.EMBEDDING_MODEL;
      else process.env.EMBEDDING_MODEL = prev;
    }
  });
});
