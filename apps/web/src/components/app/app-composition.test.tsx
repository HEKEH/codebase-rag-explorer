import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { App } from "@/App";

describe("App", () => {
  test("renders repos route as default page", () => {
    const view = render(<App />);
    expect(view.getByText("仓库管理页")).toBeTruthy();
    expect(view.getByRole("link", { name: "聊天页" })).toBeTruthy();
  });
});
