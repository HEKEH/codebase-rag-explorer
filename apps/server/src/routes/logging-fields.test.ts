import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readRouteFile(fileName: string): string {
  const testCwd = process.cwd().endsWith("/apps/server") ? join(process.cwd(), "..", "..") : process.cwd();
  return readFileSync(join(testCwd, "apps/server/src/routes", fileName), "utf8");
}

describe("route logging fields", () => {
  test("uses repo_id field in ask and repos route log payloads", () => {
    const askRouteSource = readRouteFile("ask.ts");
    const reposRouteSource = readRouteFile("repos.ts");

    expect(/requestLogger\.(info|warn|error)\(\{[\s\S]*?repo_id:/.test(askRouteSource)).toBe(true);
    expect(/requestLogger\.(info|warn|error)\(\{[\s\S]*?repo_id:/.test(reposRouteSource)).toBe(true);
  });
});
