import { randomUUID } from "node:crypto";
import path from "node:path";
import { runtimeConfig } from "../config/runtime";
import type { ChunkData, ChunkType } from "../types/chunk";
import type { SourceFileRecord } from "../store/repo.store";

function getChunkTypeFromLine(line: string): ChunkType | null {
  const trimmed = line.trim();
  if (
    /^export\s+class\s+\w+/.test(trimmed) ||
    /^class\s+\w+/.test(trimmed) ||
    /^export\s+default\s+class\s+\w+/.test(trimmed)
  ) {
    return "class";
  }
  if (
    /^export\s+(async\s+)?function\s+\w+/.test(trimmed) ||
    /^(async\s+)?function\s+\w+/.test(trimmed) ||
    /^(const|let|var)\s+\w+\s*=\s*(async\s*)?\(?.*\)?\s*=>/.test(trimmed) ||
    /^def\s+\w+\(/.test(trimmed)
  ) {
    return "function";
  }
  return null;
}

function getChunkNameFromLine(line: string): string | null {
  const classMatch = line.match(/class\s+([A-Za-z0-9_]+)/);
  if (classMatch?.[1]) return classMatch[1];
  const functionMatch =
    line.match(/function\s+([A-Za-z0-9_]+)/) ||
    line.match(/def\s+([A-Za-z0-9_]+)\s*\(/) ||
    line.match(/(const|let|var)\s+([A-Za-z0-9_]+)\s*=/);
  if (!functionMatch) return null;
  return functionMatch[2] ?? functionMatch[1] ?? null;
}

function fallbackSplit(content: string): string[] {
  const maxLength = runtimeConfig.chunkMaxLength;
  const overlap = runtimeConfig.chunkOverlap;
  if (content.length <= maxLength) return [content];
  const parts: string[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const next = Math.min(cursor + maxLength, content.length);
    parts.push(content.slice(cursor, next));
    if (next === content.length) break;
    cursor = Math.max(0, next - overlap);
  }
  return parts;
}

export class SplitterService {
  splitFile(repoId: string, file: SourceFileRecord): ChunkData[] {
    const ext = path.extname(file.path).toLowerCase();
    const lines = file.content.split("\n");
    const chunks: ChunkData[] = [];

    // Lightweight AST-like semantic split for MVP:
    // use declaration signatures (class/function) as top-level anchors.
    const supportedSemanticExt = new Set([".ts", ".tsx", ".js", ".jsx", ".py"]);

    if (!supportedSemanticExt.has(ext)) {
      return fallbackSplit(file.content).map((part, index) => ({
        id: randomUUID(),
        repo_id: repoId,
        file_path: file.path,
        content: part,
        chunk_type: "generic",
        chunk_name: `generic_${index + 1}`,
        start_line: 1,
        end_line: lines.length
      }));
    }

    let currentStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const chunkType = getChunkTypeFromLine(lines[i]);
      if (!chunkType) continue;

      if (i > currentStart) {
        const genericBlock = lines.slice(currentStart, i).join("\n").trim();
        if (genericBlock.length > 0) {
          fallbackSplit(genericBlock).forEach((part, index) => {
            chunks.push({
              id: randomUUID(),
              repo_id: repoId,
              file_path: file.path,
              content: part,
              chunk_type: "generic",
              chunk_name: `generic_${chunks.length + index + 1}`,
              start_line: currentStart + 1,
              end_line: i
            });
          });
        }
      }

      let blockEnd = lines.length - 1;
      for (let j = i + 1; j < lines.length; j++) {
        if (getChunkTypeFromLine(lines[j])) {
          blockEnd = j - 1;
          break;
        }
      }

      const block = lines.slice(i, blockEnd + 1).join("\n").trim();
      fallbackSplit(block).forEach((part, index) => {
        chunks.push({
          id: randomUUID(),
          repo_id: repoId,
          file_path: file.path,
          content: part,
          chunk_type: chunkType,
          chunk_name: getChunkNameFromLine(lines[i]) ?? `${chunkType}_${i + 1}_${index + 1}`,
          start_line: i + 1,
          end_line: blockEnd + 1
        });
      });

      currentStart = blockEnd + 1;
      i = blockEnd;
    }

    if (currentStart < lines.length) {
      const rest = lines.slice(currentStart).join("\n").trim();
      if (rest.length > 0) {
        fallbackSplit(rest).forEach((part, index) => {
          chunks.push({
            id: randomUUID(),
            repo_id: repoId,
            file_path: file.path,
            content: part,
            chunk_type: "generic",
            chunk_name: `generic_tail_${index + 1}`,
            start_line: currentStart + 1,
            end_line: lines.length
          });
        });
      }
    }

    return chunks;
  }
}
