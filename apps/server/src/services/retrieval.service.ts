import { runtimeConfig } from "../config/runtime";
import { getChunksByRepoId } from "../db/chunk.repository";
import { type RequestLogContext, withRequestLogger } from "../lib/logger";
import { SQLiteVectorStore } from "../lib/sqlite-vector-store";
import type { RetrievalResult } from "../types/retrieval";
import { EmbedderService } from "./embedder.service";

interface QueryEmbedder {
  embedQuestion(question: string): Promise<number[]>;
  getEmbeddingsClient?(): ConstructorParameters<typeof SQLiteVectorStore>[0];
}

interface RetrievalVectorStore {
  similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: { repo_id?: string; chunk_ids?: string[] },
  ): Promise<
    Array<
      [
        {
          pageContent: string;
          metadata: Record<string, unknown>;
        },
        number,
      ]
    >
  >;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value;
  return null;
}

function toString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeMinMax(score: number, min: number, max: number): number {
  if (!Number.isFinite(score)) return 0;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 1;
  return (score - min) / (max - min);
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeQuestion(question: string): string[] {
  const lower = question.toLowerCase();
  const matches = lower.match(/[a-z0-9_./-]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? [];
  const stop = new Set([
    "what",
    "where",
    "which",
    "how",
    "when",
    "with",
    "from",
    "that",
    "this",
    "以及",
    "如何",
    "什么",
    "在哪",
    "哪里",
    "定义",
    "逻辑",
    "调用",
    "链路",
  ]);
  const dedup = new Set<string>();
  for (const token of matches) {
    if (token.length < 2) continue;
    if (stop.has(token)) continue;
    dedup.add(token);
  }
  return Array.from(dedup);
}

type RetrievalIntent = "locate" | "explain";

function detectIntent(question: string): RetrievalIntent {
  const q = question.toLowerCase();
  // "locate" style questions benefit from lexical/path signals.
  if (
    /哪里|在哪|定义|位于|路径|route|api|文件|模块|调用链|链路|where|defined/.test(
      q,
    )
  ) {
    return "locate";
  }
  return "explain";
}

function countTokenBoundaryHits(text: string, token: string): number {
  // Prefer boundary-like matching to reduce accidental substring noise.
  const pattern = new RegExp(
    `(^|[^a-z0-9_])${escapeRegex(token)}([^a-z0-9_]|$)`,
    "g",
  );
  return (text.match(pattern) ?? []).length;
}

function lexicalScoreChunk(
  chunk: {
    file_path: string;
    chunk_name: string | null;
    content: string;
  },
  tokens: string[],
): number {
  if (tokens.length === 0) return 0;
  const filePath = chunk.file_path.toLowerCase();
  const chunkName = (chunk.chunk_name ?? "").toLowerCase();
  const content = chunk.content.toLowerCase();

  let score = 0;
  for (const token of tokens) {
    // Path/symbol hits are stronger signals for module/call-chain questions.
    const pathHits =
      countTokenBoundaryHits(filePath, token) ||
      (filePath.includes(token) ? 1 : 0);
    const nameHits =
      countTokenBoundaryHits(chunkName, token) ||
      (chunkName.includes(token) ? 1 : 0);
    const contentHits = countTokenBoundaryHits(content, token);

    score += pathHits * 4;
    score += nameHits * 3;
    score += contentHits * 0.5;
  }
  return score;
}

export class RetrievalService {
  private readonly vectorStore: RetrievalVectorStore;

  constructor(
    private readonly embedder: QueryEmbedder = new EmbedderService(),
    vectorStore?: RetrievalVectorStore,
  ) {
    this.vectorStore =
      vectorStore ??
      new SQLiteVectorStore(
        this.embedder.getEmbeddingsClient
          ? this.embedder.getEmbeddingsClient()
          : new EmbedderService().getEmbeddingsClient(),
      );
  }

  async retrieve(
    question: string,
    repoId: string,
    topK = runtimeConfig.defaultTopK,
    context?: RequestLogContext,
  ): Promise<RetrievalResult[]> {
    const startedAt = Date.now();
    const requestLogger = withRequestLogger(context);
    const intent = detectIntent(question);
    requestLogger.debug({
      event: "retrieval.started",
      repoId,
      topK,
      questionLength: question.length,
      intent,
    });
    const queryVector = await this.embedder.embedQuestion(question);
    const semanticTopK = Math.max(topK * 3, topK);
    const ranked = await this.vectorStore.similaritySearchVectorWithScore(
      queryVector,
      semanticTopK,
      { repo_id: repoId },
    );
    const semanticResults = ranked
      .map(([doc, score]) => ({
        chunk_id: toString(doc.metadata.chunk_id),
        file_path: toString(doc.metadata.file_path),
        content: doc.pageContent,
        chunk_type: toString(doc.metadata.chunk_type, "generic"),
        chunk_name: toStringOrNull(doc.metadata.chunk_name),
        score,
      }))
      .filter((item) => item.chunk_id.length > 0);

    const semanticScores = semanticResults.map((item) => item.score);
    const semanticMin =
      semanticScores.length > 0 ? Math.min(...semanticScores) : 0;
    const semanticMax =
      semanticScores.length > 0 ? Math.max(...semanticScores) : 1;

    const semanticNormalized = semanticResults.map((item) => ({
      ...item,
      score: normalizeMinMax(item.score, semanticMin, semanticMax),
    }));

    // Hybrid retrieval: combine vector similarity and lexical/path matching.
    // This improves "where is X defined" / module-location / call-chain questions.
    const tokens = tokenizeQuestion(question);
    const repoChunks = getChunksByRepoId(repoId);
    const lexicalCandidates = repoChunks
      .map((chunk) => ({
        chunk_id: chunk.id,
        file_path: chunk.file_path,
        content: chunk.content,
        chunk_type: chunk.chunk_type,
        chunk_name: chunk.chunk_name,
        lexicalScore: lexicalScoreChunk(chunk, tokens),
      }))
      .filter((item) => item.lexicalScore > 0 && item.chunk_id.length > 0)
      .sort((a, b) => b.lexicalScore - a.lexicalScore)
      .slice(0, Math.max(topK * 4, topK));

    const lexicalMin =
      lexicalCandidates.length > 0
        ? Math.min(...lexicalCandidates.map((item) => item.lexicalScore))
        : 0;
    const lexicalMax =
      lexicalCandidates.length > 0
        ? Math.max(...lexicalCandidates.map((item) => item.lexicalScore))
        : 1;
    const fused = new Map<string, RetrievalResult>();

    // Dynamic weights:
    // - locate questions: lexical/path gets higher weight.
    // - explain questions: semantic similarity dominates.
    const semanticWeight = intent === "locate" ? 0.45 : 0.75;
    const lexicalWeight = intent === "locate" ? 0.55 : 0.25;

    semanticNormalized.forEach((item) => {
      fused.set(item.chunk_id, {
        ...item,
        score: item.score * semanticWeight,
      });
    });

    lexicalCandidates.forEach((item) => {
      const lexicalNormalized = normalizeMinMax(
        item.lexicalScore,
        lexicalMin,
        lexicalMax,
      );
      const existing = fused.get(item.chunk_id);
      if (!existing) {
        fused.set(item.chunk_id, {
          chunk_id: item.chunk_id,
          file_path: item.file_path,
          content: item.content,
          chunk_type: item.chunk_type,
          chunk_name: item.chunk_name,
          score: lexicalNormalized * lexicalWeight,
        });
        return;
      }
      existing.score += lexicalNormalized * lexicalWeight;
    });

    const results = Array.from(fused.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    requestLogger.info({
      event: "retrieval.finished",
      repoId,
      topK,
      tokenCount: tokens.length,
      semanticCandidates: semanticNormalized.length,
      lexicalCandidates: lexicalCandidates.length,
      resultCount: results.length,
      durationMs: Date.now() - startedAt,
    });
    return results;
  }
}
