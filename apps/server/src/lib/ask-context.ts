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

function trimByApproxTokens(text: string, maxTokens: number): string {
  const maxChars = approxMaxChars(maxTokens);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export function capImportSummaryForAsk(summary: string, cap = ASK_CONTEXT_IMPORT_SUMMARY_CAP): string {
  const t = summary.trim();
  if (t.length === 0) return "";
  if (t.length <= cap) return t;
  return `${t.slice(0, cap).trimEnd()}…`;
}

function buildHeaderForResult(item: RetrievalResult, importLines: string | undefined): string {
  const head = [`Path: ${item.file_path}`, `${item.chunk_type}: ${item.chunk_name ?? "anonymous"}`];
  const imp = importLines?.trim();
  if (!imp || imp.length === 0) {
    return head.join("\n");
  }
  return [...head, "Imports:", imp].join("\n");
}

function sectionEnvelope(header: string, body: string): string {
  return `${header}\n${OPEN_FENCE}${body}${CLOSE_FENCE}`;
}

/**
 * Builds LLM retrieval context from ranked results (Phase 5 P5-1 baseline).
 */
export function buildAskContextFromResults(
  results: RetrievalResult[],
  opts: BuildAskContextOptions,
): string {
  const resolver = opts.importSummaryForPath;
  const sections = results.map((item) => {
    const raw = resolver?.(item.file_path);
    const capped = raw && raw.trim().length > 0 ? capImportSummaryForAsk(raw) : undefined;
    const header = buildHeaderForResult(item, capped);
    return sectionEnvelope(header, item.content ?? "");
  });
  return trimByApproxTokens(sections.join(SECTION_SEPARATOR), opts.maxContextTokens);
}
