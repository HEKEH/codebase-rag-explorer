import { describe, expect, test } from "bun:test";
import { parseRetrievalFusion, parseRetrievalQueryModality } from "./runtime";

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

describe("parseRetrievalQueryModality (P3-2)", () => {
  test("accepts force_nl / force_pl with case and surrounding space", () => {
    expect(parseRetrievalQueryModality("force_nl")).toBe("force_nl");
    expect(parseRetrievalQueryModality(" FORCE_PL ")).toBe("force_pl");
    expect(parseRetrievalQueryModality("Force_Nl")).toBe("force_nl");
  });

  test("defaults to auto for empty or unknown", () => {
    expect(parseRetrievalQueryModality(undefined)).toBe("auto");
    expect(parseRetrievalQueryModality("")).toBe("auto");
    expect(parseRetrievalQueryModality("nl")).toBe("auto");
  });
});
