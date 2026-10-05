/**
 * PsgplayWasmExtractor.ts - the SNDH tags and YM register frames of an Atari
 * ST SNDH file, from the same psgplay wasm that plays it.
 *
 * SNDHParser draws the tracker grid from these frames, so the grid shows what
 * `PsgplayEngine` plays. The tags come from PSG play's own sndh.c on the
 * decrunched file, so ICE!-packed files get their title and subtune count too.
 *
 * Follows AdPlugWasmExtractor: the bundle is fetched from public/psgplay/ on
 * the main thread and kept for the session.
 */

interface PsgplayWasmModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _psgplay_wasm_load(p: number, n: number, track: number, sampleRate: number): number;
  _psgplay_wasm_step_frame(): number;
  _psgplay_wasm_get_regs(): number;
  _psgplay_wasm_free(): void;
  _psgplay_wasm_subtune_count(): number;
  _psgplay_wasm_subtune_time(track: number): number;
  _psgplay_wasm_tag(which: number): number;
  HEAPU8: Uint8Array;
  UTF8ToString(p: number): string;
}

let wasmModule: PsgplayWasmModule | null = null;
let wasmLoading: Promise<PsgplayWasmModule> | null = null;

async function getModule(): Promise<PsgplayWasmModule> {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoading;
  wasmLoading = (async () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const [jsText, wasmBinary] = await Promise.all([
      fetch(`${baseUrl}psgplay/Psgplay.js`).then((r) => r.text()),
      fetch(`${baseUrl}psgplay/Psgplay.wasm`).then((r) => r.arrayBuffer()),
    ]);
    const factory = new Function(jsText + '; return createPsgplay;')() as
      (opts?: Record<string, unknown>) => Promise<PsgplayWasmModule>;
    const m = await factory({ wasmBinary, print: () => {}, printErr: () => {} });
    wasmModule = m;
    return m;
  })();
  try {
    return await wasmLoading;
  } catch (err) {
    wasmLoading = null;
    throw err;
  }
}

/** Load error codes of psgplay_wasm_load. */
const LOAD_ERRORS: Record<number, string> = {
  [-1]: 'not an SNDH file', [-2]: 'ICE! decrunch failed', [-3]: 'PSG play refused the file', [-4]: 'out of memory',
};

export interface SNDHRegisterFrames {
  /** The 16 YM2149 registers after each 1/50 s frame. */
  frames: Uint8Array[];
  /** The subtune that ran (1-based). */
  track: number;
  subtunes: number;
  /** Seconds of `track` from the TIME tag, 0 when absent. */
  seconds: number;
  title: string;
  composer: string;
  year: string;
}

/**
 * Run `track` (1-based; 0 = the file's default) of an SNDH file for at most
 * `maxFrames` frames of 1/50 s and return the YM registers after each, with
 * the file's tags. When the TIME tag gives the subtune's length, the run
 * stops there. Throws when PSG play refuses the file.
 */
export async function extractSNDHRegisterFrames(buffer: ArrayBuffer, track = 0, maxFrames = 1500): Promise<SNDHRegisterFrames> {
  const M = await getModule();
  const data = new Uint8Array(buffer);
  const p = M._malloc(data.length);
  M.HEAPU8.set(data, p);
  const started = M._psgplay_wasm_load(p, data.length, track, 0);
  M._free(p);
  if (started <= 0) throw new Error(`psgplay refused the file (${LOAD_ERRORS[started] ?? `code ${started}`})`);
  try {
    const seconds = M._psgplay_wasm_subtune_time(started);
    const frameCount = seconds > 0 ? Math.min(maxFrames, Math.ceil(seconds * 50)) : maxFrames;
    const frames: Uint8Array[] = [];
    for (let f = 0; f < frameCount; f++) {
      if (!M._psgplay_wasm_step_frame()) break;
      const regs = M._psgplay_wasm_get_regs();
      frames.push(M.HEAPU8.slice(regs, regs + 16));
    }
    return {
      frames, track: started, subtunes: M._psgplay_wasm_subtune_count(), seconds,
      title: M.UTF8ToString(M._psgplay_wasm_tag(0)),
      composer: M.UTF8ToString(M._psgplay_wasm_tag(1)),
      year: M.UTF8ToString(M._psgplay_wasm_tag(2)),
    };
  } finally {
    M._psgplay_wasm_free();
  }
}
