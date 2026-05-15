import { describe, expect, test } from "bun:test";
import { extractFileImportSummary } from "./file-import-summary";

describe("lib/file-import-summary", () => {
  test("collects leading TS imports after comments", () => {
    const src = `// header
import { z } from "zod";
import type { X } from "./x";

export const a = 1;
`;
    expect(extractFileImportSummary(src, "src/a.ts")).toBe(
      `import { z } from "zod";\nimport type { X } from "./x";`,
    );
  });

  test("collects Python from-import block", () => {
    const src = `from os import path
import json

def f():
  pass
`;
    expect(extractFileImportSummary(src, "lib/f.py")).toBe(
      "from os import path\nimport json",
    );
  });

  test("skips leading Python module docstring before imports", () => {
    const src = `"""API helpers."""

import os
import json

x = 1
`;
    expect(extractFileImportSummary(src, "pkg/mod.py")).toBe("import os\nimport json");
  });

  test("skips single-line Python module docstring", () => {
    const src = `'''x'''


import os
`;
    expect(extractFileImportSummary(src, "x.py")).toBe("import os");
  });

  test("Python docstring stripping is gated by .py/.pyi path", () => {
    const src = `"""a"""\n\nimport os\n`;
    expect(extractFileImportSummary(src, "readme.md")).toBe("");
    expect(extractFileImportSummary(src, "app.py")).toBe("import os");
    expect(extractFileImportSummary(src, "stub.pyi")).toBe("import os");
  });

  test("collects Go import block", () => {
    const src = `package main

import (
  "fmt"
  "os"
)

func main() {}
`;
    expect(extractFileImportSummary(src, "main.go")).toBe(
      `import (
  "fmt"
  "os"
)`,
    );
  });

  test("returns empty when no top imports", () => {
    expect(extractFileImportSummary("const x = 1;\n", "a.ts")).toBe("");
  });
});
