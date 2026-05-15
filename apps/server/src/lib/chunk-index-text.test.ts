import { describe, expect, test } from "bun:test";
import type { ChunkData } from "../types/chunk";
import { chunkToSparseIndexBody } from "./chunk-index-text";

const baseChunk: ChunkData = {
  id: "c1",
  repo_id: "r1",
  file_path: "src/a.ts",
  content: "export function f() {}",
  chunk_type: "function",
  chunk_name: "f",
  start_line: 1,
  end_line: 1,
};

describe("lib/chunk-index-text", () => {
  test("legacy body without import_summary", () => {
    expect(chunkToSparseIndexBody(baseChunk)).toBe(
      "File: src/a.ts\nfunction: f\n\nexport function f() {}",
    );
  });

  test("prepends Imports block when import_summary set", () => {
    expect(
      chunkToSparseIndexBody({
        ...baseChunk,
        import_summary: 'import { z } from "zod";',
      }),
    ).toBe(
      'File: src/a.ts\nImports:\nimport { z } from "zod";\n\nfunction: f\n\nexport function f() {}',
    );
  });
});
