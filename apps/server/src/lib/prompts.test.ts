import { describe, expect, test } from "bun:test";
import { createAskPrompt } from "./prompts";

describe("lib/prompts", () => {
  test("injects question and context variables into prompt messages", async () => {
    const prompt = createAskPrompt();
    const messages = await prompt.formatMessages({
      question: "How does add() work?",
      context: "File: src/math.ts\nfunction: add\n```ts\nexport function add(a, b) { return a + b }\n```"
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain("资深代码助手");
    expect(messages[1]?.content).toContain("How does add() work?");
    expect(messages[1]?.content).toContain("src/math.ts");
  });
});
