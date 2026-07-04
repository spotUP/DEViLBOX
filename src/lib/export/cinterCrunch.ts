/**
 * cinterCrunch — main-thread bridge to the Cinter LZ crunch worker.
 *
 * `encodeCinter4FromMod` (the optimal-parse LZ compressor) is the heavy step of the live
 * Cinter re-export; running it in a worker keeps edits responsive. Requests are id-tagged
 * so a fresh edit's crunch supersedes an in-flight one without racing.
 */
export interface CrunchResult {
  songdata: Uint8Array;
  rawSamples: Uint8Array;
  errors: string[];
}

let _worker: Worker | null = null;
let _seq = 0;
const _pending = new Map<number, { resolve: (r: CrunchResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('./cinterCrunchWorker.ts', import.meta.url), { type: 'module' });
    _worker.onmessage = (e: MessageEvent<{ id: number; songdata?: Uint8Array; rawSamples?: Uint8Array; errors?: string[]; error?: string }>) => {
      const { id, songdata, rawSamples, errors, error } = e.data;
      const p = _pending.get(id);
      if (!p) return;
      _pending.delete(id);
      if (error !== undefined) p.reject(new Error(error));
      else p.resolve({ songdata: songdata!, rawSamples: rawSamples!, errors: errors ?? [] });
    };
  }
  return _worker;
}

/** Crunch a Cinter-instrumented MOD binary → .cinter4 songdata in the worker. */
export function crunchModInWorker(modBytes: Uint8Array): Promise<CrunchResult> {
  const id = ++_seq;
  const worker = getWorker();
  const copy = modBytes.slice(); // transferable copy — leaves the caller's buffer usable
  return new Promise<CrunchResult>((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    worker.postMessage({ id, modBytes: copy.buffer }, [copy.buffer]);
  });
}
