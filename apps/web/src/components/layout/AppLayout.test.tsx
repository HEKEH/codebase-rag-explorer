import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { AppLayout } from "./AppLayout";

describe("AppLayout", () => {
  test("renders fixed-width left panel and flexible right panel", () => {
    const view = render(
      <AppLayout
        leftPanel={<div>left panel</div>}
        rightPanel={<div>right panel</div>}
      />
    );

    const container = view.getByTestId("app-layout");
    const left = view.getByTestId("app-layout-left");
    const right = view.getByTestId("app-layout-right");

    expect(container).toHaveStyle({ minWidth: "1024px" });
    expect(left).toHaveStyle({ width: "320px" });
    expect(right).toHaveStyle({ flex: "1 1 0%" });
    expect(view.getByText("left panel")).toBeTruthy();
    expect(view.getByText("right panel")).toBeTruthy();
  });
});
