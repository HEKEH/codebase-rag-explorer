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

/** Path + shortened symbol label (helps when envelope-only budget is microscopic). */
function compactHeaderWithSymbolCap(
  item: RetrievalResult,
  pathMaxChars: number,
  symbolNameMaxChars: number,
): string {
  const pathLine = truncatePathForEmergency(item.file_path, pathMaxChars);
  const rawName = item.chunk_name ?? "anonymous";
  const nameTrunc =
    rawName.length > symbolNameMaxChars && symbolNameMaxChars > 2
      ? `${rawName.slice(0, symbolNameMaxChars - 1)}…`
      : rawName.slice(0, symbolNameMaxChars);
  return [`Path: ${pathLine}`, `${item.chunk_type}: ${nameTrunc}`].join("\n");
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

  for (let pathMax = 120; pathMax >= 22; pathMax -= 24) {
    for (let nameMax = Math.min(200, pathMax + 80); nameMax >= 8; nameMax -= 14) {
      headers = results.map((item) =>
        compactHeaderWithSymbolCap(item, pathMax, nameMax),
      );
      fixed = totalFixedChars(headers);
      if (fixed <= maxChars) return headers;
    }
  }

  /** Best-effort: caller may shrink result count via {@link buildAskContextFromResults} */
  headers = results.map((item) => compactHeaderWithSymbolCap(item, 22, 8));
  return headers;
}

/**
 * Compress single-chunk headers so fenced empty section fits fully in maxChars (avoids brittle tail slice).
 */
function fitSingleChunkHeaderToMaxChars(item: RetrievalResult, maxChars: number): string {
  const slack = Math.max(
    0,
    maxChars - (1 + OPEN_FENCE.length + CLOSE_FENCE.length),
  );
  const headerUpper = Math.max(4, slack);
  for (
    let pathMax = Math.min(item.file_path.length + 120, Math.max(280, slack));
    pathMax >= 12;
    pathMax -= 16
  ) {
    for (
      let nameMax = Math.min((item.chunk_name ?? "anonymous").length + 100, Math.max(16, slack));
      nameMax >= 4;
      nameMax -= 10
    ) {
      let h = compactHeaderWithSymbolCap(item, pathMax, nameMax);
      if (h.length > headerUpper) h = h.slice(0, headerUpper).trimEnd();
      if (
        h.length + 1 + OPEN_FENCE.length + CLOSE_FENCE.length <=
        maxChars
      ) {
        return h;
      }
    }
  }
  let fallback = `${item.chunk_type}:…`;
  if (slack >= 12) fallback = ["Path:", fallback].join("\n");
  if (fallback.length + 1 + OPEN_FENCE.length + CLOSE_FENCE.length <= maxChars) {
    return fallback;
  }
  return fallback.slice(0, Math.max(1, slack)).trimEnd();
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

  for (let take = results.length; take >= 1; take--) {
    const subset = results.slice(0, take);
    const headers = resolveHeadersWithinBudget(subset, resolver, maxChars);
    let fixed = totalFixedChars(headers);
    let headerRow = headers;

    if (fixed > maxChars && take === 1) {
      headerRow = [fitSingleChunkHeaderToMaxChars(subset[0]!, maxChars)];
      fixed = totalFixedChars(headerRow);
    }

    if (fixed > maxChars) {
      /** Still too wide (many sections): shorten count again */
      continue;
    }

    let assembled = buildResolvedSections(subset, headerRow, maxChars);
    if (assembled.length > maxChars) {
      headerRow = headerRow.map(stripImportsBlock);
      assembled = buildResolvedSections(subset, headerRow, maxChars);
    }
    if (assembled.length <= maxChars) return assembled;

    if (resolver) {
      const noImp = resolveHeadersWithinBudget(subset, undefined, maxChars);
      if (totalFixedChars(noImp) <= maxChars) {
        assembled = buildResolvedSections(subset, noImp, maxChars);
        if (assembled.length <= maxChars) return assembled;
      }
    }

    /** Rare numeric drift: hard cap without chopping mid-headers when possible */
    return assembled.slice(0, maxChars);
  }

  return "";
}
