/** Cap for prefix injected into index / FTS body (chars). */
const MAX_IMPORT_SUMMARY_CHARS = 1200;

function isLeadingPreambleLine(line: string): boolean {
  const t = line.trim();
  if (t === "") return true;
  if (t.startsWith("#")) return true;
  if (t === '"use strict"' || t === "'use strict'") return true;
  if (t.startsWith("//")) return true;
  if (t.startsWith("/*") || t.startsWith("*") || t === "*/") return true;
  return false;
}

function looksLikeTopImportLine(line: string): boolean {
  const t = line.trimStart();
  if (/^import\s*\(/.test(t)) return true;
  if (/^import\s+/.test(t)) return true;
  if (/^export\s+/.test(t) && /\bfrom\s+['"]/.test(t)) return true;
  if (/^from\s+\S+\s+import\b/.test(t)) return true;
  if (/^use\s+/.test(t)) return true;
  return false;
}

function isSkippableBeforeFirstImport(line: string): boolean {
  if (isLeadingPreambleLine(line)) return true;
  const t = line.trim();
  if (/^package\s+/.test(t)) return true;
  if (/^module\s+/.test(t)) return true;
  return false;
}

function joinLinesFrom(lines: string[], from: number): string {
  return lines.slice(from).join("\n");
}

/**
 * Skip a leading Python module docstring (`"""` / `'''`) after normal preamble,
 * so `import` lines below it are still collected.
 */
function stripPythonLeadingModuleDocstringIfPresent(
  fileContent: string,
  filePath: string,
): string {
  const lower = filePath.toLowerCase();
  if (!lower.endsWith(".py") && !lower.endsWith(".pyi")) return fileContent;

  const lines = fileContent.split("\n");
  let idx = 0;
  while (idx < lines.length && isSkippableBeforeFirstImport(lines[idx])) {
    idx++;
  }
  if (idx >= lines.length) return fileContent;

  const raw = lines[idx];
  const t = raw.trimStart();
  const triple = t.startsWith('"""')
    ? '"""'
    : t.startsWith("'''")
      ? "'''"
      : null;
  if (!triple) return fileContent;

  const openIdx = raw.indexOf(triple);
  const afterOpen = raw.slice(openIdx + triple.length);
  if (afterOpen.includes(triple)) {
    return joinLinesFrom(lines, idx + 1);
  }

  idx++;
  while (idx < lines.length) {
    if (lines[idx].includes(triple)) {
      return joinLinesFrom(lines, idx + 1);
    }
    idx++;
  }
  return fileContent;
}

/**
 * Collects contiguous import / export-from lines from the **top** of a source file
 * (after blank lines and common preamble). Mid-file imports are intentionally ignored
 * to keep summaries cheap and stable across chunks.
 *
 * @param filePath - Used for Python `.py` / `.pyi` to skip a leading module docstring.
 */
export function extractFileImportSummary(
  fileContent: string,
  filePath = "",
): string {
  const content = stripPythonLeadingModuleDocstringIfPresent(
    fileContent,
    filePath,
  );
  const lines = content.split("\n");
  const collected: string[] = [];
  let goImportParenDepth = 0;

  for (const line of lines) {
    if (goImportParenDepth > 0) {
      const next = [...collected, line.trimEnd()].join("\n");
      if (next.length > MAX_IMPORT_SUMMARY_CHARS) break;
      collected.push(line.trimEnd());
      const open = (line.match(/\(/g) ?? []).length;
      const close = (line.match(/\)/g) ?? []).length;
      goImportParenDepth += open - close;
      continue;
    }

    if (collected.length === 0 && isSkippableBeforeFirstImport(line)) {
      continue;
    }

    if (looksLikeTopImportLine(line)) {
      const next = [...collected, line.trimEnd()].join("\n");
      if (next.length > MAX_IMPORT_SUMMARY_CHARS) break;
      collected.push(line.trimEnd());
      const t = line.trimStart();
      if (/^import\s*\(/.test(t)) {
        const open = (line.match(/\(/g) ?? []).length;
        const close = (line.match(/\)/g) ?? []).length;
        goImportParenDepth = open - close;
      }
      continue;
    }

    if (collected.length > 0) break;
    break;
  }

  return collected.join("\n").trim();
}
