import { join } from "node:path";

/**
 * Monorepo root when code runs from `apps/server` vs repo root.
 * Used by tests and scripts that `join(root, "apps/server/...")` or `join(root, "docs/...")`.
 */
export function monorepoRootFromCwd(): string {
  return process.cwd().endsWith("/apps/server")
    ? join(process.cwd(), "..", "..")
    : process.cwd();
}
