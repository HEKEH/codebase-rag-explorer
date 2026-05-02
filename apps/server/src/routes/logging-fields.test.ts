import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readRouteFile(fileName: string): string {
  const testCwd = process.cwd().endsWith("/apps/server")
    ? join(process.cwd(), "..", "..")
    : process.cwd();
  return readFileSync(
    join(testCwd, "apps/server/src/routes", fileName),
    "utf8",
  );
}

describe("route logging fields", () => {
  test("includes repo_id in all key repo/ask events", () => {
    const askRouteSource = readRouteFile("ask.ts");
    const reposRouteSource = readRouteFile("repos.ts");

    expect(askRouteSource).toMatch(
      /event:\s*"ask\.failed"[\s\S]*?repo_id:\s*body\.repo_id/,
    );

    expect(reposRouteSource).toMatch(
      /event:\s*"repos\.create\.succeeded"[\s\S]*?repo_id:\s*data\.repo_id/,
    );
    expect(reposRouteSource).toMatch(
      /event:\s*"repos\.delete\.requested"[\s\S]*?repo_id:\s*params\.repo_id/,
    );
    expect(reposRouteSource).toMatch(
      /event:\s*"repos\.delete\.succeeded"[\s\S]*?repo_id:\s*params\.repo_id/,
    );
    expect(reposRouteSource).toMatch(
      /event:\s*"repos\.reload\.requested"[\s\S]*?repo_id:\s*params\.repo_id/,
    );
    expect(reposRouteSource).toMatch(
      /event:\s*"repos\.chat_history\.clear\.requested"[\s\S]*?repo_id:\s*params\.repo_id/,
    );
    expect(reposRouteSource).toMatch(
      /event:\s*"repos\.chat_history\.clear\.succeeded"[\s\S]*?repo_id:\s*params\.repo_id/,
    );
  });
});
