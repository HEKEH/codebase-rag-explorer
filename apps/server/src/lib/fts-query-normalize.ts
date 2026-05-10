/**
 * Build a safe FTS5 `MATCH` expression from free-form user text (roadmap P1-4).
 * Extracts conservative tokens, phrase-quotes each (FTS5: double internal `"`), AND-joins.
 */
export function normalizeUserQueryForFts5Match(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tokenPattern =
    /[\u4e00-\u9fff]+|[A-Za-z0-9][A-Za-z0-9._-]*/g;
  const matches = trimmed.match(tokenPattern) ?? [];

  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const token of matches) {
    const asciiWord = /^[A-Za-z0-9._-]+$/.test(token);
    const dedupKey = asciiWord ? token.toLowerCase() : token;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const escaped = token.replace(/"/g, '""');
    phrases.push(`"${escaped}"`);
  }

  if (phrases.length === 0) return null;
  return phrases.join(" ");
}

/**
 * Phrase-quote each retrieval token and OR-join for FTS5 `MATCH` (P1-6 sparse candidates).
 * Input must be tokens from `RetrievalService`'s `tokenizeQuestion` (stopword-stripped).
 * This is **not** `normalizeUserQueryForFts5Match`: that function AND-joins raw-string tokens for ad-hoc MATCH safety; hybrid retrieval uses OR here for recall.
 */
export function buildFtsOrMatchFromRetrievalTokens(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  const phrases = tokens.map((token) => {
    const escaped = token.replace(/"/g, '""');
    return `"${escaped}"`;
  });
  return phrases.join(" OR ");
}
