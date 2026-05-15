import type { RetrievalResult } from "../types/retrieval";

/** Cap Imports block chars in Ask context so headers do not dominate the budget. */
export const ASK_CONTEXT_IMPORT_SUMMARY_CAP = 800;

const SECTION_SEPARATOR = "\n\n---\n\n";
const OPEN_FENCE = "```\n";
const CLOSE_FENCE = "\n```";

export type AskContextImportResolver = (filePath: string) => string | undefined;

export type BuildAskContextOptions = {
  maxContextTokens: number;
  /** When set, yields file-level import summary for Ask headers (typically from loaded source files). */
  importSummaryForPath?: AskContextImportResolver;
};

function approxMaxChars(maxContextTokens: number): number {
  return Math.max(1, maxContextTokens * 4);
}

export function capImportSummaryForAsk(summary: string, cap = ASK_CONTEXT_IMPORT_SUMMARY_CAP): string {
  const t = summary.trim();
  if (t.length === 0) return "";
  if (t.length <= cap) return t;
  return `${t.slice(0, cap).trimEnd()}…`;
}

function stripImportsBlock(header: string): string {
  const idx = header.indexOf("\nImports:\n");
  if (idx === -1) return header;
  return header.slice(0, idx);
}

/** Path line may be shortened under extreme budgets. */
function truncatePathForEmergency(pathStr: string, maxLen: number): string {
  if (maxLen <= 1 || pathStr.length <= maxLen) return pathStr;
  return `…${pathStr.slice(-(maxLen - 1))}`;
}

/** Path + Symbol only (no Imports). Used when shrinking overhead. */
function compactHeaderWithoutImports(item: RetrievalResult, pathMaxChars: number): string {
  const pathLine = truncatePathForEmergency(item.file_path, pathMaxChars);
  return [`Path: ${pathLine}`, `${item.chunk_type}: ${item.chunk_name ?? "anonymous"}`].join("\n");
}

function buildHeaderFullPath(item: RetrievalResult, importLines: string | undefined): string {
  const base = [`Path: ${item.file_path}`, `${item.chunk_type}: ${item.chunk_name ?? "anonymous"}`];
  const imp = importLines?.trim();
  if (!imp || imp.length === 0) {
    return base.join("\n");
  }
  return [...base, "Imports:", imp].join("\n");
}

function sectionEnvelope(header: string, body: string): string {
  return `${header}\n${OPEN_FENCE}${body}${CLOSE_FENCE}`;
}

/** Header + fences with empty body. */
function emptyEnvelopeChars(headerLen: number): number {
  return headerLen + 1 + OPEN_FENCE.length + CLOSE_FENCE.length;
}

function totalFixedChars(headers: readonly string[]): number {
  let sum = SECTION_SEPARATOR.length * Math.max(0, headers.length - 1);
  for (const h of headers) {
    sum += emptyEnvelopeChars(h.length);
  }
  return sum;
}

function allocateBodiesGreedy(contents: readonly string[], bodyBudget: number): string[] {
  let remaining = bodyBudget;
  const out: string[] = [];
  for (const full of contents) {
    const take = Math.min(remaining, full.length);
    out.push(full.slice(0, take));
    remaining -= take;
  }
  return out;
}

/**
 * Fits headers into budget by stripping Imports, shortening paths uniformly, etc.
 */
function resolveHeadersWithinBudget(
  results: RetrievalResult[],
  resolver: AskContextImportResolver | undefined,
  maxChars: number,
): string[] {
  const headersWithImports = results.map((item) => {
    const raw = resolver?.(item.file_path);
    const capped =
      raw && raw.trim().length > 0 ? capImportSummaryForAsk(raw) : undefined;
    return buildHeaderFullPath(item, capped);
  });

  let headers = [...headersWithImports];

  let fixed = totalFixedChars(headers);
  if (fixed <= maxChars) return headers;

  headers = headersWithImports.map(stripImportsBlock);
  fixed = totalFixedChars(headers);
  if (fixed <= maxChars) return headers;

  headers = results.map((item) => compactHeaderWithoutImports(item, 10_000));
  fixed = totalFixedChars(headers);
  if (fixed <= maxChars) return headers;

  for (let pathMax = 240; pathMax >= 48; pathMax -= 24) {
    headers = results.map((item) => compactHeaderWithoutImports(item, pathMax));
    fixed = totalFixedChars(headers);
    if (fixed <= maxChars) return headers;
  }

  for (let pathMax = 40; pathMax >= 22; pathMax -= 6) {
    headers = results.map((item) => compactHeaderWithoutImports(item, pathMax));
    fixed = totalFixedChars(headers);
    if (fixed <= maxChars) return headers;
  }

  return headers;
}

function buildResolvedSections(
  results: RetrievalResult[],
  headers: readonly string[],
  maxChars: number,
): string {
  const fixedChars = totalFixedChars(headers);
  const bodyBudget = Math.max(0, maxChars - fixedChars);
  const bodies = allocateBodiesGreedy(
    results.map((r) => r.content ?? ""),
    bodyBudget,
  );
  return headers
    .map((h, i) => sectionEnvelope(h, bodies[i] ?? ""))
    .join(SECTION_SEPARATOR);
}

/**
 * Builds LLM retrieval context from ranked results (Phase 5).
 * Applies `MAX_CONTEXT_TOKENS`-derived char budget (~4 chars/token): keeps structured headers
 * for each chunk, allocates fenced bodies greedy by retrieval order.
 */
export function buildAskContextFromResults(
  results: RetrievalResult[],
  opts: BuildAskContextOptions,
): string {
  if (results.length === 0) return "";

  const maxChars = approxMaxChars(opts.maxContextTokens);
  const resolver = opts.importSummaryForPath;

  const headersPrimary = resolveHeadersWithinBudget(results, resolver, maxChars);
  let out = buildResolvedSections(results, headersPrimary, maxChars);

  if (out.length <= maxChars) return out;

  const headersFallback = resolveHeadersWithinBudget(results, undefined, maxChars);
  out = buildResolvedSections(results, headersFallback, maxChars);
  if (out.length <= maxChars) return out;

  return out.slice(0, maxChars);
}
