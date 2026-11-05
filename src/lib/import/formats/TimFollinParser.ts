/**
 * TimFollinParser - Tim Follin (UADE prefix "tf.") as an editable-grid song, phase A: the grid is read-only.
 * Decoding lives in timFollinGrid.ts; this file wraps it into a TrackerSong with the byte-exact
 * stream carriers (`uadeVariableLayout.blockRows`). Playback stays on the UADE / nuade engine.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { timFollinEncoder } from '@/engine/uade/encoders/TimFollinEncoder';
import { buildTimFollinGrid, locateTimFollin } from './timFollinGrid';

/** True for a module whose song table and stream addresses resolve (the "tf." / ".tf" name is checked by the caller). */
export function isTimFollinFormat(buffer: ArrayBuffer, filename?: string): boolean {
  if (filename && !/(^|\/)tf\.|\.tf$/i.test(filename)) return false;
  return locateTimFollin(new Uint8Array(buffer)) !== null;
}

export function parseTimFollinFile(buffer: ArrayBuffer, filename: string, subsong = 0): TrackerSong {
  const buf = new Uint8Array(buffer);
  const base = filename.split('/').pop() ?? filename;
  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];
  let layout: UADEVariablePatternLayout | undefined;

  const grid = buildTimFollinGrid(buf, subsong);
  if (grid) {
    patterns = grid.patterns;
    songPositions = grid.songPositions;
    layout = {
      formatId: 'timFollin',
      numChannels: 4,
      numFilePatterns: grid.regions.length,
      rowsPerPattern: patterns.map((p) => p.length),
      moduleSize: buf.length,
      encoder: timFollinEncoder,
      filePatternAddrs: grid.regions.map((r) => r.offset),
      filePatternSizes: grid.regions.map((r) => r.size),
      trackMap: grid.regionAtStart,
      blockRows: grid.blockRows,
    };
  } else {
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
    name: `${base.replace(/^tf\./i, '').replace(/\.tf$/i, '')} [Tim Follin]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments: [],
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    // one grid row is one song step (timFollinGrid.ts): speed = step ticks of 20 ms at 125 BPM
    initialSpeed: grid?.step ?? 1,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
  };
  if (layout) (result as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout = layout;
  else result.gridUnmatchedReason = 'the voices have no notes the replayer plays';
  return result;
}
