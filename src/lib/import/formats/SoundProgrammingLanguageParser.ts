/**
 * SoundProgrammingLanguageParser.ts - Sound Programming Language (Holger Gehrmann, 1987-88), .spl
 * AmigaDOS HUNK executable used in early Amiga games. Phase A: the grid is read-only.
 * Decoding lives in soundProgrammingLanguageGrid.ts; this file wraps it into a TrackerSong with the
 * byte-exact stream carriers (`uadeVariableLayout.blockRows`). Playback stays on the UADE / nuade engine.
 *
 * UADE eagleplayer.conf: SoundProgrammingLanguage  prefixes=spl
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { splEncoder } from '@/engine/uade/encoders/SoundProgrammingLanguageEncoder';
import { buildSplGrid } from './soundProgrammingLanguageGrid';

export function isSoundProgrammingLanguageFormat(_buffer: ArrayBuffer | Uint8Array, filename?: string): boolean {
  if (filename) {
    const base = (filename.split('/').pop() ?? '').toLowerCase();
    if (base.startsWith('spl.') || base.endsWith('.spl')) return true;
  }
  return false;
}

export function parseSoundProgrammingLanguageFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const base = filename.split('/').pop() ?? filename;
  const moduleName = base.replace(/^spl\./i, '').replace(/\.spl$/i, '') || base;
  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];
  let layout: UADEVariablePatternLayout | undefined;
  let unmatched: string | null = null;
  let bpm = 125;

  const grid = buildSplGrid(buf);
  if (typeof grid === 'string') {
    unmatched = grid;
  } else {
    patterns = grid.patterns;
    songPositions = grid.songPositions;
    bpm = grid.bpm;
    layout = {
      formatId: 'soundProgrammingLanguage',
      numChannels: 4,
      numFilePatterns: grid.streams.length,
      rowsPerPattern: patterns.map((p) => p.length),
      moduleSize: buf.length,
      encoder: splEncoder,
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
    name: `${moduleName} [SPL]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments: [],
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    // one grid row is one replayer step; at speed 1 the BPM sets the step rate
    initialSpeed: 1,
    initialBPM: bpm,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
  };
  if (layout) (result as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout = layout;
  else result.gridUnmatchedReason = unmatched ?? 'the grid was not matched to the replayer';
  return result;
}
