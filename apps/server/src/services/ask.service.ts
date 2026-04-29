import { ErrorCode, type AskData } from "@repo/types";
import { ChatAnthropic } from "@langchain/anthropic";
import { runtimeConfig } from "../config/runtime";
import { getRepoById } from "../db/repo.repository";
import { AppError } from "../lib/errors";
import { type RequestLogContext, withRequestLogger } from "../lib/logger";
import { createAskPrompt } from "../lib/prompts";
import { RetrievalService } from "./retrieval.service";

interface RetrievalClient {
  retrieve(
    question: string,
    repoId: string,
    topK?: number,
    context?: RequestLogContext
  ): Promise<Awaited<ReturnType<RetrievalService["retrieve"]>>>;
}

interface ChatModelClient {
  invoke(messages: unknown): Promise<{ content: unknown }>;
}

interface AskServiceDeps {
  retrievalService?: RetrievalClient;
  chatModel?: ChatModelClient;
}

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

function normalizeModelContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }
  return "";
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
  private readonly retrievalService: RetrievalClient;
  private readonly chatModel: ChatModelClient;

  constructor(deps: AskServiceDeps = {}) {
    this.retrievalService = deps.retrievalService ?? new RetrievalService();
    if (deps.chatModel) {
      this.chatModel = deps.chatModel;
      return;
    }
    const anthropicConfig: ConstructorParameters<typeof ChatAnthropic>[0] & Record<string, unknown> = {
      model: process.env.LLM_MODEL ?? "claude-3-5-sonnet-latest",
      temperature: 0
    };

    if (process.env.ANTHROPIC_API_KEY) {
      anthropicConfig.apiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.ANTHROPIC_BASE_URL) {
      anthropicConfig.baseURL = process.env.ANTHROPIC_BASE_URL;
    }

    this.chatModel = new ChatAnthropic(anthropicConfig);
  }

  async ask(repoId: string, question: string, topK?: number, context?: RequestLogContext): Promise<AskData> {
    const startedAt = Date.now();
    const requestLogger = withRequestLogger(context);
    requestLogger.info({
      event: "ask.service.started",
      repoId,
      topK,
      questionLength: question.length
    });
    const repo = getRepoById(repoId);
    if (!repo || repo.status !== "indexed") {
      requestLogger.warn({
        event: "ask.service.index_not_built",
        repoId,
        status: repo?.status
      });
      throw new AppError(ErrorCode.INDEX_NOT_BUILT, "请先构建索引");
    }

    const results = await this.retrievalService.retrieve(question, repoId, topK, context);
    if (results.length === 0) {
      requestLogger.warn({
        event: "ask.service.no_relevant_code",
        repoId,
        durationMs: Date.now() - startedAt
      });
      throw new AppError(ErrorCode.NO_RELEVANT_CODE, "未找到相关代码，请尝试更具体的问题");
    }

    const contextText = buildContextFromResults(results, runtimeConfig.maxContextTokens);
    const prompt = createAskPrompt();
    const messages = await prompt.formatMessages({ question, context: contextText });
    requestLogger.debug({
      event: "ask.service.llm.invoking",
      repoId,
      retrievalCount: results.length
    });
    const response = await this.chatModel.invoke(messages);
    const answer = normalizeModelContent(response.content).trim();
    requestLogger.info({
      event: "ask.service.finished",
      repoId,
      retrievalCount: results.length,
      answerLength: answer.length,
      durationMs: Date.now() - startedAt
    });

    return {
      answer: answer || "未生成有效回答，请重试。",
      references: buildReferencesFromWhitelist(results)
    };
  }
}
