/**
 * BenDaglishWasmExtractor.ts - what the Ben Daglish replayer plays, command by command, from the
 * same wasm that plays it (bd-wasm's bd_walk).
 *
 * BenDaglishParser draws the tracker grid from this walk, so the grid shows what BdEngine plays:
 * one track reader (ben_daglish.c's), not a second one in TypeScript whose guesses decide which
 * notes, instruments and commands a song shows. Follows DavidWhittakerWasmExtractor: the bundle is
 * fetched from public/bd/ on the main thread and kept for the session.
 */

interface BdWasmModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _player_init(data: number, size: number): number;
  _player_stop(): void;
  _player_set_subsong(n: number): void;
  _player_get_subsong_count(): number;
  _bd_walk_song(maxTicks: number, out: number, maxEvents: number, info: number): number;
  HEAPU8: Uint8Array;
}

let wasmModule: BdWasmModule | null = null;
let wasmLoading: Promise<BdWasmModule> | null = null;

async function getModule(): Promise<BdWasmModule> {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoading;
  wasmLoading = (async () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const [jsText, wasmBinary] = await Promise.all([
      fetch(`${baseUrl}bd/Bd.js`).then((r) => r.text()),
      fetch(`${baseUrl}bd/Bd.wasm`).then((r) => r.arrayBuffer()),
    ]);
    const factory = new Function(jsText + '; return createBd;')() as
      (opts?: Record<string, unknown>) => Promise<BdWasmModule>;
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

/** Walk event kinds, the replayer's own (ben_daglish.c BD_WALK_*). */
export const BD_WALK = {
  note: 0, rest: 1, sampleMap: 2, control: 3, portaOn: 4, portaOff: 5, fadeOn: 6, fadeOff: 7,
  porta2On: 8, porta2Off: 9, channelVolume: 10, volSlideOff: 11, trackEnd: 12,
  transpose: 13, loopCount: 14, masterFade: 15, mapSet: 16, end: 17, nextTrack: 18,
} as const;

export interface BdWalkEvent {
  /** Replayer tick (50 Hz) the command ran on. */
  tick: number;
  voice: number;
  /** Track number the command is in (-1: a position-list command). */
  track: number;
  /** Byte position of the command inside its track (or position list). */
  pos: number;
  kind: number;
  a: number;
  b: number;
  c: number;
}

export interface BdWalk {
  events: BdWalkEvent[];
  /** Ticks run, up to every voice's first pass. */
  ticks: number;
  /** The tick each voice first reached the end of its position list (-1: never). */
  endTicks: number[];
  samples: number;
  subsongs: number;
}

const MAX_EVENTS = 200_000;

/**
 * Run a subsong from its start until every voice has reached the end of its position list once, or
 * `maxTicks`. Throws when the replayer refuses the file.
 */
export async function walkBenDaglish(buffer: ArrayBuffer, subsong = 0, maxTicks = 60_000): Promise<BdWalk> {
  const M = await getModule();
  const data = new Uint8Array(buffer);
  const p = M._malloc(data.length);
  M.HEAPU8.set(data, p);
  const ok = M._player_init(p, data.length);
  M._free(p);
  if (ok !== 0) throw new Error('the Ben Daglish replayer refused the file');
  const out = M._malloc(MAX_EVENTS * 8 * 4);
  const info = M._malloc(16 * 4);
  try {
    if (subsong > 0) M._player_set_subsong(subsong);
    const n = M._bd_walk_song(maxTicks, out, MAX_EVENTS, info);
    const dv = new DataView(M.HEAPU8.buffer);
    const events: BdWalkEvent[] = [];
    for (let i = 0; i < n; i++) {
      const o = out + i * 32;
      events.push({
        tick: dv.getInt32(o, true), voice: dv.getInt32(o + 4, true), track: dv.getInt32(o + 8, true),
        pos: dv.getInt32(o + 12, true), kind: dv.getInt32(o + 16, true),
        a: dv.getInt32(o + 20, true), b: dv.getInt32(o + 24, true), c: dv.getInt32(o + 28, true),
      });
    }
    const inf = Array.from({ length: 9 }, (_, i) => dv.getInt32(info + i * 4, true));
    return { events, ticks: inf[0], endTicks: inf.slice(2, 6), samples: inf[7], subsongs: inf[8] };
  } finally {
    M._free(out);
    M._free(info);
    M._player_stop();
  }
}

/** Subsongs the replayer finds in the file; 0 when it refuses the file. */
export async function bdSubsongCount(buffer: ArrayBuffer): Promise<number> {
  const M = await getModule();
  const data = new Uint8Array(buffer);
  const p = M._malloc(data.length);
  M.HEAPU8.set(data, p);
  const ok = M._player_init(p, data.length);
  M._free(p);
  if (ok !== 0) return 0;
  try {
    return M._player_get_subsong_count();
  } finally {
    M._player_stop();
  }
}
