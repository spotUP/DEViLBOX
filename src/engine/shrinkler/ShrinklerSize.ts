/**
 * ShrinklerSize — report the Shrinkler-compressed size of a byte buffer.
 *
 * Cinter musicians optimize their songs for the Shrinkler-crunched size (Shrinkler is
 * Blueberry's Amiga cruncher, same author as Cinter). Showing that number live in
 * DEViLBOX lets them iterate on the size-optimization phase without leaving the tool.
 *
 * The crunch (a WASM build of Shrinkler's data compressor, see third-party/shrinkler-wasm/)
 * is CPU-heavy (~0.5–1 s at the default preset 3), so it runs in a Web Worker — callers get
 * a promise and the UI never blocks. Returned size matches `Shrinkler -d` byte-for-byte.
 */

let _worker: Worker | null = null;
let _seq = 0;
const _pending = new Map<number, { resolve: (n: number) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('./shrinklerWorker.ts', import.meta.url), { type: 'module' });
    _worker.onmessage = (e: MessageEvent<{ id: number; size?: number; error?: string }>) => {
      const { id, size, error } = e.data;
      const p = _pending.get(id);
      if (!p) return;
      _pending.delete(id);
      if (error !== undefined) p.reject(new Error(error));
      else p.resolve(size ?? 0);
    };
  }
  return _worker;
}

/**
 * Return the Shrinkler-compressed size (bytes) of `data`, matching `Shrinkler -d`.
 * Runs in a worker; the caller's buffer is copied (and the copy transferred) so it is
 * left intact. @param preset 1..9 compression preset (default 3 = the CLI default).
 */
export function shrinklerCompressedSize(data: Uint8Array, preset = 3): Promise<number> {
  if (data.length === 0) return Promise.resolve(0);
  const id = ++_seq;
  const worker = getWorker();
  const copy = data.slice(); // transferable copy — leaves the caller's buffer usable
  return new Promise<number>((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    worker.postMessage({ id, bytes: copy, preset }, [copy.buffer]);
  });
}

/** Spin up the worker + warm the WASM module so the first real call is fast. */
export function preloadShrinkler(): void {
  try { getWorker(); } catch { /* best effort */ }
}
