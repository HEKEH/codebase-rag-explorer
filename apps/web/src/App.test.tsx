import { afterEach, describe, expect, test } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { App } from "./App";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("App", () => {
  test("renders repos page when pathname is /repos", () => {
    window.history.pushState({}, "", "/repos");
    const view = render(<App />);
    expect(view.getByText("仓库管理页")).toBeTruthy();
  });

  test("navigates between repos and chat pages", () => {
    window.history.pushState({}, "", "/repos");
    const view = render(<App />);

    fireEvent.click(view.getByRole("link", { name: "聊天页" }));
    expect(view.getByText("聊天页")).toBeTruthy();
    expect(window.location.pathname).toBe("/chat");
  });

  test("keeps current route after remount", () => {
    window.history.pushState({}, "", "/chat");
    const { unmount } = render(<App />);
    unmount();

    const view = render(<App />);
    expect(view.getByText("聊天页")).toBeTruthy();
  });
});
