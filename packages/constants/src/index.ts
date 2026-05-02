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
export const MAX_CONTEXT_TOKENS = 8000;
export const GIT_CLONE_TIMEOUT_MS = 120_000;
export const REPO_MAX_SIZE_MB = 200;
