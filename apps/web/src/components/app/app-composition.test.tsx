import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { App } from "@/App";

describe("App", () => {
  test("renders app title and composed panels", () => {
    const view = render(<App />);
    expect(view.getByText("Codebase RAG Explorer")).toBeTruthy();
    expect(view.getByText("仓库管理")).toBeTruthy();
    expect(view.getByText("问答")).toBeTruthy();
  });
});
