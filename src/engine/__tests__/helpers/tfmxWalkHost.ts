/**
 * The TFMX wasm (public/tfmx, libtfmxaudiodecoder) loaded for a test, with the
 * decoder's walk export (tfmx_module_walk_*): what the engine that plays
 * Hippel .hip / .hip7 logs of its own sequencer, per tick.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HippelPlayed, HippelWalkRecord } from '@/lib/import/formats/HippelTfmxWalk';
import type { TrackerSong } from '@/engine/TrackerReplayer';

/** The Hippel Amiga TFMX corpus: file under public/data/songs, and the voices the decoder plays it with. */
export const HIPPEL_TFMX_CORPUS: Array<[string, number]> = [
  ['hippel/warp (ingame 2).hip', 4],
  ['hippel-7v/lethalxcess-intro.hip7', 7],
  ['formats/ghostbattle_gameover.hip7', 7],
];

interface TfmxWasm {
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _tfmx_init(rate: number): number;
  _tfmx_load_module(ctx: number, mdat: number, len: number, smpl: number, smplLen: number, subsong: number): number;
  _tfmx_module_songs(ctx: number): number;
  _tfmx_module_voices(ctx: number): number;
  _tfmx_module_render(ctx: number, l: number, r: number, n: number): void;
  _tfmx_module_walk_enable(ctx: number, on: number): number;
  _tfmx_module_walk_run(ctx: number, ticks: number): void;
  _tfmx_module_walk_count(ctx: number): number;
  _tfmx_module_walk_data(ctx: number): number;
  _tfmx_module_position(ctx: number, out: number): number;
}

/** A song loaded in the decoder with its walk on. */
export interface TfmxWalkSession {
  voices: number;
  /** Render `samples` of audio (the decoder ticks as the mixer asks for them). */
  render(samples: number): void;
  /** Run the sequencer `ticks` ticks without audio. */
  run(ticks: number): void;
  /** The decoder's play position, [step from the subsong's first, file offset of voice 0's next pattern byte]; null when none. */
  position(): [number, number] | null;
  /** The walk records from record `from` on. */
  records(from?: number): HippelWalkRecord[];
}

export interface TfmxWalkHost {
  open(bytes: Uint8Array, subsong: number): TfmxWalkSession;
  songs(bytes: Uint8Array): number;
  /** Run `ticks` ticks of subsong `subsong` with the walk on; the records, and the voices the decoder plays. */
  walk(bytes: Uint8Array, subsong: number, ticks: number): { records: HippelWalkRecord[]; voices: number };
}

export async function loadTfmxWalkModule(): Promise<TfmxWalkHost> {
  const root = process.cwd();
  const js = readFileSync(join(root, 'public/tfmx/TFMX.js'), 'utf8');
  const factory = new Function(`${js}\nreturn createTFMX;`)() as (o: { wasmBinary: Buffer }) => Promise<TfmxWasm>;
  // The module is built for web and worker only; its environment probe reads process.versions.
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  let w: TfmxWasm;
  try { w = await factory({ wasmBinary: readFileSync(join(root, 'public/tfmx/TFMX.wasm')) }); }
  finally { Object.defineProperty(process, 'versions', versions); }
  const ctx = w._tfmx_init(44100);
  const load = (bytes: Uint8Array, subsong: number): number => {
    const p = w._malloc(bytes.length);
    w.HEAPU8.set(bytes, p);
    const r = w._tfmx_load_module(ctx, p, bytes.length, 0, 0, subsong);
    w._free(p);
    if (r !== 0) throw new Error(`TFMX decoder refused the song (${r})`);
    return r;
  };
  const openSession = (bytes: Uint8Array, subsong: number): TfmxWalkSession => {
    load(bytes, subsong);
    const voices = w._tfmx_module_voices(ctx);
    w._tfmx_module_walk_enable(ctx, 1);
    // The module renders the worklet's 128-sample blocks; larger calls overrun its buffers.
    const n = 128;
    const l = w._malloc(n * 4);
    const r = w._malloc(n * 4);
    const pos = w._malloc(8);
    return {
      voices,
      render(samples) {
        for (let done = 0; done < samples; done += n) w._tfmx_module_render(ctx, l, r, Math.min(n, samples - done));
      },
      run(ticks) { w._tfmx_module_walk_run(ctx, ticks); },
      position() {
        if (!w._tfmx_module_position(ctx, pos)) return null;
        const v = new Int32Array(w.HEAPU8.buffer, pos, 2);
        return [v[0], v[1]];
      },
      records(from = 0) {
        const count = w._tfmx_module_walk_count(ctx);
        const base = w._tfmx_module_walk_data(ctx);
        const ints = new Int32Array(w.HEAPU8.buffer, base, count * 10);
        const out: HippelWalkRecord[] = [];
        for (let i = from; i < count; i++) out.push(Array.from(ints.subarray(i * 10, i * 10 + 10)) as HippelWalkRecord);
        return out;
      },
    };
  };
  return {
    songs(bytes) { load(bytes, 0); return w._tfmx_module_songs(ctx); },
    open: openSession,
    walk(bytes, subsong, ticks) {
      const session = openSession(bytes, subsong);
      session.run(ticks);
      return { records: session.records(), voices: session.voices };
    },
  };
}

let sharedHost: Promise<TfmxWalkHost> | null = null;

/**
 * The sound-sequence transposes the decoder applies at each note (hippelPlayedPitch), from the TFMX wasm in node:
 * what the app hands the Hippel parsers at import. A Hippel grid exists only with them (G15c).
 */
export async function hippelPlayedForTest(bytes: Uint8Array | ArrayBuffer): Promise<HippelPlayed> {
  sharedHost ??= loadTfmxWalkModule();
  const host = await sharedHost;
  const { hippelPlayedPitch } = await import('@/lib/import/formats/hippelPlayedPitch');
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const played = await hippelPlayedPitch(b, async (x, s, t) => host.walk(x, s, t).records);
  if (!played) throw new Error('the TFMX decoder could not walk the song');
  return played;
}

/** A Hippel 7V file parsed as the app opens it (with the decoder's played pitches). */
export async function parseHippel7VPlayed(buffer: ArrayBuffer, name: string): Promise<TrackerSong> {
  const { parseJochenHippel7VFile } = await import('@/lib/import/formats/JochenHippel7VParser');
  return parseJochenHippel7VFile(buffer, name, await hippelPlayedForTest(buffer));
}
