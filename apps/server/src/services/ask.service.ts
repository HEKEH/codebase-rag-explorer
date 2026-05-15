import { ErrorCode, type AskData } from "@repo/types";
import { ChatAnthropic } from "@langchain/anthropic";
import { runtimeConfig } from "../config/runtime";
import { getRepoById } from "../db/repo.repository";
import { AppError } from "../lib/errors";
import { type RequestLogContext, withRequestLogger } from "../lib/logger";
import { createAskPrompt } from "../lib/prompts";
import {
  buildAskContextFromResults,
} from "../lib/ask-context";
import { extractFileImportSummary } from "../lib/file-import-summary";
import { getSourceFiles } from "../store/repo.store";
import { RetrievalService } from "./retrieval.service";

interface RetrievalClient {
  retrieve(
    question: string,
    repoId: string,
    topK?: number,
    context?: RequestLogContext,
    options?: { chunk_ids?: string[] },
  ): Promise<Awaited<ReturnType<RetrievalService["retrieve"]>>>;
}

interface ChatModelClient {
  invoke(messages: unknown): Promise<{ content: unknown }>;
}

interface AskServiceDeps {
  retrievalService?: RetrievalClient;
  chatModel?: ChatModelClient;
}

type SerializableLlmMessage = {
  role: string;
  content: unknown;
};

function normalizeAskRepoPath(filepath: string): string {
  return filepath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeModelContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function normalizeLlmMessages(messages: unknown): SerializableLlmMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.map((message) => {
    if (typeof message !== "object" || message === null) {
      return {
        role: "unknown",
        content: message,
      };
    }

    const candidate = message as {
      role?: string;
      type?: string;
      content?: unknown;
      _getType?: () => string;
      getType?: () => string;
    };
    const inferredRole =
      typeof candidate.role === "string"
        ? candidate.role
        : typeof candidate._getType === "function"
          ? candidate._getType()
          : typeof candidate.getType === "function"
            ? candidate.getType()
            : typeof candidate.type === "string"
              ? candidate.type
              : "unknown";

    return {
      role: inferredRole,
      content: candidate.content ?? null,
    };
  });
}

function buildReferencesFromWhitelist(
  results: Awaited<ReturnType<RetrievalService["retrieve"]>>,
): AskData["references"] {
  // References are strictly built from retrieval outputs (whitelist),
  // never extracted from answer text.
  return results.map((item) => ({
    chunk_id: item.chunk_id,
    file_path: item.file_path,
    snippet: item.content,
    score: item.score,
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
    const anthropicConfig: ConstructorParameters<typeof ChatAnthropic>[0] &
      Record<string, unknown> = {
      model: process.env.LLM_MODEL ?? "claude-3-5-sonnet-latest",
      temperature: 0,
    };

    if (process.env.ANTHROPIC_API_KEY) {
      anthropicConfig.apiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.ANTHROPIC_BASE_URL) {
      anthropicConfig.baseURL = process.env.ANTHROPIC_BASE_URL;
    }

    this.chatModel = new ChatAnthropic(anthropicConfig);
  }

  async ask(
    repoId: string,
    question: string,
    topK?: number,
    context?: RequestLogContext,
  ): Promise<AskData> {
    const startedAt = Date.now();
    const requestLogger = withRequestLogger(context);
    requestLogger.info({
      event: "ask.service.started",
      repoId,
      topK,
      questionLength: question.length,
    });
    const repo = getRepoById(repoId);
    if (!repo || repo.status !== "indexed") {
      requestLogger.warn({
        event: "ask.service.index_not_built",
        repoId,
        status: repo?.status,
      });
      throw new AppError(ErrorCode.INDEX_NOT_BUILT, "请先构建索引");
    }

    const results = await this.retrievalService.retrieve(
      question,
      repoId,
      topK,
      context,
    );
    if (results.length === 0) {
      requestLogger.warn({
        event: "ask.service.no_relevant_code",
        repoId,
        durationMs: Date.now() - startedAt,
      });
      throw new AppError(
        ErrorCode.NO_RELEVANT_CODE,
        "未找到相关代码，请尝试更具体的问题",
      );
    }

    const contextText = buildAskContextFromResults(results, {
      maxContextTokens: runtimeConfig.maxContextTokens,
      importSummaryForPath: (filePath) => {
        const files = getSourceFiles(repoId);
        if (!files?.length) return undefined;
        const target = normalizeAskRepoPath(filePath);
        const hit = files.find((f) => normalizeAskRepoPath(f.path) === target);
        if (!hit) return undefined;
        const summary = extractFileImportSummary(hit.content, hit.path);
        return summary.length > 0 ? summary : undefined;
      },
    });
    const prompt = createAskPrompt();
    const messages = await prompt.formatMessages({
      question,
      context: contextText,
    });
    requestLogger.debug({
      event: "ask.service.llm.request",
      repoId,
      retrievalCount: results.length,
      llmRequest: {
        question,
        context: contextText,
        topK: topK ?? null,
        messages: normalizeLlmMessages(messages),
      },
    });
    const response = await this.chatModel.invoke(messages);
    requestLogger.debug({
      event: "ask.service.llm.response",
      repoId,
      retrievalCount: results.length,
      llmResponse: {
        content: response.content,
      },
    });
    const answer = normalizeModelContent(response.content).trim();
    requestLogger.info({
      event: "ask.service.finished",
      repoId,
      retrievalCount: results.length,
      answerLength: answer.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      answer: answer || "未生成有效回答，请重试。",
      references: buildReferencesFromWhitelist(results),
      retrieval_fusion: runtimeConfig.retrievalFusion,
    };
  }
}
