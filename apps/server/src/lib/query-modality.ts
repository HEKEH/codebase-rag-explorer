/**
 * Phase 3 — 查询内容模态（NL vs PL）的 **auto** 启发式判别。
 * 与 `detectIntent`（locate / explain）正交；`force_nl` / `force_pl` 由 `resolveQueryContentModality` 应用（P3-2）。
 *
 * 设计对齐：`docs/02-technical/retrieval-enhancement-design.md` §3.C
 * — 标识符/路径/括号与分号密度高 → PL；自然语言疑问句式 → NL。
 */

import type { RetrievalQueryModality } from "../config/runtime";

export type QueryContentModality = "nl" | "pl";

const RE_PATHY =
  /[/\\](?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|go|rs|py|java|kt|swift|rb)\b/i;

const RE_REPO_SEGMENT = /\b(?:src|apps|packages|lib|tests?|__tests__)\b[/\\]/i;

const RE_CODE_KEYWORD =
  /\b(?:function|class|interface|type|enum|import|export|async|await|return|const|let|var|extends|implements|namespace|module|package|struct|trait|impl|fn|mut|pub|use|where|def|self)\b/;

const RE_ARROW_OR_DOUBLE_COLON = /=>|::|->/;

const RE_NL_WH_START =
  /^(?:what|how|why|where|when|who|which|is|are|was|were|can|could|would|should|do|does|did|has|have|had|will|shall|may|might|must|please|explain|describe|tell\s+me|walk\s+me|show\s+me|help\s+me)\b/i;

const RE_NL_CN =
  /(?:怎么|如何|为什么|在哪|哪里|哪个|什么|是否|能否|帮我|请问|解释一下|说下|讲讲)|(?:吗|呢)[？?]?\s*$/;

const RE_ENDS_QUESTION = /[?？]\s*$/;

function nonSpaceLength(s: string): number {
  return s.replace(/\s/g, "").length;
}

function codePunctuationRatio(nonSpace: string): number {
  if (nonSpace.length === 0) return 0;
  const hits = nonSpace.match(/[()[\]{};:,<>=]|=>|::|->/g);
  return (hits?.length ?? 0) / nonSpace.length;
}

function parenBracketCount(s: string): number {
  return (s.match(/[()[\]{}]/g) ?? []).length;
}

function looksLikeSingleCodeIdentifierOrPath(q: string): boolean {
  if (/\s/.test(q) || q.length < 3) return false;
  if (!/^[A-Za-z_.][\w.]*$/.test(q)) return false;
  if (RE_PATHY.test(q)) return true;
  if (/[._]/.test(q) && /[A-Za-z]/.test(q)) return true;
  if (/[a-z][A-Z]/.test(q)) return true;
  return /^[A-Z][a-zA-Z0-9]*$/.test(q) && q.length >= 3;
}

/**
 * 在 `RETRIEVAL_QUERY_MODALITY=auto` 时，从用户原始问题推断 **内容** 模态（NL vs PL）。
 * 误判时可用 `RETRIEVAL_QUERY_MODALITY=force_nl|force_pl` 覆盖（见 `resolveQueryContentModality`）。
 */
export function inferAutoQueryContentModality(raw: string): QueryContentModality {
  const q = raw.trim();
  if (q.length === 0) return "nl";

  let pl = 0;
  let nl = 0;

  const nonSpace = q.replace(/\s/g, "");
  const punctRatio = codePunctuationRatio(nonSpace);
  const parens = parenBracketCount(q);

  if (RE_ENDS_QUESTION.test(q)) nl += 3;
  if (RE_NL_CN.test(q)) nl += 4;
  if (RE_NL_WH_START.test(q)) nl += 3;

  if (RE_CODE_KEYWORD.test(q)) pl += 4;
  if (RE_ARROW_OR_DOUBLE_COLON.test(q)) pl += 2;
  if (/;\s*$/.test(q) || /;\s*\r?\n/.test(q)) pl += 1;
  if (/\)\s*:\s*[\w[{<]/.test(q)) pl += 3;
  if (/Promise\s*</.test(q) || /\bArray\s*</.test(q)) pl += 2;
  if (/[{}]\s*;/.test(q)) pl += 1;
  if (/\([^)]*\)\s*\{/.test(q)) pl += 2;
  if (/<\s*[A-Za-z][\w\s|&,]*>\s*\(/.test(q)) pl += 2;

  if (RE_PATHY.test(q)) pl += 5;
  if (RE_REPO_SEGMENT.test(q)) pl += 2;

  if (parens >= 4 && q.length <= 500) pl += Math.min(4, 1 + Math.floor(parens / 4));
  if (punctRatio >= 0.11) pl += 3;
  if (punctRatio < 0.04 && q.length >= 36) nl += 1;

  if (/\b[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*){2,}\b/.test(q)) pl += 2;

  if (looksLikeSingleCodeIdentifierOrPath(q)) pl += 3;

  if (pl > nl) return "pl";
  return "nl";
}

/**
 * 将 `RETRIEVAL_QUERY_MODALITY`（`auto` \| `force_nl` \| `force_pl`）解析结果与问句结合，
 * 得到用于检索路由的 **`nl` \| `pl`** 内容模态。
 */
export function resolveQueryContentModality(
  setting: RetrievalQueryModality,
  rawQuestion: string,
): QueryContentModality {
  if (setting === "force_nl") return "nl";
  if (setting === "force_pl") return "pl";
  return inferAutoQueryContentModality(rawQuestion);
}
