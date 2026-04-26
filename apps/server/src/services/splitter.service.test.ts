import { describe, expect, test } from "bun:test";
import { SplitterService } from "./splitter.service";

describe("SplitterService", () => {
  test("splits function and class declarations into semantic chunks", () => {
    const service = new SplitterService();
    const chunks = service.splitFile("repo-test", {
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
});
