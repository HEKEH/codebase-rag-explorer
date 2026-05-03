import { describe, expect, test } from "vitest";
import {
  getRepoStatusBadgeVariant,
  getRepoStatusLabelZh,
} from "./repo-status-ui";

describe("getRepoStatusLabelZh", () => {
  test("maps known statuses to Chinese labels", () => {
    expect(getRepoStatusLabelZh("idle")).toBe("空闲");
    expect(getRepoStatusLabelZh("loaded")).toBe("已加载");
    expect(getRepoStatusLabelZh("indexing")).toBe("索引中");
    expect(getRepoStatusLabelZh("indexed")).toBe("已索引");
    expect(getRepoStatusLabelZh("failed")).toBe("失败");
  });
});

describe("getRepoStatusBadgeVariant", () => {
  test("returns a badge variant for each known status", () => {
    expect(getRepoStatusBadgeVariant("indexed")).toBe("default");
    expect(getRepoStatusBadgeVariant("indexing")).toBe("secondary");
    expect(getRepoStatusBadgeVariant("loaded")).toBe("outline");
    expect(getRepoStatusBadgeVariant("failed")).toBe("destructive");
    expect(getRepoStatusBadgeVariant("idle")).toBe("secondary");
  });
});
