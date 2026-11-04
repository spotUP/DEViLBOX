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
  const instruments: InstrumentConfig[] = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1, name: `Instrument ${i + 1}`, type: 'synth' as const, synthType: 'Synth' as const,
    effects: [], volume: 0, pan: 0,
  })) as unknown as InstrumentConfig[];
  const baseName = filename.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
  const result: TrackerSong = {
    name: baseName, format: 'XM' as TrackerFormat,
    patterns: grid.patterns, instruments, songPositions: grid.songPositions, songLength: grid.songPositions.length,
    restartPosition: 0, numChannels: TW_VOICES, initialSpeed: 1, initialBPM: 125,
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
