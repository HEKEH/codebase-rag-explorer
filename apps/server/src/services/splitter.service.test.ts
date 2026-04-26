import { describe, expect, test } from "bun:test";
import { SplitterService } from "./splitter.service";
import { runtimeConfig } from "../config/runtime";

describe("SplitterService", () => {
  test("splits function and class declarations into semantic chunks", async () => {
    const service = new SplitterService();
    const chunks = await service.splitFile("repo-test", {
      path: "src/example.ts",
      content: `
const helper = () => "ok";

class UserService {
  getName() { return "alice"; }
}

function runTask() {
  return helper();
}
`.trim()
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.chunk_type === "class")).toBe(true);
    expect(chunks.some((chunk) => chunk.chunk_type === "function")).toBe(true);
  });

  test("extracts class method as function chunk and enforces max-length fallback split", async () => {
    const service = new SplitterService();
    const longBody = "x".repeat(runtimeConfig.chunkMaxLength + 300);
    const chunks = await service.splitFile("repo-test", {
      path: "src/methods.ts",
      content: `
class MathService {
  compute(value: string): string {
    const payload = "${longBody}";
    return value + payload;
  }
}
`.trim()
    });

    expect(chunks.some((chunk) => chunk.chunk_name === "compute")).toBe(true);
    expect(chunks.some((chunk) => chunk.chunk_type === "generic")).toBe(true);
    expect(chunks.every((chunk) => chunk.content.length <= runtimeConfig.chunkMaxLength)).toBe(true);
  });
});
