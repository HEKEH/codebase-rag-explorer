import { describe, expect, test } from "bun:test";
import { normalizeRepoSourceValue } from "./index";

describe("normalizeRepoSourceValue", () => {
  test("trims spaces", () => {
    expect(normalizeRepoSourceValue("  /tmp/repo  ")).toBe("/tmp/repo");
  });

  test("removes trailing slashes", () => {
    expect(normalizeRepoSourceValue("/tmp/repo///")).toBe("/tmp/repo");
  });

  test("normalizes git source values consistently", () => {
    expect(normalizeRepoSourceValue("https://example.com/repo.git/")).toBe("https://example.com/repo.git");
  });
});
