/**
 * BeathovenParser - Beathoven Synthesizer (.bss) as an editable-grid song, phase A: the grid is read-only.
 * Decoding lives in beathovenGrid.ts; this file wraps it into a TrackerSong with the byte-exact
 * stream carriers (`uadeVariableLayout.blockRows`). Playback stays on the EaglePlayer / nuade engine.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { beathovenEncoder } from '@/engine/uade/encoders/BeathovenEncoder';
import { buildBthGrid, isBthModule } from './beathovenGrid';

export function isBeathovenFormat(buffer: ArrayBuffer): boolean {
  return isBthModule(new Uint8Array(buffer));
}

export function parseBeathovenFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const base = filename.split('/').pop() ?? filename;
  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];
  let layout: UADEVariablePatternLayout | undefined;
  let unmatched: string | null = null;

  const grid = buildBthGrid(buf);
  if (typeof grid === 'string') {
    unmatched = grid;
  } else {
    patterns = grid.patterns;
    songPositions = grid.songPositions;
    layout = {
      formatId: 'beathoven',
      numChannels: 4,
      numFilePatterns: grid.streams.length,
      rowsPerPattern: patterns.map((p) => p.length),
      moduleSize: buf.length,
      encoder: beathovenEncoder,
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
    name: `${base.replace(/\.bss$/i, '')} [Beathoven Synthesizer]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments: [],
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    // one grid row is one replayer step; the legacy engine steps once per 50 Hz tick
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
