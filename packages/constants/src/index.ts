export const SUPPORTED_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".swift",
  ".kt",
] as const;

export const IGNORED_DIRECTORIES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "__pycache__",
  ".next",
  "vendor",
  ".venv",
  "target",
  "bin",
  "obj",
] as const;

export const IGNORED_FILE_PATTERNS = [
  /\.lock$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/,
] as const;

export const CHUNK_MAX_LENGTH = 1500;
export const CHUNK_OVERLAP = 200;
export const EMBEDDING_BATCH_SIZE = 2048;
export const DEFAULT_TOP_K = 5;
/** RRF constant k (Okapi-style reciprocal rank fusion); typical value 60. */
export const DEFAULT_RETRIEVAL_RRF_K = 60;
/** BM25-side RRF term scale when intent is explain (`locate` uses 1). */
export const DEFAULT_RETRIEVAL_RRF_EXPLAIN_BM25_WEIGHT = 0.35;
/** Clamp for RRF dense/BM25 side weight scales after modality combine. */
export const RETRIEVAL_RRF_WEIGHT_ABS_MAX = 2;

/** NL→PL: multiply dense recall depth vs configured or legacy base. */
export const RETRIEVAL_DENSE_MODALITY_NL_MULT = 1.08;
/** PL→PL: multiply dense recall depth (slightly shrink extra breadth). */
export const RETRIEVAL_DENSE_MODALITY_PL_MULT = 0.94;
/**
 * PL→PL: multiply BM25 top-N and full_table lexical slice limit vs base
 * (aligned with sparse-depth bump).
 */
export const RETRIEVAL_SPARSE_MODALITY_PL_DEPTH_MULT = 1.15;

/** After intent locate/explain baseline, nudge semantic vs lexical by content modality. */
export const RETRIEVAL_WEIGHTED_MODALITY_NUDGE = 0.08;
export const RETRIEVAL_WEIGHTED_SEMANTIC_CLAMP_MAX = 0.88;
export const RETRIEVAL_WEIGHTED_SEMANTIC_CLAMP_MIN = 0.22;
export const RETRIEVAL_WEIGHTED_LEXICAL_CLAMP_MAX = 0.78;
export const RETRIEVAL_WEIGHTED_LEXICAL_CLAMP_MIN = 0.12;

/** RRF term scales on top of intent explain/locate baselines (Phase 3 NL/PL). */
export const RETRIEVAL_RRF_MODAL_NL_DENSE_WEIGHT = 1.1;
export const RETRIEVAL_RRF_MODAL_NL_BM25_MULT = 0.88;
export const RETRIEVAL_RRF_MODAL_PL_DENSE_WEIGHT = 0.92;
export const RETRIEVAL_RRF_MODAL_PL_BM25_MULT = 1.14;

export const MAX_CONTEXT_TOKENS = 8000;
export const GIT_CLONE_TIMEOUT_MS = 120_000;
export const REPO_MAX_SIZE_MB = 200;
