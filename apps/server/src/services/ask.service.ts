import { ErrorCode, type AskData } from "@repo/types";
import { runtimeConfig } from "../config/runtime";
import { AppError } from "../lib/errors";
import { getRepoById } from "../store/repo.store";
import { RetrievalService } from "./retrieval.service";

const retrievalService = new RetrievalService();

function trimByApproxTokens(text: string, maxTokens: number): string {
  // Lightweight approximation for MVP: 1 token ~= 4 chars.
  const maxChars = Math.max(1, maxTokens * 4);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function buildContextFromResults(
  results: Awaited<ReturnType<RetrievalService["retrieve"]>>,
  maxContextTokens: number
): string {
  const sections = results.map((item) => {
    return [
      `File: ${item.file_path}`,
      `${item.chunk_type}: ${item.chunk_name ?? "anonymous"}`,
      "```",
      item.content,
      "```"
    ].join("\n");
  });
  return trimByApproxTokens(sections.join("\n\n---\n\n"), maxContextTokens);
}

function generateAnswer(question: string, context: string): string {
  const preview = context.slice(0, 300).replace(/\s+/g, " ").trim();
  return [
    `基于检索到的代码，问题“${question}”的关键实现已经定位。`,
    "你可以先从返回的 references 查看对应文件与片段，再沿调用链继续追踪。",
    preview.length > 0 ? `上下文摘要：${preview}...` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildReferencesFromWhitelist(
  results: Awaited<ReturnType<RetrievalService["retrieve"]>>
): AskData["references"] {
  // References are strictly built from retrieval outputs (whitelist),
  // never extracted from answer text.
  return results.map((item) => ({
    chunk_id: item.chunk_id,
    file_path: item.file_path,
    snippet: item.content,
    score: item.score
  }));
}

export class AskService {
  async ask(repoId: string, question: string, topK?: number): Promise<AskData> {
    const repo = getRepoById(repoId);
    if (!repo || repo.status !== "indexed") {
      throw new AppError(ErrorCode.INDEX_NOT_BUILT, "请先构建索引");
    }

    const results = await retrievalService.retrieve(question, repoId, topK);
    if (results.length === 0) {
      throw new AppError(ErrorCode.NO_RELEVANT_CODE, "未找到相关代码，请尝试更具体的问题");
    }

    const context = buildContextFromResults(results, runtimeConfig.maxContextTokens);
    const answer = generateAnswer(question, context);

    return {
      answer,
      references: buildReferencesFromWhitelist(results)
    };
  }
}
