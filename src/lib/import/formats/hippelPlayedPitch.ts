/**
 * The pitch Jochen Hippel's TFMX decoder plays for each note of a song, for
 * the grid (HippelTfmxWalk.hippelGrid).
 *
 * A sound sequence shifts or fixes the pitch of the notes it plays, and only
 * the decoder (libtfmxaudiodecoder in the TFMX wasm, the engine that plays
 * .hip and .hip7) runs sound sequences. Its walk export (tfmx_module_walk_*)
 * logs, per note start, the pitch index it looked up and the sequence
 * transpose behind it. This runs that on the main thread, once per import,
 * and hands the grid the transposes. No sequence is emulated in TypeScript.
 */
import {
  hippelPlayedFromRecords, hippelSubsong, passTicks, readHippelTfmx,
  type HippelPlayed, type HippelWalkRecord,
} from './HippelTfmxWalk';

/** Runs the decoder's walk on subsong `subsong` for `ticks` ticks and returns its records. */
export type HippelDecoderWalker = (bytes: Uint8Array, subsong: number, ticks: number) => Promise<HippelWalkRecord[]>;

interface TfmxWasm {
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _tfmx_init(rate: number): number;
  _tfmx_load_module(ctx: number, mdat: number, len: number, smpl: number, smplLen: number, subsong: number): number;
  _tfmx_module_walk_enable(ctx: number, on: number): number;
  _tfmx_module_walk_run(ctx: number, ticks: number): void;
  _tfmx_module_walk_count(ctx: number): number;
  _tfmx_module_walk_data(ctx: number): number;
}

let wasmReady: Promise<{ w: TfmxWasm; ctx: number }> | null = null;

/** The TFMX wasm on the main thread (a second instance beside the playing worklet's), loaded once. */
function loadBrowserWasm(): Promise<{ w: TfmxWasm; ctx: number }> {
  wasmReady ??= (async () => {
    const base = `${import.meta.env.BASE_URL ?? '/'}tfmx/`;
    const [js, wasm] = await Promise.all([
      fetch(`${base}TFMX.js`).then((r) => r.text()),
      fetch(`${base}TFMX.wasm`).then((r) => r.arrayBuffer()),
    ]);
    const factory = new Function(`${js}\nreturn createTFMX;`)() as (o: { wasmBinary: ArrayBuffer }) => Promise<TfmxWasm>;
    const w = await factory({ wasmBinary: wasm });
    return { w, ctx: w._tfmx_init(44100) };
  })();
  wasmReady.catch(() => { wasmReady = null; });
  return wasmReady;
}

/** The decoder's walk records, from the TFMX wasm in the browser. */
export const browserHippelWalker: HippelDecoderWalker = async (bytes, subsong, ticks) => {
  const { w, ctx } = await loadBrowserWasm();
  const p = w._malloc(bytes.length);
  w.HEAPU8.set(bytes, p);
  const r = w._tfmx_load_module(ctx, p, bytes.length, 0, 0, subsong);
  w._free(p);
  if (r !== 0) throw new Error(`TFMX decoder refused the song (${r})`);
  w._tfmx_module_walk_enable(ctx, 1);
  w._tfmx_module_walk_run(ctx, ticks);
  const count = w._tfmx_module_walk_count(ctx);
  const ints = new Int32Array(w.HEAPU8.buffer, w._tfmx_module_walk_data(ctx), count * 10);
  const out: HippelWalkRecord[] = [];
  for (let i = 0; i < count; i++) out.push(Array.from(ints.subarray(i * 10, i * 10 + 10)) as HippelWalkRecord);
  return out;
};

/**
 * The sound-sequence transposes the decoder applies at each note of subsong 0,
 * for `hippelGrid`. Null when the decoder cannot run the song (the grid then
 * shows the pattern notes, as before).
 */
export async function hippelPlayedPitch(bytes: Uint8Array, walker: HippelDecoderWalker = browserHippelWalker): Promise<HippelPlayed | null> {
  const m = readHippelTfmx(bytes);
  if (!m) return null;
  try {
    return hippelPlayedFromRecords(await walker(bytes, 0, passTicks(hippelSubsong(m, 0))));
  } catch (err) {
    console.warn('[hippelPlayedPitch] the decoder could not walk the song; the grid shows pattern notes:', err);
    return null;
  }
}
