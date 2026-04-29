import { fireEvent, render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Reference } from "@repo/types";
import { CodeReference } from "./CodeReference";

vi.mock("shiki", () => ({
  codeToHtml: vi.fn(async (snippet: string) => `<pre><code>${snippet}</code></pre>`)
}));

describe("CodeReference", () => {
  test("renders metadata and toggles code panel", async () => {
    const reference: Reference = {
      chunk_id: "chunk-1",
      file_path: "apps/server/src/services/index.service.ts",
      score: 0.9123,
      snippet: "function buildIndex() {\n  return true;\n}"
    };

    const view = render(<CodeReference reference={reference} language="ts" />);
    expect(view.getByText("apps/server/src/services/index.service.ts")).toBeTruthy();
    expect(view.getByText((text) => text.includes("score=0.9123"))).toBeTruthy();
    expect(view.getByText("ts")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "展开代码" }));
    expect(await view.findByText("复制代码")).toBeTruthy();
  });

  test("toggle button exposes aria-expanded state", () => {
    const reference: Reference = {
      chunk_id: "chunk-2",
      file_path: "apps/web/src/components/chat/CodeReference.tsx",
      score: 0.8,
      snippet: "const x = 1;"
    };
    const view = render(<CodeReference reference={reference} language="ts" />);
    const toggleButton = view.getByRole("button", { name: "展开代码" });
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
  });
});
