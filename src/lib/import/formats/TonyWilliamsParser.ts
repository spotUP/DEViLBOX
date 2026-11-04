/**
 * TonyWilliamsParser.ts - Tony Williams (Sound Images, .tw) native import: tick grid + byte-exact
 * block carriers (docs/FORMAT_COMMAND_STREAM_GRID.md). UADE stays the player.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerCell } from '@/types';
import { tonyWilliamsEncoder } from '@/engine/uade/encoders/TonyWilliamsEncoder';
import { walkTonyWilliams, twSongInfo, readTwBlock, TW_VOICES } from './tonyWilliamsWalk';
import { buildTwGrid } from './tonyWilliamsGrid';
import { createSamplerInstrument } from './AmigaUtils';

const TW_INSTR_ENTRY = 12;
const TW_MAX_INSTR = 16;
/** Amiga C-3 sample rate, as every sibling sampler parser uses. */
const TW_SAMPLE_RATE = 8287;

/**
 * One sample instrument per table entry a D0-DF command selects (id = entry + 1, the id the grid shows).
 * Entry: long sample ptr + word length (words), long loop ptr + word loop length (words); pointers are offsets from
 * the file start (the player's a5). A loop pointing outside the sample (the shared silent-loop stub) means no loop.
 * The file carries no names, so none are invented.
 */
function buildTwSampleInstruments(bytes: Uint8Array, table: number, blockRows: TrackerCell[][]): InstrumentConfig[] {
  if (table < 0) return [];
  const used = new Set<number>();
  for (const rows of blockRows) for (const c of rows) { const op = c.period ?? 0; if (op >= 0xd0 && op <= 0xdf) used.add(op - 0xd0); }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: InstrumentConfig[] = [];
  for (const idx of [...used].sort((a, b) => a - b)) {
    const o = table + idx * TW_INSTR_ENTRY;
    if (idx >= TW_MAX_INSTR || o + TW_INSTR_ENTRY > bytes.length) continue;
    const ptr = view.getUint32(o);
    const len = view.getUint16(o + 4) * 2;
    const loopPtr = view.getUint32(o + 6);
    const loopLen = view.getUint16(o + 10) * 2;
    if (len === 0 || ptr + len > bytes.length) continue;
    let loopStart = 0;
    let loopEnd = 0;
    if (loopLen > 2 && loopPtr >= ptr && loopPtr + loopLen <= ptr + len) {
      loopStart = loopPtr - ptr;
      loopEnd = loopStart + loopLen;
    }
    const inst = createSamplerInstrument(idx + 1, '', bytes.slice(ptr, ptr + len), 64, TW_SAMPLE_RATE, loopStart, loopEnd);
    // The generic chip-RAM sample path (chipRamSamplePatch.ts): PCM at `ptr` (len bytes allocated), and the table
    // entry's length / loop fields. The module base is UADE's to say at play time; file offsets are what the patch needs.
    inst.uadeChipRam = {
      moduleBase: 0, moduleSize: bytes.length, instrBase: ptr, instrSize: len,
      sections: { sampleOffset: ptr, lengthField: o + 4, loopPtrField: o + 6, loopLenField: o + 10 },
    };
    out.push(inst);
  }
  return out;
}

export function isTonyWilliamsFormat(input: ArrayBuffer | Uint8Array): boolean {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  return twSongInfo(b, 0) !== null;
}

/** One carrier cell per stream command: cutoff = length, period/pan/resonance/eff/eff2 = bytes 0..4. */
function carrier(op: number, args: number[], len: number): TrackerCell {
  return {
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: args[2] ?? 0, effTyp2: 0, eff2: args[3] ?? 0,
    cutoff: len, period: op, pan: args[0] ?? 0, resonance: args[1] ?? 0,
  } as TrackerCell;
}

export async function parseTonyWilliamsFile(buffer: ArrayBuffer, filename: string, subsong = 0): Promise<TrackerSong> {
  const bytes = new Uint8Array(buffer);
  const walk = walkTonyWilliams(bytes, subsong);
  if (!walk) throw new Error('Not a Tony Williams module the walker understands');
  const grid = buildTwGrid(walk);
  const addrs = walk.blocks;
  const blockRows: TrackerCell[][] = [];
  const blockRawBytes: Uint8Array[] = [];
  const sizes: number[] = [];
  for (const a of addrs) {
    const cmds = readTwBlock(bytes, a) ?? [];
    blockRows.push(cmds.map((c) => carrier(c.op, c.args, c.length)));
    const last = cmds[cmds.length - 1];
    const end = last ? last.offset + last.length : a;
    blockRawBytes.push(bytes.slice(a, end));
    sizes.push(end - a);
  }
  const instruments = buildTwSampleInstruments(bytes, walk.info.instrumentTable, blockRows);
  const baseName = filename.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
  const result: TrackerSong = {
    name: baseName, format: 'XM' as TrackerFormat,
    patterns: grid.patterns, instruments, songPositions: grid.songPositions, songLength: grid.songPositions.length,
    restartPosition: 0, numChannels: TW_VOICES, initialSpeed: walk.info.speed, initialBPM: 125,
    // The player steps on its 50 Hz vertical-blank interrupt, not CIA-A Timer A (which stays 0 for TW), so the
    // playhead must follow UADE's player-interrupt count; without this the cursor never got an engine row.
    uadePlayerTickGrid: true,
    uadeEditableFileData: buffer.slice(0), uadeEditableFileName: filename,
  };
  const layout: UADEVariablePatternLayout = {
    formatId: 'tonyWilliams', numChannels: TW_VOICES, numFilePatterns: addrs.length,
    rowsPerPattern: grid.patterns.map((p) => p.length), moduleSize: buffer.byteLength,
    encoder: tonyWilliamsEncoder, filePatternAddrs: addrs, filePatternSizes: sizes,
    trackMap: grid.blockAtStart.map((row) => row.map((a) => addrs.indexOf(a))),
    blockRows, blockRawBytes,
  };
  (result as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout = layout;
  return result;
}
