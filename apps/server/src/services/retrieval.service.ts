import type { RetrievalSparseMode } from "../config/runtime";
import { runtimeConfig } from "../config/runtime";
import {
  RETRIEVAL_DENSE_MODALITY_NL_MULT,
  RETRIEVAL_DENSE_MODALITY_PL_MULT,
  RETRIEVAL_RRF_MODAL_NL_BM25_MULT,
  RETRIEVAL_RRF_MODAL_NL_DENSE_WEIGHT,
  RETRIEVAL_RRF_MODAL_PL_BM25_MULT,
  RETRIEVAL_RRF_MODAL_PL_DENSE_WEIGHT,
  RETRIEVAL_RRF_WEIGHT_ABS_MAX,
  RETRIEVAL_SPARSE_MODALITY_PL_DEPTH_MULT,
  RETRIEVAL_WEIGHTED_LEXICAL_CLAMP_MAX,
  RETRIEVAL_WEIGHTED_LEXICAL_CLAMP_MIN,
  RETRIEVAL_WEIGHTED_MODALITY_NUDGE,
  RETRIEVAL_WEIGHTED_SEMANTIC_CLAMP_MAX,
  RETRIEVAL_WEIGHTED_SEMANTIC_CLAMP_MIN,
} from "@repo/constants";
import {
  getChunksByIds,
  getChunksByRepoId,
  searchChunkIdsByFtsBm25,
} from "../db/chunk.repository";
import { buildFtsOrMatchFromRetrievalTokens } from "../lib/fts-query-normalize";
import { reciprocalRankFusionTwoList } from "../lib/reciprocal-rank-fusion";
import { resolveQueryContentModality, type QueryContentModality } from "../lib/query-modality";
import {
  assertQueryVectorDimension,
  assertRetrievalEmbeddingModelMatchesIndex,
} from "../lib/embedding-repo-compatibility";
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
  chunkIdsFilter: string[] | undefined,
  lexicalTopLimit: number,
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
    .slice(0, lexicalTopLimit);
}

/** Jaccard similarity on chunk_id sets from dense vs sparse ranked lists. */
function denseSparseChunkIdJaccard(
  denseChunkIds: readonly string[],
  sparseChunkIds: readonly string[],
): number {
  if (denseChunkIds.length === 0 && sparseChunkIds.length === 0) return 0;
  const d = new Set(denseChunkIds);
  const s = new Set(sparseChunkIds);
  let inter = 0;
  for (const id of d) {
    if (s.has(id)) inter++;
  }
  const union = d.size + s.size - inter;
  return union > 0 ? inter / union : 0;
}

function denseRecallLimit(
  topK: number,
  queryContentModality: QueryContentModality,
): number {
  const n = runtimeConfig.retrievalDenseTopN;
  let base = n == null ? Math.max(topK * 3, topK) : Math.max(n, topK);
  if (queryContentModality === "nl")
    base = Math.ceil(base * RETRIEVAL_DENSE_MODALITY_NL_MULT);
  else
    base = Math.max(topK, Math.floor(base * RETRIEVAL_DENSE_MODALITY_PL_MULT));
  return Math.max(topK, base);
}

function modalityBm25TopN(queryContentModality: QueryContentModality): number {
  const base = runtimeConfig.retrievalBm25TopN;
  if (queryContentModality === "pl")
    return Math.max(
      base,
      Math.ceil(base * RETRIEVAL_SPARSE_MODALITY_PL_DEPTH_MULT),
    );
  return base;
}

/** Legacy full-table lexical scan: cap candidates before fusion (PL aligns with FTS top-N bump). */
function fullTableLexicalSliceLimit(
  topK: number,
  queryContentModality: QueryContentModality,
): number {
  const base = Math.max(topK * 4, topK);
  if (queryContentModality === "pl")
    return Math.max(
      base,
      Math.ceil(base * RETRIEVAL_SPARSE_MODALITY_PL_DEPTH_MULT),
    );
  return base;
}

function weightedFusionWeights(
  intent: RetrievalIntent,
  queryContentModality: QueryContentModality,
): { semanticWeight: number; lexicalWeight: number } {
  let semantic = intent === "locate" ? 0.45 : 0.75;
  let lexical = intent === "locate" ? 0.55 : 0.25;
  if (queryContentModality === "nl") {
    semantic += RETRIEVAL_WEIGHTED_MODALITY_NUDGE;
    lexical -= RETRIEVAL_WEIGHTED_MODALITY_NUDGE;
  } else {
    semantic -= RETRIEVAL_WEIGHTED_MODALITY_NUDGE;
    lexical += RETRIEVAL_WEIGHTED_MODALITY_NUDGE;
  }
  semantic = Math.min(
    RETRIEVAL_WEIGHTED_SEMANTIC_CLAMP_MAX,
    Math.max(RETRIEVAL_WEIGHTED_SEMANTIC_CLAMP_MIN, semantic),
  );
  lexical = Math.min(
    RETRIEVAL_WEIGHTED_LEXICAL_CLAMP_MAX,
    Math.max(RETRIEVAL_WEIGHTED_LEXICAL_CLAMP_MIN, lexical),
  );
  const sum = semantic + lexical;
  return { semanticWeight: semantic / sum, lexicalWeight: lexical / sum };
}

