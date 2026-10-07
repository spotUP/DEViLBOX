/**
 * G24: a grid edit is heard while the song plays, for a format UADE plays from the module bytes
 * and whose edit has no cell layout of its own (Rob Hubbard, Digi Booster-class exporters, ...).
 *
 * The exporter owns the byte layout (grid -> module). The 68k player owns the memory (module at the
 * address UADE loaded it, read again on every tick). So the live edit is the difference between two
 * exports: the module the song was loaded with (or the last one written) and the module the
 * stores export now. When both are the same length, every differing run is written into chip RAM at
 * the module base, and the player meets it the next time it reads that byte - the same moment
 * ProTracker hears a changed row. When the lengths differ (a grown block moved every later offset)
 * chip RAM cannot be patched without relocating the player's pointers: the edit then waits for the
 * next play (editedModuleForPlay) and the result says so.
 */
import type { TrackerSong } from '../TrackerReplayer';

/** The chip-RAM surface the write needs (UADEEngine in the app, the wasm module in the tests). */
export interface ChipRamPort {
  readMemory(addr: number, len: number): Promise<Uint8Array>;
  writeMemory(addr: number, data: Uint8Array): Promise<void>;
}

export type LiveModuleResult =
  | { status: 'live'; bytes: number; runs: number }
  | { status: 'unchanged' }
  /** The export is a different length: the next play carries the edit. */
  | { status: 'next-play'; why: string }
  /** Chip RAM does not hold the module where the base address says (the player moved or packed it). */
  | { status: 'unplaced'; why: string };

/** Where the module sits in chip RAM, per loaded module (found once). */
const placed = new WeakMap<object, number>();
const CHIP_RAM = 0x200000;

const holds = async (port: ChipRamPort, addr: number, bytes: Uint8Array): Promise<boolean> => {
  const there = await port.readMemory(addr, bytes.length);
  return there.length === bytes.length && there.every((v, i) => v === bytes[i]);
};

/**
 * The address the module's byte 0 sits at. UADE records its load address at 0x100, and most players read the
 * module there; a player that moved it first (SunTronic: 0x2a000 recorded, the image at 0x20000) is found by its
 * bytes: the window around the first change, searched in chip RAM, and accepted only when it occurs once.
 */
async function moduleBase(key: object, baseline: Uint8Array, first: { offset: number; bytes: Uint8Array }, port: ChipRamPort): Promise<number | null> {
  const known = placed.get(key);
  if (known !== undefined && await holds(port, known + first.offset, baseline.slice(first.offset, first.offset + first.bytes.length))) return known;
  const head = await port.readMemory(0x100, 4);
  const recorded = ((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0;
  const at = baseline.slice(first.offset, first.offset + first.bytes.length);
  if (recorded < CHIP_RAM && await holds(port, recorded + first.offset, at)) { placed.set(key, recorded); return recorded; }
  const from = Math.max(0, first.offset - 16);
  const window = baseline.slice(from, Math.min(baseline.length, first.offset + first.bytes.length + 16));
  const mem = await port.readMemory(0, CHIP_RAM);
  let hit = -1;
  for (let i = 0; i + window.length <= mem.length; i++) {
    let j = 0;
    while (j < window.length && mem[i + j] === window[j]) j++;
    if (j < window.length) continue;
    if (hit >= 0) return null; // two images: which one the player reads is unknown
    hit = i;
  }
  if (hit < 0) return null;
  const base = hit - from;
  placed.set(key, base);
  return base;
}

/** The module as chip RAM last held it, per loaded module (the song's file data is stable across edits). */
const lastWritten = new WeakMap<object, Uint8Array>();

/** Differing runs between two same-length buffers; runs closer than `gap` bytes merge into one write. */
export function diffRuns(a: Uint8Array, b: Uint8Array, gap = 8): Array<{ offset: number; bytes: Uint8Array }> {
  const runs: Array<{ offset: number; end: number }> = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const last = runs[runs.length - 1];
    if (last && i - last.end <= gap) last.end = i + 1; else runs.push({ offset: i, end: i + 1 });
  }
  return runs.map((r) => ({ offset: r.offset, bytes: b.slice(r.offset, r.end) }));
}

/**
 * Write the module `exported` (the native export of the stores now) into the chip RAM the song plays from.
 * `song.uadeEditableFileData` is the loaded module and the diff's first baseline.
 */
export async function writeEditedModuleLive(
  song: TrackerSong,
  exported: Uint8Array,
  port: ChipRamPort,
): Promise<LiveModuleResult> {
  const loaded = song.uadeEditableFileData;
  if (!loaded) return { status: 'unplaced', why: 'the song carries no module bytes' };
  const baseline = lastWritten.get(loaded) ?? new Uint8Array(loaded);
  if (exported.length !== baseline.length) {
    return { status: 'next-play', why: `the export is ${exported.length} bytes, the module in memory ${baseline.length}: offsets after the change moved` };
  }
  const runs = diffRuns(baseline, exported);
  if (runs.length === 0) return { status: 'unchanged' };
  const first = runs[0];
  const base = await moduleBase(loaded, baseline, first, port);
  if (base === null) return { status: 'unplaced', why: 'chip RAM does not hold the module bytes at the base address nor anywhere else' };
  for (const run of runs) await port.writeMemory(base + run.offset, run.bytes);
  lastWritten.set(loaded, exported.slice());
  return { status: 'live', bytes: runs.reduce((n, r) => n + r.bytes.length, 0), runs: runs.length };
}
