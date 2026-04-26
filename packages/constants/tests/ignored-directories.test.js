import { describe, expect, test } from "bun:test";
import { IGNORED_DIRECTORIES } from "../src/index.ts";

describe("@repo/constants IGNORED_DIRECTORIES", () => {
  test("includes directories required by TRD", () => {
    expect(IGNORED_DIRECTORIES).toContain(".venv");
    expect(IGNORED_DIRECTORIES).toContain("target");
    expect(IGNORED_DIRECTORIES).toContain("bin");
    expect(IGNORED_DIRECTORIES).toContain("obj");
  });
});
