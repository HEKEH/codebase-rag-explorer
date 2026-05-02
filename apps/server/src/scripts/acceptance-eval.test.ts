import { describe, expect, test } from "bun:test";
import { evaluateSingleQuestion } from "./acceptance-eval";

describe("acceptance eval scoring", () => {
  test("marks question as matched when keyword or expected file is hit", () => {
    const keywordMatched = evaluateSingleQuestion({
      expectedFiles: ["apps/server/src/services/index.service.ts"],
      expectedKeywords: ["buildIndex", "saveChunks"],
      answer: "buildIndex 会先做 split 再 saveChunks",
      references: [],
    });
    expect(keywordMatched.matched).toBe(true);

    const fileMatched = evaluateSingleQuestion({
      expectedFiles: ["apps/server/src/services/ask.service.ts"],
      expectedKeywords: ["whitelist"],
      answer: "回答里没有关键词",
      references: [
        {
          file_path: "apps/server/src/services/ask.service.ts",
          snippet: "...",
        },
      ],
    });
    expect(fileMatched.matched).toBe(true);

    const missed = evaluateSingleQuestion({
      expectedFiles: ["apps/server/src/routes/repo.ts"],
      expectedKeywords: ["importRepo"],
      answer: "无关回答",
      references: [],
    });
    expect(missed.matched).toBe(false);
  });

  test("matches keywords case-insensitively", () => {
    const scored = evaluateSingleQuestion({
      expectedFiles: ["apps/server/src/services/index.service.ts"],
      expectedKeywords: ["INDEX_ALREADY_EXISTS"],
      answer: "当状态冲突时会返回 index_already_exists",
      references: [],
    });
    expect(scored.keywordHit).toBe(true);
    expect(scored.matched).toBe(true);
  });
});
