import {
  mkdirSync,
  existsSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
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
  process.env.HF_EMBEDDING_CACHE_DIR ?? path.join(MODELS_DIR, "_hf_hub_cache");
// Stable directory users can point EMBEDDING_MODEL to.
const [REPO_OWNER, REPO_NAME] = REPO_ID.split("/");
const DEFAULT_STABLE_TARGET = path.join(
  MODELS_DIR,
  REPO_OWNER ?? "nomic-ai",
  REPO_NAME ?? "nomic-embed-text-v1.5",
);
const STABLE_TARGET =
  process.env.EMBEDDING_STABLE_TARGET ?? DEFAULT_STABLE_TARGET;

const DISABLE_SYMLINK = process.env.EMBEDDING_DISABLE_SYMLINK === "1";
const OVERWRITE_STABLE = process.env.EMBEDDING_OVERWRITE_STABLE === "1";
const REQUIRED_STABLE_FILE = "config.json";
// Default behavior: if stable directory already exists AND required files exist, skip any download/network calls.
const SKIP_IF_PRESENT = process.env.EMBEDDING_SKIP_IF_PRESENT !== "0";
const FORCE_DOWNLOAD = process.env.EMBEDDING_FORCE_DOWNLOAD === "1";

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

function isDirEmpty(dirPath: string) {
  try {
    return readdirSync(dirPath).length === 0;
  } catch {
    return false;
  }
}

async function main() {
  const rootDir = process.cwd().endsWith("/apps/server")
    ? path.join(process.cwd(), "..", "..")
    : process.cwd();
  const modelsDirAbs = path.isAbsolute(MODELS_DIR)
    ? MODELS_DIR
    : path.join(rootDir, MODELS_DIR);
  const hfCacheDirAbs = path.isAbsolute(HF_CACHE_DIR)
    ? HF_CACHE_DIR
    : path.join(rootDir, HF_CACHE_DIR);
  const stableTargetAbs = path.isAbsolute(STABLE_TARGET)
    ? STABLE_TARGET
    : path.join(rootDir, STABLE_TARGET);
  const stableRequiredFileAbs = path.join(
    stableTargetAbs,
    REQUIRED_STABLE_FILE,
  );

  ensureDir(hfCacheDirAbs);
  ensureDir(path.dirname(stableTargetAbs));

  const hasRequiredStableFile = existsSync(stableRequiredFileAbs);
  if (SKIP_IF_PRESENT && hasRequiredStableFile && !FORCE_DOWNLOAD) {
    // Early exit to avoid network calls if you already have a stable directory.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        skipped: true,
        reason: "stable target already exists (required files present)",
        stableTarget: stableTargetAbs,
      }),
    );
    return;
  }

  // Offline-first: if HF cache already contains the snapshot (refs + snapshots),
  // resolve snapshotPath without hitting modelInfo/network.
  // cache repo folder naming:
  //   getRepoFolderName({ type: "model", name: "owner/repo" }) -> "models--owner--repo"
  const hfRepoFolderName = `models--${REPO_ID.split("/").join("--")}`;
  const hfRepoAbs = path.join(hfCacheDirAbs, hfRepoFolderName);
  const refsPath = path.join(hfRepoAbs, "refs", REVISION);
  const resolvedOfflineSnapshot = (() => {
    try {
      if (!existsSync(refsPath)) return null;
      const commitHash = readFileSync(refsPath, "utf8").trim();
      const snapshotPath = path.join(hfRepoAbs, "snapshots", commitHash);
      if (existsSync(path.join(snapshotPath, REQUIRED_STABLE_FILE)))
        return snapshotPath;
      return null;
    } catch {
      return null;
    }
  })();

  const snapshotPath =
    resolvedOfflineSnapshot ??
    (await snapshotDownload({
      repo: { type: "model", name: REPO_ID },
      revision: REVISION,
      cacheDir: hfCacheDirAbs,
    }));

  // Create stable symlink for downstream code to load from a predictable path.
  // (We don't delete existing directories; only replace an existing symlink.)
  if (!DISABLE_SYMLINK) {
    try {
      const existing = existsSync(stableTargetAbs);
      if (existing) {
        // If it's a symlink, replace it; if it's a real folder, keep it.
        // On macOS, existsSync returns true for both; we check stats via lstat.
        const stat = lstatSync(stableTargetAbs);
        if (stat.isSymbolicLink()) {
          unlinkSync(stableTargetAbs);
          symlinkSync(snapshotPath, stableTargetAbs, "dir");
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify({
              updated: true,
              stableTarget: stableTargetAbs,
              via: "replace-symlink",
            }),
          );
        } else if (stat.isDirectory()) {
          // If stable dir exists but is empty (e.g. created by a previous interrupted run),
          // it's safe to replace it with a symlink to the resolved snapshot.
          if (isDirEmpty(stableTargetAbs)) {
            rmSync(stableTargetAbs, { recursive: true, force: true });
            symlinkSync(snapshotPath, stableTargetAbs, "dir");
            // eslint-disable-next-line no-console
            console.log(
              JSON.stringify({
                updated: true,
                stableTarget: stableTargetAbs,
                via: "replace-empty-dir",
              }),
            );
          } else if (OVERWRITE_STABLE) {
            // Refuse to delete non-empty real directories to avoid destructive behavior.
            throw new Error(
              `Stable target exists and is not a symlink (non-empty, OVERWRITE_STABLE=1): ${stableTargetAbs}`,
            );
          } else {
            // Keep existing real directory to avoid unexpected deletion.
            // eslint-disable-next-line no-console
            console.warn(
              JSON.stringify({
                updated: false,
                reason: "stable dir exists but is non-empty; not overwriting",
                stableTarget: stableTargetAbs,
              }),
            );
          }
        } else if (OVERWRITE_STABLE) {
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
  const result = {
    snapshotPath,
    stableTarget: stableTargetAbs,
    modelsDir: modelsDirAbs,
  };

  console.log(JSON.stringify(result));
}

if (import.meta.main) {
  await main();
}
