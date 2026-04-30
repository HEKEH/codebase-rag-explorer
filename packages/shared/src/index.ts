export type RepoSourceType = "local" | "git";

export function normalizeRepoSourceValue(type: RepoSourceType, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const withoutTrailingSlashes = trimmed.replace(/\/+$/g, "");

  if (type === "local" && trimmed.startsWith("/") && withoutTrailingSlashes.length === 0) {
    return "/";
  }

  return withoutTrailingSlashes;
}
