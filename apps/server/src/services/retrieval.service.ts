import type { RetrievalSparseMode } from "../config/runtime";
import { runtimeConfig } from "../config/runtime";
import {
  getChunksByIds,
  getChunksByRepoId,
  searchChunkIdsByFtsBm25,
} from "../db/chunk.repository";
import { buildFtsOrMatchFromRetrievalTokens } from "../lib/fts-query-normalize";
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

export type RetrievalDataAccess = {
  getChunksByRepoId: typeof getChunksByRepoId;
  getChunksByIds: typeof getChunksByIds;
  searchChunkIdsByFtsBm25: typeof searchChunkIdsByFtsBm25;
};

type LexicalCandidate = {
  chunk_id: string;
  file_path: string;
  content: string;
  chunk_type: string;
  chunk_name: string | null;
  lexicalScore: number;
};

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

function lexicalCandidatesFromFullTableScan(
  data: RetrievalDataAccess,
  repoId: string,
  tokens: string[],
  topK: number,
  chunkIdsFilter?: string[],
): LexicalCandidate[] {
  let repoChunks = data.getChunksByRepoId(repoId);
  if (chunkIdsFilter && chunkIdsFilter.length > 0) {
    const allow = new Set(chunkIdsFilter);
    repoChunks = repoChunks.filter((c) => allow.has(c.id));
  }
  return repoChunks
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
}

function denseRecallLimit(topK: number): number {
  const n = runtimeConfig.retrievalDenseTopN;
  if (n == null) return Math.max(topK * 3, topK);
  return Math.max(n, topK);
}

function lexicalCandidatesFromBm25Fts(
  data: RetrievalDataAccess,
  repoId: string,
  tokens: string[],
  chunkIdsFilter?: string[],
): LexicalCandidate[] {
  const matchExpr = buildFtsOrMatchFromRetrievalTokens(tokens);
  if (!matchExpr) return [];

  const hits = data.searchChunkIdsByFtsBm25(
    repoId,
    matchExpr,
    runtimeConfig.retrievalBm25TopN,
    chunkIdsFilter,
  );
  if (hits.length === 0) return [];

  const chunks = data.getChunksByIds(hits.map((h) => h.chunk_id));
  const chunkMap = new Map(chunks.map((c) => [c.id, c]));
  const bm25s = hits.map((h) => h.bm25);
  const minB = Math.min(...bm25s);
  const maxB = Math.max(...bm25s);

  const out: LexicalCandidate[] = [];
  for (const h of hits) {
    const chunk = chunkMap.get(h.chunk_id);
    if (!chunk) continue;
    const lexicalScore = maxB <= minB ? 1 : (maxB - h.bm25) / (maxB - minB);
    out.push({
      chunk_id: chunk.id,
      file_path: chunk.file_path,
      content: chunk.content,
      chunk_type: chunk.chunk_type,
      chunk_name: chunk.chunk_name,
      lexicalScore,
    });
  }
  return out;
}

export class RetrievalService {
  private readonly vectorStore: RetrievalVectorStore;
  private readonly sparseMode: RetrievalSparseMode;
  private readonly dataAccess: RetrievalDataAccess;

  constructor(
    private readonly embedder: QueryEmbedder = new EmbedderService(),
    vectorStore?: RetrievalVectorStore,
    init?: {
      sparseMode?: RetrievalSparseMode;
      dataAccess?: Partial<RetrievalDataAccess>;
    },
  ) {
    this.vectorStore =
      vectorStore ??
      new SQLiteVectorStore(
        this.embedder.getEmbeddingsClient
          ? this.embedder.getEmbeddingsClient()
          : new EmbedderService().getEmbeddingsClient(),
      );
    this.sparseMode = init?.sparseMode ?? runtimeConfig.retrievalSparseMode;
    this.dataAccess = {
      getChunksByRepoId,
      getChunksByIds,
      searchChunkIdsByFtsBm25,
      ...init?.dataAccess,
    };
  }

  async retrieve(
    question: string,
    repoId: string,
    topK = runtimeConfig.defaultTopK,
    context?: RequestLogContext,
    options?: { chunk_ids?: string[] },
  ): Promise<RetrievalResult[]> {
    const startedAt = Date.now();
    const requestLogger = withRequestLogger(context);
    const intent = detectIntent(question);

    if (options?.chunk_ids !== undefined && options.chunk_ids.length === 0) {
      requestLogger.debug({
        event: "retrieval.started",
        repoId,
        topK,
        questionLength: question.length,
        intent,
        sparseMode: this.sparseMode,
        chunkIdsFilterSize: 0,
        skipReason: "empty_chunk_ids_whitelist",
      });
      requestLogger.info({
        event: "retrieval.finished",
        repoId,
        topK,
        semanticCandidates: 0,
        lexicalCandidates: 0,
        resultCount: 0,
        durationMs: Date.now() - startedAt,
        sparseMode: this.sparseMode,
        sparseSource: "none",
        chunkIdsFilterEmpty: true,
        skipReason: "empty_chunk_ids_whitelist",
      });
      return [];
    }

    const chunkIdsFilter =
      options?.chunk_ids && options.chunk_ids.length > 0
        ? [...new Set(options.chunk_ids)]
        : undefined;

    requestLogger.debug({
      event: "retrieval.started",
      repoId,
      topK,
      questionLength: question.length,
      intent,
      sparseMode: this.sparseMode,
      chunkIdsFilterSize: chunkIdsFilter?.length ?? 0,
    });

    const queryVector = await this.embedder.embedQuestion(question);
    const semanticTopK = denseRecallLimit(topK);
    const vectorFilter =
      chunkIdsFilter !== undefined
        ? { repo_id: repoId, chunk_ids: chunkIdsFilter }
        : { repo_id: repoId };

    const ranked = await this.vectorStore.similaritySearchVectorWithScore(
      queryVector,
      semanticTopK,
      vectorFilter,
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

    const tokens = tokenizeQuestion(question);
    let lexicalCandidates: LexicalCandidate[];
    let sparseSource: "bm25_fts" | "full_table" | "none";

    if (tokens.length === 0) {
      sparseSource = "none";
      lexicalCandidates = [];
    } else if (this.sparseMode === "full_table") {
      sparseSource = "full_table";
      lexicalCandidates = lexicalCandidatesFromFullTableScan(
        this.dataAccess,
        repoId,
        tokens,
        topK,
        chunkIdsFilter,
      );
    } else {
      sparseSource = "bm25_fts";
      lexicalCandidates = lexicalCandidatesFromBm25Fts(
        this.dataAccess,
        repoId,
        tokens,
        chunkIdsFilter,
      );
    }

    const lexicalMin =
      lexicalCandidates.length > 0
        ? Math.min(...lexicalCandidates.map((item) => item.lexicalScore))
        : 0;
    const lexicalMax =
      lexicalCandidates.length > 0
        ? Math.max(...lexicalCandidates.map((item) => item.lexicalScore))
        : 1;
    const fused = new Map<string, RetrievalResult>();

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
      sparseMode: this.sparseMode,
      sparseSource,
    });
    return results;
  }
}
