import { describe, expect, test } from "bun:test";
import {
  parseChatReferencesJson,
  serializeChatReferencesForStorage,
} from "./chat-references-storage";

describe("chat-references-storage", () => {
  const refs = [
    {
      chunk_id: "c1",
      file_path: "a.ts",
      snippet: "x",
      score: 0.5,
    },
  ];

  test("round-trips envelope with retrieval_fusion", () => {
    const json = serializeChatReferencesForStorage(refs, "rrf");
    expect(parseChatReferencesJson(json)).toEqual({
      references: refs,
      retrieval_fusion: "rrf",
    });
  });

  test("parses legacy Reference[] JSON", () => {
    const json = JSON.stringify(refs);
    expect(parseChatReferencesJson(json)).toEqual({ references: refs });
  });

  test("serialize without fusion keeps array shape", () => {
    expect(serializeChatReferencesForStorage(refs)).toBe(JSON.stringify(refs));
  });
});