/** RRF dense vs BM25 term scales after intent explain/locate (P2-3) and content NL/PL (P3-3). */
function rrfDenseBm25Weights(
  intent: RetrievalIntent,
  queryContentModality: QueryContentModality,
): { denseWeight: number; bm25Weight: number } {
  const baseBm25 =
    intent === "locate" ? 1 : runtimeConfig.retrievalRrfExplainBm25Weight;
  if (queryContentModality === "nl") {
    return {
      denseWeight: RETRIEVAL_RRF_MODAL_NL_DENSE_WEIGHT,
      bm25Weight: Math.min(
        RETRIEVAL_RRF_WEIGHT_ABS_MAX,
        baseBm25 * RETRIEVAL_RRF_MODAL_NL_BM25_MULT,
      ),
    };
  }
  return {
    denseWeight: RETRIEVAL_RRF_MODAL_PL_DENSE_WEIGHT,
    bm25Weight: Math.min(
      RETRIEVAL_RRF_WEIGHT_ABS_MAX,
      baseBm25 * RETRIEVAL_RRF_MODAL_PL_BM25_MULT,
    ),
  };
}

function lexicalCandidatesFromBm25Fts(
  data: RetrievalDataAccess,
  repoId: string,
  tokens: string[],
  chunkIdsFilter: string[] | undefined,
  bm25TopN: number,
): LexicalCandidate[] {
  const matchExpr = buildFtsOrMatchFromRetrievalTokens(tokens);
  if (!matchExpr) return [];

  const hits = data.searchChunkIdsByFtsBm25(
    repoId,
    matchExpr,
    bm25TopN,
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

type SemanticHit = {
  chunk_id: string;
  file_path: string;
  content: string;
  chunk_type: string;
  chunk_name: string | null;
  score: number;
};

/** Min–max normalize raw RRF scores to [0, 1] within the returned list (order preserved). */
function minMaxNormalizeRrfScoresInPlace(results: RetrievalResult[]): void {
  if (results.length === 0) return;
  if (results.length === 1) {
    results[0]!.score = 1;
    return;
  }
  const raw = results.map((r) => r.score);
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  if (max <= min) {
    for (const r of results) r.score = 1;
    return;
  }
  for (const r of results) {
    r.score = (r.score - min) / (max - min);
  }
}

function assembleRrfRetrievalResults(
  orderedChunkIds: readonly string[],
  scores: ReadonlyMap<string, number>,
  semanticResults: SemanticHit[],
  lexicalCandidates: LexicalCandidate[],
  topK: number,
): RetrievalResult[] {
  const semMap = new Map(semanticResults.map((s) => [s.chunk_id, s] as const));
  const lexMap = new Map(
    lexicalCandidates.map((c) => [c.chunk_id, c] as const),
  );
  const out: RetrievalResult[] = [];
  for (const id of orderedChunkIds) {
    if (out.length >= topK) break;
    const sem = semMap.get(id);
    const lex = lexMap.get(id);
    if (!sem && !lex) continue;
    const row = sem ?? lex!;
    out.push({
      chunk_id: id,
      file_path: row.file_path,
      content: row.content,
      chunk_type: row.chunk_type,
      chunk_name: row.chunk_name,
      score: scores.get(id) ?? 0,
      fusion: "rrf",
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
      const queryModality = runtimeConfig.retrievalQueryModality;
      const queryContentModality = resolveQueryContentModality(
        queryModality,
        question,
      );
      requestLogger.debug({
        event: "retrieval.started",
        repoId,
        topK,
        questionLength: question.length,
        intent,
        queryModality,
        queryContentModality,
        fusionMode: runtimeConfig.retrievalFusion,
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
        denseCandidateCount: 0,
        bm25CandidateCount: null,
        denseBm25RankJaccard: 0,
        resultCount: 0,
        durationMs: Date.now() - startedAt,
        durationEmbedMs: 0,
        durationDenseMs: 0,
        durationSparseMs: 0,
        durationFuseMs: 0,
        sparseMode: this.sparseMode,
        sparseSource: "none",
        fusionMode: runtimeConfig.retrievalFusion,
        intent,
        queryModality,
        queryContentModality,
        chunkIdsFilterEmpty: true,
        skipReason: "empty_chunk_ids_whitelist",
      });
      return [];
    }

    const chunkIdsFilter =
      options?.chunk_ids && options.chunk_ids.length > 0
        ? [...new Set(options.chunk_ids)]
        : undefined;

    const queryModality = runtimeConfig.retrievalQueryModality;
    const queryContentModality = resolveQueryContentModality(
      queryModality,
      question,
    );
    requestLogger.debug({
      event: "retrieval.started",
      repoId,
      topK,
      questionLength: question.length,
      intent,
      queryModality,
      queryContentModality,
      fusionMode: runtimeConfig.retrievalFusion,
      sparseMode: this.sparseMode,
      chunkIdsFilterSize: chunkIdsFilter?.length ?? 0,
    });

    const indexedFp =
      assertRetrievalEmbeddingModelMatchesIndex(repoId);

    const tEmbed0 = Date.now();
    const queryVector = await this.embedder.embedQuestion(question);
    if (indexedFp) {
      assertQueryVectorDimension(queryVector.length, indexedFp.dimension);
    }
    const durationEmbedMs = Date.now() - tEmbed0;

    const semanticTopK = denseRecallLimit(topK, queryContentModality);
    const vectorFilter =
      chunkIdsFilter !== undefined
        ? { repo_id: repoId, chunk_ids: chunkIdsFilter }
        : { repo_id: repoId };

    const tDense0 = Date.now();
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
    const durationDenseMs = Date.now() - tDense0;

    const tSparse0 = Date.now();
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
        chunkIdsFilter,
        fullTableLexicalSliceLimit(topK, queryContentModality),
      );
    } else {
      sparseSource = "bm25_fts";
      lexicalCandidates = lexicalCandidatesFromBm25Fts(
        this.dataAccess,
        repoId,
        tokens,
        chunkIdsFilter,
        modalityBm25TopN(queryContentModality),
      );
    }
    const durationSparseMs = Date.now() - tSparse0;

    const denseBm25RankJaccard = denseSparseChunkIdJaccard(
      semanticResults.map((s) => s.chunk_id),
      lexicalCandidates.map((c) => c.chunk_id),
    );
    const bm25CandidateCount =
      sparseSource === "bm25_fts" ? lexicalCandidates.length : null;
    const denseCandidateCount = semanticResults.length;

    const fusionMode = runtimeConfig.retrievalFusion;

    let results: RetrievalResult[];
    let rrfBm25Weight: number | undefined;
    let rrfDenseWeight: number | undefined;

    const tFuse0 = Date.now();
    if (fusionMode === "rrf") {
      const { denseWeight, bm25Weight } = rrfDenseBm25Weights(
        intent,
        queryContentModality,
      );
      rrfDenseWeight = denseWeight;
      rrfBm25Weight = bm25Weight;
      const { orderedChunkIds, scores } = reciprocalRankFusionTwoList(
        semanticResults.map((s) => s.chunk_id),
        lexicalCandidates.map((c) => c.chunk_id),
        runtimeConfig.retrievalRrfK,
        { bm25Weight, denseWeight },
      );
      results = assembleRrfRetrievalResults(
        orderedChunkIds,
        scores,
        semanticResults,
        lexicalCandidates,
        topK,
      );
      minMaxNormalizeRrfScoresInPlace(results);
    } else {
      const semanticScores = semanticResults.map((item) => item.score);
      const semanticMin =
        semanticScores.length > 0 ? Math.min(...semanticScores) : 0;
      const semanticMax =
        semanticScores.length > 0 ? Math.max(...semanticScores) : 1;

      const semanticNormalized = semanticResults.map((item) => ({
        ...item,
        score: normalizeMinMax(item.score, semanticMin, semanticMax),
      }));

      const lexicalMin =
        lexicalCandidates.length > 0
          ? Math.min(...lexicalCandidates.map((item) => item.lexicalScore))
          : 0;
      const lexicalMax =
        lexicalCandidates.length > 0
          ? Math.max(...lexicalCandidates.map((item) => item.lexicalScore))
          : 1;
      const fused = new Map<string, RetrievalResult>();

      const { semanticWeight, lexicalWeight } = weightedFusionWeights(
        intent,
        queryContentModality,
      );

      semanticNormalized.forEach((item) => {
        fused.set(item.chunk_id, {
          ...item,
          score: item.score * semanticWeight,
          fusion: fusionMode,
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
            fusion: fusionMode,
          });
          return;
        }
        existing.score += lexicalNormalized * lexicalWeight;
      });

      results = Array.from(fused.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }
    const durationFuseMs = Date.now() - tFuse0;

    requestLogger.info({
      event: "retrieval.finished",
      repoId,
      topK,
      tokenCount: tokens.length,
      semanticCandidates: semanticResults.length,
      lexicalCandidates: lexicalCandidates.length,
      denseCandidateCount,
      bm25CandidateCount,
      denseBm25RankJaccard,
      resultCount: results.length,
      durationMs: Date.now() - startedAt,
      durationEmbedMs,
      durationDenseMs,
      durationSparseMs,
      durationFuseMs,
      sparseMode: this.sparseMode,
      sparseSource,
      fusionMode,
      intent,
      queryModality,
      queryContentModality,
      ...(rrfBm25Weight !== undefined && rrfDenseWeight !== undefined
        ? { rrfBm25Weight, rrfDenseWeight }
        : {}),
    });
    return results;
  }
}
