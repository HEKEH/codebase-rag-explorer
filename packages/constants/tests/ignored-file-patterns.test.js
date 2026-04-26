import { describe, expect, test } from "bun:test";
import { IGNORED_FILE_PATTERNS } from "../src/index.ts";

describe("@repo/constants IGNORED_FILE_PATTERNS", () => {
  test("uses regex patterns and matches TRD-required file types", () => {
    for (const pattern of IGNORED_FILE_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
    }

    expect(IGNORED_FILE_PATTERNS.some((pattern) => pattern.test("bun.lock"))).toBe(true);
    expect(IGNORED_FILE_PATTERNS.some((pattern) => pattern.test("bundle.min.js"))).toBe(true);
    expect(IGNORED_FILE_PATTERNS.some((pattern) => pattern.test("style.min.css"))).toBe(true);
    expect(IGNORED_FILE_PATTERNS.some((pattern) => pattern.test("app.js.map"))).toBe(true);
    expect(IGNORED_FILE_PATTERNS.some((pattern) => pattern.test("logo.png"))).toBe(true);
    expect(IGNORED_FILE_PATTERNS.some((pattern) => pattern.test("font.woff2"))).toBe(true);
  });
});
