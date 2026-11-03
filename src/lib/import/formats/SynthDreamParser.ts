/**
 * SynthDreamParser - SynthDream (UADE prefix "sdr.") as an editable-grid song, phase A: the grid is read-only.
 * Decoding lives in synthDreamGrid.ts; this file wraps it into a TrackerSong with the byte-exact
 * stream carriers (`uadeVariableLayout.blockRows`). Playback stays on the UADE / nuade engine.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { synthDreamEncoder } from '@/engine/uade/encoders/SynthDreamEncoder';
import { buildSdrGrid, sdrSubsongCount } from './synthDreamGrid';

/** True for a module whose header tables are in range (the "sdr." prefix is checked by the caller). */
export function isSynthDreamFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const b = new Uint8Array(buffer);
  if (b.length < 0x1c) return false;
  if (filename && !/(^|\/)sdr\./i.test(filename)) return false;
  const dv = new DataView(buffer);
  const instruments = dv.getUint32(0);
  const volume = dv.getUint32(4);
  const pitch = dv.getUint32(8);
  return volume >= 0x1c && volume < b.length && instruments < b.length && pitch < b.length && sdrSubsongCount(b) > 0;
}

export function parseSynthDreamFile(buffer: ArrayBuffer, filename: string, subsong = 0): TrackerSong {
  const buf = new Uint8Array(buffer);
  const base = filename.split('/').pop() ?? filename;
  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];
  let layout: UADEVariablePatternLayout | undefined;
  let unmatched: string | null = null;

  const grid = buildSdrGrid(buf, subsong);
  if (!grid) {
    unmatched = 'the voices have no commands';
  } else if (grid.streams.some((s) => s.broken)) {
    unmatched = 'a command stream holds a word the replayer cannot run';
  } else {
    patterns = grid.patterns;
    songPositions = grid.songPositions;
    layout = {
      formatId: 'synthDream',
      numChannels: 4,
      numFilePatterns: grid.streams.length,
      rowsPerPattern: patterns.map((p) => p.length),
      moduleSize: buf.length,
      encoder: synthDreamEncoder,
      filePatternAddrs: grid.streams.map((s) => s.offset),
      filePatternSizes: grid.streams.map((s) => s.size),
      trackMap: grid.streamAtStart,
      blockRows: grid.blockRows,
    };
  }

  if (!layout) {
    const emptyRows = (): TrackerCell[] => Array.from({ length: 64 }, () => ({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));
    patterns = [{
      id: 'pattern-0', name: 'Pattern 0', length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false,
        volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null, rows: emptyRows(),
      })),
    }];
  }

  patterns[0].importMetadata = {
    sourceFormat: 'MOD' as const,
    sourceFile: filename,
    importedAt: new Date().toISOString(),
    originalChannelCount: 4,
    originalPatternCount: patterns.length,
    originalInstrumentCount: 0,
  };

  const result: TrackerSong = {
    name: `${base.replace(/^sdr\./i, '')} [SynthDream]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments: [],
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    // one grid row is one 50 Hz replayer tick: speed 1 at 125 BPM = 20 ms
    initialSpeed: 1,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
  };
  if (layout) (result as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout = layout;
  else result.gridUnmatchedReason = unmatched ?? 'the grid was not matched to the replayer';
  return result;
}
