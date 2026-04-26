import { describe, expect, test } from "bun:test";
import { EMBEDDING_BATCH_SIZE } from "../src/index.ts";

describe("@repo/constants EMBEDDING_BATCH_SIZE", () => {
  test("exports TRD-defined batch size", () => {
    expect(EMBEDDING_BATCH_SIZE).toBe(2048);
  });
});
