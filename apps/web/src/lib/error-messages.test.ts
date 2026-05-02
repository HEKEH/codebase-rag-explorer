import { describe, expect, test } from "vitest";
import { getFriendlyErrorMessage } from "./error-messages";

describe("getFriendlyErrorMessage", () => {
  test("maps repo error codes with actionable chinese guidance", () => {
    expect(getFriendlyErrorMessage(1002, "REPO_ALREADY_EXISTS")).toContain(
      "仓库已存在",
    );
    expect(getFriendlyErrorMessage(1002, "REPO_ALREADY_EXISTS")).toContain(
      "重载",
    );

    expect(getFriendlyErrorMessage(1003, "REPO_NOT_FOUND")).toContain(
      "仓库不存在",
    );
    expect(getFriendlyErrorMessage(1003, "REPO_NOT_FOUND")).toContain(
      "仓库管理页",
    );

    expect(getFriendlyErrorMessage(1004, "REPO_RELOADING")).toContain(
      "正在重载",
    );
    expect(getFriendlyErrorMessage(1004, "REPO_RELOADING")).toContain("稍后");
  });

  test("maps ask error codes with actionable chinese guidance", () => {
    expect(getFriendlyErrorMessage(2001, "INDEX_NOT_BUILT")).toContain("索引");
    expect(getFriendlyErrorMessage(2001, "INDEX_NOT_BUILT")).toContain(
      "构建索引",
    );

    expect(getFriendlyErrorMessage(3001, "NO_RELEVANT_CODE")).toContain(
      "相关代码",
    );
    expect(getFriendlyErrorMessage(3001, "NO_RELEVANT_CODE")).toContain(
      "更换关键词",
    );
  });

  test("falls back to server message for unknown codes", () => {
    expect(getFriendlyErrorMessage(9999, "fallback")).toBe("fallback");
  });
});
