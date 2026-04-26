import { afterEach, describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { App } from "./App";

const dom = new JSDOM("<!doctype html><html><body></body></html>");

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("App", () => {
  test("renders app title", () => {
    const view = render(<App />);
    expect(view.getByText("Codebase RAG Explorer")).toBeTruthy();
  });
});
