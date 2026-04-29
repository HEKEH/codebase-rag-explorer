import { mkdirSync, existsSync, symlinkSync, unlinkSync, lstatSync } from "node:fs";
import path from "node:path";
import { snapshotDownload } from "@huggingface/hub";

const DEFAULT_REPO_ID = "nomic-ai/nomic-embed-text-v1.5";
const DEFAULT_REVISION = "main";

const REPO_ID = process.env.EMBEDDING_REPO_ID ?? DEFAULT_REPO_ID;
const REVISION = process.env.EMBEDDING_REPO_REVISION ?? DEFAULT_REVISION;

// Where to place the local model snapshot under your repo
const MODELS_DIR = process.env.EMBEDDING_MODELS_DIR ?? "models";
// Where to place huggingface.js cache files (snapshots/refs/...)
const HF_CACHE_DIR =
  process.env.HF_EMBEDDING_CACHE_DIR ??
  path.join(MODELS_DIR, "_hf_hub_cache");
// Stable directory users can point EMBEDDING_MODEL to.
const [REPO_OWNER, REPO_NAME] = REPO_ID.split("/");
const DEFAULT_STABLE_TARGET = path.join(MODELS_DIR, REPO_OWNER ?? "nomic-ai", REPO_NAME ?? "nomic-embed-text-v1.5");
const STABLE_TARGET = process.env.EMBEDDING_STABLE_TARGET ?? DEFAULT_STABLE_TARGET;

const DISABLE_SYMLINK = process.env.EMBEDDING_DISABLE_SYMLINK === "1";
const OVERWRITE_STABLE = process.env.EMBEDDING_OVERWRITE_STABLE === "1";
// Default behavior: if stable directory already exists, skip any download/network calls.
const SKIP_IF_PRESENT = process.env.EMBEDDING_SKIP_IF_PRESENT !== "0";
const FORCE_DOWNLOAD = process.env.EMBEDDING_FORCE_DOWNLOAD === "1";

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

async function main() {
  const rootDir = process.cwd().endsWith("/apps/server") ? path.join(process.cwd(), "..", "..") : process.cwd();
  const modelsDirAbs = path.isAbsolute(MODELS_DIR) ? MODELS_DIR : path.join(rootDir, MODELS_DIR);
  const hfCacheDirAbs = path.isAbsolute(HF_CACHE_DIR) ? HF_CACHE_DIR : path.join(rootDir, HF_CACHE_DIR);
  const stableTargetAbs = path.isAbsolute(STABLE_TARGET) ? STABLE_TARGET : path.join(rootDir, STABLE_TARGET);

  ensureDir(hfCacheDirAbs);
  ensureDir(path.dirname(stableTargetAbs));

  if (SKIP_IF_PRESENT && existsSync(stableTargetAbs) && !FORCE_DOWNLOAD) {
    // Early exit to avoid network calls if you already have a stable directory.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        skipped: true,
        reason: "stable target already exists",
        stableTarget: stableTargetAbs
      })
    );
    return;
  }

  // Download snapshot into ./models/_hf_hub_cache/...
  const snapshotPath = await snapshotDownload({
    repo: { type: "model", name: REPO_ID },
    revision: REVISION,
    cacheDir: hfCacheDirAbs
  });

  // Create stable symlink for downstream code to load from a predictable path.
  // (We don't delete existing directories; only replace an existing symlink.)
  if (!DISABLE_SYMLINK) {
    try {
      const existing = existsSync(stableTargetAbs);
      if (existing) {
        // If it's a symlink, replace it; if it's a real folder, keep it.
        // On macOS, existsSync returns true for both; we check stats via lstat.
        const stat = lstatSync(stableTargetAbs);
        if (stat.isSymbolicLink() || OVERWRITE_STABLE) {
          if (!stat.isSymbolicLink() && OVERWRITE_STABLE) {
            // Refuse to delete real directories to avoid destructive behavior.
            throw new Error(`Stable target exists and is not a symlink: ${stableTargetAbs}`);
          }
          unlinkSync(stableTargetAbs);
          symlinkSync(snapshotPath, stableTargetAbs, "dir");
        }
      } else {
        symlinkSync(snapshotPath, stableTargetAbs, "dir");
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`warning: failed to create stable symlink: ${String(err)}`);
    }
  }

  // If symlink creation failed or was disabled, downstream can still set EMBEDDING_MODEL=snapshotPath.
  // eslint-disable-next-line no-console
  const result = { snapshotPath, stableTarget: stableTargetAbs, modelsDir: modelsDirAbs };

  console.log(JSON.stringify(result));
}

if (import.meta.main) {
  await main();
}

