import { describe, expect, test } from "bun:test";
import { parseSemanticNodes } from "./tree-sitter";

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

    expect(nodes.length).toBe(2);
    expect(nodes[0]?.type).toBe("class");
    expect(nodes[0]?.name).toBe("UserService");
    expect(nodes[1]?.type).toBe("function");
    expect(nodes[1]?.name).toBe("runTask");
  });
});
