import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type AcceptanceQuestion = {
  id: string;
  category: "function" | "module" | "call-chain";
  question: string;
  expectedFiles: string[];
  expectedKeywords: string[];
};

describe("acceptance question set", () => {
  test("contains 20+ executable questions with required categories", () => {
    const rootDir = process.cwd().endsWith("/apps/server") ? join(process.cwd(), "..", "..") : process.cwd();
    const filePath = join(rootDir, "docs", "05-quality", "acceptance-question-set.json");
    const payload = JSON.parse(readFileSync(filePath, "utf8")) as { questions: AcceptanceQuestion[] };
    const questions = payload.questions;

    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThanOrEqual(20);

    const categories = new Set(questions.map((item) => item.category));
    expect(categories.has("function")).toBe(true);
    expect(categories.has("module")).toBe(true);
    expect(categories.has("call-chain")).toBe(true);

    for (const item of questions) {
      expect(item.id.trim().length).toBeGreaterThan(0);
      expect(item.question.trim().length).toBeGreaterThan(0);
      expect(item.expectedFiles.length).toBeGreaterThan(0);
      expect(item.expectedKeywords.length).toBeGreaterThan(0);
    }
  });
});
