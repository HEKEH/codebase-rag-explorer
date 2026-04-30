export function normalizeRepoSourceValue(value: string): string {
  return value.trim().replace(/\/+$/g, "");
}
