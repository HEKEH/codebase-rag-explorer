import { describe, expect, test } from "bun:test";
import { parseRetrievalFusion } from "./runtime";

describe("parseRetrievalFusion", () => {
  test("accepts rrf with surrounding space and case variants", () => {
    expect(parseRetrievalFusion("rrf")).toBe("rrf");
    expect(parseRetrievalFusion(" RRF ")).toBe("rrf");
    expect(parseRetrievalFusion("Rrf")).toBe("rrf");
  });

  test("defaults to weighted for empty or other values", () => {
    expect(parseRetrievalFusion(undefined)).toBe("weighted");
    expect(parseRetrievalFusion("")).toBe("weighted");
    expect(parseRetrievalFusion("   ")).toBe("weighted");
    expect(parseRetrievalFusion("linear")).toBe("weighted");
  });
});
