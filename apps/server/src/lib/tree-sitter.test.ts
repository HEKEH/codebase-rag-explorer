import { describe, expect, test } from "bun:test";
import { parseSemanticNodes } from "./tree-sitter.js";

describe("lib/tree-sitter", () => {
  test("extracts function and class nodes from TypeScript source", () => {
    const code = `
export class UserService {
  getName(): string {
    return "alice";
  }
}

export function runTask(input: string): string {
  return input.trim();
}
`.trim();

    const nodes = parseSemanticNodes("src/user-service.ts", code);

    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(
      nodes.some(
        (node) => node.type === "class" && node.name === "UserService",
      ),
    ).toBe(true);
    expect(
      nodes.some((node) => node.type === "function" && node.name === "runTask"),
    ).toBe(true);
  });
});
