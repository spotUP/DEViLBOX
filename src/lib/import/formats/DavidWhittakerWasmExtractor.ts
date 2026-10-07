/**
 * DavidWhittakerWasmExtractor.ts - what the David Whittaker replayer plays, command by command,
 * from the same wasm that plays it.
 *
 * DavidWhittakerParser draws the tracker grid from this walk, so the grid shows what
 * `DavidWhittakerEngine` plays: one track reader (davidwhittaker.c's), not a second one in
 * TypeScript whose guesses decide which notes, instruments and commands a song shows (owner,
 * 2026-10-07: "the pattern data is a bad guesstimate"). Follows AyletWasmExtractor: the bundle is
 * fetched from public/davidwhittaker/ on the main thread and kept for the session.
 */

interface DwWasmModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _dw_create(data: number, size: number, sampleRate: number): number;
  _dw_destroy(handle: number): void;
  _dw_subsong_count(handle: number): number;
  _dw_select_subsong(handle: number, subsong: number): boolean;
  _dw_walk(handle: number, maxTicks: number, out: number, maxEvents: number, info: number): number;
  HEAPU8: Uint8Array;
}

let wasmModule: DwWasmModule | null = null;
let wasmLoading: Promise<DwWasmModule> | null = null;

async function getModule(): Promise<DwWasmModule> {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoading;
  wasmLoading = (async () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const [jsText, wasmBinary] = await Promise.all([
      fetch(`${baseUrl}davidwhittaker/DavidWhittaker.js`).then((r) => r.text()),
      fetch(`${baseUrl}davidwhittaker/DavidWhittaker.wasm`).then((r) => r.arrayBuffer()),
    ]);
    const factory = new Function(jsText + '; return createDavidWhittaker;')() as
      (opts?: Record<string, unknown>) => Promise<DwWasmModule>;
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

/** Walk event kinds, the replayer's own (davidwhittaker.c DW_WALK_*). */
export const DW_WALK = {
  note: 0, wait: 1, sample: 2, envelope: 3, arpeggio: 4, endOfTrack: 5, slide: 6, mute: 7, waitRow: 8,
  stopSong: 9, globalTranspose: 10, vibrato: 11, vibratoOff: 12, volumeFade: 13, channelTranspose: 14,
  halfVolumeOn: 15, halfVolumeOff: 16, restart: 17, speed: 18, delaySpeed: 19, globalFade: 20,
  globalVolume: 21, soundEffect: 22, nop: 23,
} as const;

export interface DwWalkEvent {
  /** Replayer tick (50 Hz) the command ran on. */
  tick: number;
  channel: number;
  /** File offset of the command's block (0xFFFFFFFF: the empty track a voice without a list reads). */
  block: number;
  /** Byte position of the command inside its block. */
  pos: number;
  kind: number;
  a: number;
  b: number;
}

export interface DwWalk {
  events: DwWalkEvent[];
  /** Ticks run, up to the first pass of the longest voice. */
  ticks: number;
  /** The tick each voice first reached the end of its position list (-1: it has none). */
  wrapTicks: number[];
  channels: number;
  samples: number;
}

const MAX_EVENTS = 200_000;
const EXTRACT_SAMPLE_RATE = 44100;

/**
 * Run subsong `subsong` from its start until every voice with a track has played its list once (the longest
 * voice's pass is the song; shorter voices loop inside it, as the replayer loops them), or `maxTicks`.
 * Throws when the replayer refuses the file.
 */
export async function walkDavidWhittaker(buffer: ArrayBuffer, maxTicks = 60_000, subsong = 0): Promise<DwWalk> {
  const M = await getModule();
  const data = new Uint8Array(buffer);
  const p = M._malloc(data.length);
  M.HEAPU8.set(data, p);
  const handle = M._dw_create(p, data.length, EXTRACT_SAMPLE_RATE);
  M._free(p);
  if (!handle) throw new Error('the David Whittaker replayer refused the file');
  if (!M._dw_select_subsong(handle, subsong)) {
    M._dw_destroy(handle);
    throw new Error(`the David Whittaker replayer has no subsong ${subsong}`);
  }
  const out = M._malloc(MAX_EVENTS * 7 * 4);
  const info = M._malloc(16 * 4);
  try {
    const n = M._dw_walk(handle, maxTicks, out, MAX_EVENTS, info);
    const dv = new DataView(M.HEAPU8.buffer);
    const events: DwWalkEvent[] = [];
    for (let i = 0; i < n; i++) {
      const o = out + i * 28;
      events.push({
        tick: dv.getInt32(o, true), channel: dv.getInt32(o + 4, true), block: dv.getUint32(o + 8, true),
        pos: dv.getInt32(o + 12, true), kind: dv.getInt32(o + 16, true), a: dv.getInt32(o + 20, true), b: dv.getInt32(o + 24, true),
      });
    }
    const inf = Array.from({ length: 12 }, (_, i) => dv.getInt32(info + i * 4, true));
    const channels = inf[10];
    return { events, ticks: inf[1] + 1, wrapTicks: inf.slice(2, 2 + channels), channels, samples: inf[11] };
  } finally {
    M._free(out);
    M._free(info);
    M._dw_destroy(handle);
  }
}

/** Subsongs the replayer finds in the file (the count it plays from, not the module scan's). */
export async function dwSubsongCount(buffer: ArrayBuffer): Promise<number> {
  const M = await getModule();
  const data = new Uint8Array(buffer);
  const p = M._malloc(data.length);
  M.HEAPU8.set(data, p);
  const handle = M._dw_create(p, data.length, EXTRACT_SAMPLE_RATE);
  M._free(p);
  if (!handle) return 0;
  try {
    return M._dw_subsong_count(handle);
  } finally {
    M._dw_destroy(handle);
  }
}
