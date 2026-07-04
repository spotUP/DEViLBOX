/// <reference lib="webworker" />
/**
 * shrinklerWorker — runs the Shrinkler crunch off the main thread so the ~0.5 s
 * compression never stutters the UI. Loads the emscripten module (built with the
 * `worker` environment) once and answers size requests by id.
 */
interface ShrinklerWasm {
  cwrap: (n: string, r: string, a: string[]) => (...x: number[]) => number;
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  HEAPU8: Uint8Array;
}

let modPromise: Promise<ShrinklerWasm> | null = null;
function getModule(): Promise<ShrinklerWasm> {
  if (!modPromise) {
    // Runtime origin URL → the browser fetches the /public glue directly (Vite won't bundle it).
    const url = `${self.location.origin}/shrinkler/Shrinkler.mjs`;
    modPromise = import(/* @vite-ignore */ url)
      .then((m: { default: () => Promise<ShrinklerWasm> }) => m.default())
      .catch((err) => { modPromise = null; throw err; });
  }
  return modPromise;
}

interface Req { id: number; bytes: Uint8Array; preset: number }

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, bytes, preset } = e.data;
  try {
    const mod = await getModule();
    const fn = mod.cwrap('shrinkler_compressed_size', 'number', ['number', 'number', 'number', 'number']);
    const ptr = mod._malloc(bytes.length);
    try {
      mod.HEAPU8.set(bytes, ptr);
      const size = fn(ptr, bytes.length, 0, preset);
      (self as unknown as Worker).postMessage({ id, size });
    } finally {
      mod._free(ptr);
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
