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
  _dw_layout(handle: number, out: number, maxRecords: number): number;
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

/** The module's track storage as the loader read it (davidwhittaker.c dw_layout). */
export interface DwLayout {
  /** A pointer in a position list is relative to this file offset. */
  startOffset: number;
  /** Pointer width in bytes: 2 (the high bit of the value must stay clear) or 4. */
  pointerWidth: number;
  oldPlayer: boolean;
  /** Every distinct track: its file offset and byte length (the end-of-track command included). */
  tracks: Array<{ offset: number; length: number }>;
  /** Every position-list entry of every subsong and voice: where it is, and the file offset of the track it names. */
  entries: Array<{ at: number; track: number }>;
}

export interface DwWalk {
  /** Ticks per speed unit in the walked subsong's first tick (the wait command counts speed units). */
  speed: number;
  layout: DwLayout;
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
    const inf = Array.from({ length: 13 }, (_, i) => dv.getInt32(info + i * 4, true));
    const channels = inf[10];
    const layout = readLayout(M, handle);
    return { speed: inf[12], layout, events, ticks: inf[1] + 1, wrapTicks: inf.slice(2, 2 + channels), channels, samples: inf[11] };
  } finally {
    M._free(out);
    M._free(info);
    M._dw_destroy(handle);
  }
}

const MAX_LAYOUT_RECORDS = 16_384;

function readLayout(M: DwWasmModule, handle: number): DwLayout {
  const out = M._malloc(MAX_LAYOUT_RECORDS * 16);
  try {
    const n = M._dw_layout(handle, out, MAX_LAYOUT_RECORDS);
    const dv = new DataView(M.HEAPU8.buffer);
    const layout: DwLayout = { startOffset: 0, pointerWidth: 2, oldPlayer: false, tracks: [], entries: [] };
    for (let i = 0; i < n; i++) {
      const r = [0, 4, 8, 12].map((o) => dv.getInt32(out + i * 16 + o, true));
      if (r[0] === 0) layout.tracks.push({ offset: r[1], length: r[2] });
      else if (r[0] === 1) layout.entries.push({ at: r[1], track: r[3] });
      else { layout.startOffset = r[1]; layout.pointerWidth = r[2]; layout.oldPlayer = r[3] === 1; }
    }
    return layout;
  } finally {
    M._free(out);
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
