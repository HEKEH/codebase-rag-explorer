import { randomUUID } from "node:crypto";
import path from "node:path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { runtimeConfig } from "../config/runtime";
import { parseSemanticNodes } from "../lib/tree-sitter";
import type { ChunkData, ChunkType } from "../types/chunk";
import type { SourceFileRecord } from "../store/repo.store";

const splitterByLanguage = new Map<string, RecursiveCharacterTextSplitter>();
type SupportedSplitterLanguage = "python" | "js";

function languageForPath(filePath: string): SupportedSplitterLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "js";
  if (ext === ".js" || ext === ".jsx") return "js";
  if (ext === ".py") return "python";
  return null;
}

function getRecursiveSplitter(
  filePath: string,
): RecursiveCharacterTextSplitter {
  const language: SupportedSplitterLanguage = languageForPath(filePath) ?? "js";
  const cached = splitterByLanguage.get(language);
  if (cached) return cached;

  const created = RecursiveCharacterTextSplitter.fromLanguage(language, {
    chunkSize: runtimeConfig.chunkMaxLength,
    chunkOverlap: runtimeConfig.chunkOverlap,
  });
  splitterByLanguage.set(language, created);
  return created;
}

async function fallbackSplit(
  content: string,
  filePath: string,
): Promise<string[]> {
  const maxLength = runtimeConfig.chunkMaxLength;
  if (content.length <= maxLength) return [content];
  return getRecursiveSplitter(filePath).splitText(content);
}

async function buildChunksFromText(
  repoId: string,
  filePath: string,
  text: string,
  chunkType: ChunkType,
  chunkName: string | null,
  startLine: number,
  endLine: number,
): Promise<ChunkData[]> {
  const fallbackType: ChunkType =
    text.length > runtimeConfig.chunkMaxLength ? "generic" : chunkType;
  const parts = await fallbackSplit(text, filePath);
  return parts.map((part) => ({
    id: randomUUID(),
    repo_id: repoId,
    file_path: filePath,
    content: part,
    chunk_type: fallbackType,
    chunk_name: chunkName,
    start_line: startLine,
    end_line: endLine,
  }));
}

export class SplitterService {
  async splitFile(
    repoId: string,
    file: SourceFileRecord,
  ): Promise<ChunkData[]> {
    const lines = file.content.split("\n");
    const semanticNodes = parseSemanticNodes(file.path, file.content);
    if (semanticNodes.length === 0) {
      return buildChunksFromText(
        repoId,
        file.path,
        file.content,
        "generic",
        "generic_1",
        1,
        lines.length,
      );
    }

    const chunks: ChunkData[] = [];
    for (const node of semanticNodes) {
      const nodeChunks = await buildChunksFromText(
        repoId,
        file.path,
        node.content,
        node.type,
        node.name,
        node.startLine,
        node.endLine,
      );
      chunks.push(...nodeChunks);
    }

    return chunks;
  }
}
