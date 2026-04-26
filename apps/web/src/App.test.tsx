import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  test("renders app title", () => {
    render(<App />);
    expect(screen.getByText("Codebase RAG Explorer")).toBeInTheDocument();
  });
});
