import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const WORKER_FILE = fileURLToPath(
  new URL("../workers/embedding-index.worker.ts", import.meta.url),
);

type EmbedOk = { id: number; ok: true; vectors: number[][] };
type EmbedErr = { id: number; ok: false; error: string };
type EmbedResponse = EmbedOk | EmbedErr;

function inferBatchSize(): number {
  const n = Number(process.env.EMBEDDING_INFER_BATCH_SIZE ?? "16");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 16;
}

/**
 * Batches document embedding through a single long-lived worker so ONNX work
 * does not block the HTTP server's event loop.
 */
export class IndexEmbeddingWorkerPool {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: number[][]) => void; reject: (e: Error) => void }
  >();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const w = new Worker(WORKER_FILE, {});
    w.on("message", (msg: EmbedResponse) => {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.ok) {
        entry.resolve(msg.vectors);
      } else {
        entry.reject(new Error(msg.error));
      }
    });
    w.on("error", (err) => {
      for (const { reject } of this.pending.values()) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
      this.pending.clear();
      this.worker = null;
    });
    w.on("exit", (code) => {
      if (code !== 0 && this.pending.size > 0) {
        const err = new Error(`embedding worker exited with code ${code}`);
        for (const { reject } of this.pending.values()) {
          reject(err);
        }
        this.pending.clear();
      }
      this.worker = null;
    });
    this.worker = w;
    return w;
  }

  /**
   * Runs feature extraction for all texts; preserves order.
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const batchSize = inferBatchSize();
    const out: number[][] = [];
    const worker = this.ensureWorker();

    for (let i = 0; i < texts.length; i += batchSize) {
      const slice = texts.slice(i, i + batchSize);
      const id = this.nextId++;
      const batch = await new Promise<number[][]>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        worker.postMessage({ id, texts: slice });
      });
      out.push(...batch);
      await new Promise<void>((r) => setImmediate(r));
    }

    return out;
  }

  /** Test / process shutdown: terminate worker and drop pending jobs. */
  reset(): void {
    if (this.worker) {
      this.worker.removeAllListeners();
      void this.worker.terminate();
      this.worker = null;
    }
    for (const { reject } of this.pending.values()) {
      reject(new Error("index embedding worker pool reset"));
    }
    this.pending.clear();
  }
}

let pool: IndexEmbeddingWorkerPool | null = null;

export function getIndexEmbeddingPool(): IndexEmbeddingWorkerPool {
  return (pool ??= new IndexEmbeddingWorkerPool());
}

/** For tests that need a clean worker lifecycle in the same process. */
export function resetIndexEmbeddingPoolForTests(): void {
  pool?.reset();
  pool = null;
}
