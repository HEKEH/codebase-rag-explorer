import { describe, expect, test } from "bun:test";
import {
  ASK_CONTEXT_IMPORT_SUMMARY_CAP,
  buildAskContextFromResults,
  capImportSummaryForAsk,
} from "./ask-context";
import type { RetrievalResult } from "../types/retrieval";

const baseItem = (): RetrievalResult => ({
  chunk_id: "chunk-1",
  file_path: "src/feature.ts",
  content: 'export function foobar() {\n  return 1;\n}',
  chunk_type: "function",
  chunk_name: "foobar",
  score: 0.9,
  fusion: "weighted",
});

describe("lib/ask-context (Phase 5 P5-1)", () => {
  test("structures each chunk with Path, Symbol, and fenced body", () => {
    const ctx = buildAskContextFromResults([baseItem()], {
      maxContextTokens: 8000,
    });
    expect(ctx).toContain("Path: src/feature.ts\n");
    expect(ctx).toContain("function: foobar\n");
    expect(ctx).toContain('export function foobar');
    expect(ctx).toContain("```");
    expect(ctx).not.toContain("Imports:");
  });

  test("adds Imports block when resolver yields non-empty summary", () => {
    const summary = ['import type { Foo } from "./foo";'].join("\n");
    const ctx = buildAskContextFromResults([baseItem()], {
      maxContextTokens: 8000,
      importSummaryForPath: () => summary,
    });
    expect(ctx).toContain("Path: src/feature.ts");
    expect(ctx).toContain("Imports:");
    expect(ctx).toContain('import type { Foo }');
  });

  test("omits Imports when resolver is undefined", () => {
    const ctx = buildAskContextFromResults([baseItem()], {
      maxContextTokens: 8000,
      importSummaryForPath: undefined,
    });
    expect(ctx).not.toContain("\nImports:\n");
  });

  test("caps import summary length for Ask headers", () => {
    const long = `${"x".repeat(ASK_CONTEXT_IMPORT_SUMMARY_CAP + 50)}\nimport y from './y'`;
    const capped = capImportSummaryForAsk(long);
    expect(capped.endsWith("…")).toBe(true);
    expect(capped.length).toBeLessThanOrEqual(ASK_CONTEXT_IMPORT_SUMMARY_CAP + 2);
  });

  test("renders separator between chunks", () => {
    const a: RetrievalResult = {
      ...baseItem(),
      chunk_id: "a",
      file_path: "a.ts",
      chunk_name: "a",
      content: "// a",
    };
    const b: RetrievalResult = {
      ...baseItem(),
      chunk_id: "b",
      file_path: "b.ts",
      chunk_name: "b",
      content: "// b",
    };
    const ctx = buildAskContextFromResults([a, b], { maxContextTokens: 8000 });
    expect(ctx).toContain("\n\n---\n\n");
    expect(ctx).toContain("Path: a.ts");
    expect(ctx).toContain("Path: b.ts");
  });
});

describe("lib/ask-context (Phase 5 P5-2 token budget)", () => {
  test("keeps structured Path headers for ranked tail chunks under tight budgets", () => {
    const first: RetrievalResult = {
      chunk_id: "c1",
      file_path: "src/heavy-module.ts",
      content: `${"long-line\n".repeat(400)}FIRST_MARK`,
      chunk_type: "generic",
      chunk_name: "block",
      score: 0.99,
      fusion: "weighted",
    };
    const second: RetrievalResult = {
      chunk_id: "c2",
      file_path: "src/tail-marker.ts",
      content: "TAIL_MARK",
      chunk_type: "function",
      chunk_name: "tail",
      score: 0.5,
      fusion: "weighted",
    };

    const maxTokens = 320;
    const maxChars = maxTokens * 4;
    const ctx = buildAskContextFromResults([first, second], {
      maxContextTokens: maxTokens,
    });

    expect(ctx.length).toBeLessThanOrEqual(maxChars);
    expect(ctx).toContain("Path: src/heavy-module.ts");
    expect(ctx).toContain("Path: src/tail-marker.ts");
    expect(ctx).toContain("function: tail");
    expect(/```[\s\S]*```/.test(ctx)).toBe(true);
  });

  test("drops Imports blocks early when summaries would outweigh the context cap", () => {
    const a: RetrievalResult = {
      chunk_id: "a",
      file_path: "pkg/a.ts",
      content: "export const X = 1;",
      chunk_type: "generic",
      chunk_name: "a",
      score: 1,
      fusion: "weighted",
    };
    const b: RetrievalResult = {
      chunk_id: "b",
      file_path: "pkg/b.ts",
      content: "export const Y = 2;",
      chunk_type: "generic",
      chunk_name: "b",
      score: 0.9,
      fusion: "weighted",
    };
    const hugeImports = `${"import { z } from 'z'\n".repeat(40)}`;

    const ctx = buildAskContextFromResults([a, b], {
      maxContextTokens: 120,
      importSummaryForPath: () => hugeImports,
    });

    expect(ctx.length).toBeLessThanOrEqual(120 * 4);
    expect(ctx).not.toContain("\nImports:\n");
  });
});
