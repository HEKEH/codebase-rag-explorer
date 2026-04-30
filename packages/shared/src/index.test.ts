import { describe, expect, test } from "bun:test";
import { normalizeRepoSourceValue } from "./index";

describe("normalizeRepoSourceValue", () => {
  test("trims spaces", () => {
    expect(normalizeRepoSourceValue("local", "  /tmp/repo  ")).toBe("/tmp/repo");
  });

  test("removes trailing slashes for local path", () => {
    expect(normalizeRepoSourceValue("local", "/tmp/repo///")).toBe("/tmp/repo");
  });

  test("normalizes git source values consistently", () => {
    expect(normalizeRepoSourceValue("git", "https://example.com/repo.git/")).toBe("https://example.com/repo.git");
  });

  test("keeps local root path slash", () => {
    expect(normalizeRepoSourceValue("local", "/")).toBe("/");
  });
});
