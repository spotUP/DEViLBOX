/**
 * AyletWasmExtractor.ts - the AY register frames of a ZXAY EMUL file, from
 * the same aylet wasm that plays it.
 *
 * AYParser draws the tracker grid from these frames, so the grid shows what
 * `AyletEngine` plays: one Z80 (aylet's), not a second one in TypeScript
 * whose opcode coverage decides which tunes get notes (ledger F15 - the Pro
 * Tracker 3 player in spring.emul ran on undocumented IX/IY half-register
 * ops the TypeScript Z80 skipped, and its grid stayed empty while aylet
 * played it).
 *
 * Follows AdPlugWasmExtractor: the bundle is fetched from public/aylet/ on
 * the main thread and kept for the session.
 */

interface AyletWasmModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _aylet_wasm_init(sampleRate: number): void;
  _aylet_wasm_load(p: number, n: number, track: number): number;
  _aylet_wasm_step_frame(): number;
  _aylet_wasm_get_regs(): number;
  _aylet_wasm_stop(): void;
  _aylet_wasm_get_num_tracks(): number;
  _aylet_wasm_get_track(): number;
  HEAPU8: Uint8Array;
}

let wasmModule: AyletWasmModule | null = null;
let wasmLoading: Promise<AyletWasmModule> | null = null;

async function getModule(): Promise<AyletWasmModule> {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoading;
  wasmLoading = (async () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const [jsText, wasmBinary] = await Promise.all([
      fetch(`${baseUrl}aylet/Aylet.js`).then((r) => r.text()),
      fetch(`${baseUrl}aylet/Aylet.wasm`).then((r) => r.arrayBuffer()),
    ]);
    const factory = new Function(jsText + '; return createAylet;')() as
      (opts?: Record<string, unknown>) => Promise<AyletWasmModule>;
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

/** The grid is drawn at 50 frames a second; the extraction clock does not matter for the registers. */
const EXTRACT_SAMPLE_RATE = 44100;

export interface AYRegisterFrames {
  /** The 16 AY registers after each frame, `frames` snapshots. */
  frames: Uint8Array[];
  numTracks: number;
  track: number;
}

/**
 * Run `track` of a ZXAY EMUL file for `frameCount` frames (1/50 s each) and
 * return the AY registers after each. Throws when aylet refuses the file.
 */
export async function extractAYRegisterFrames(buffer: ArrayBuffer, track = -1, frameCount = 300): Promise<AYRegisterFrames> {
  const M = await getModule();
  const data = new Uint8Array(buffer);
  M._aylet_wasm_init(EXTRACT_SAMPLE_RATE);
  const p = M._malloc(data.length);
  M.HEAPU8.set(data, p);
  const rc = M._aylet_wasm_load(p, data.length, track);
  M._free(p);
  if (rc !== 0) throw new Error(`aylet refused the file (code ${rc})`);
  const frames: Uint8Array[] = [];
  for (let f = 0; f < frameCount; f++) {
    if (!M._aylet_wasm_step_frame()) break;
    const regs = M._aylet_wasm_get_regs();
    frames.push(M.HEAPU8.slice(regs, regs + 16));
  }
  const out = { frames, numTracks: M._aylet_wasm_get_num_tracks(), track: M._aylet_wasm_get_track() };
  M._aylet_wasm_stop();
  return out;
}
