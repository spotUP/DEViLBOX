/**
 * PaulSummersParser.ts - Paul Summers (SNK.*) module: the per-voice command streams as an editable tick grid.
 *
 * A module is the player's own code and data image. paulSummersGrid.ts finds the song table and walks every voice of
 * subsong 1 into one row per 50 Hz tick; the streams ride along byte-exact as carrier blocks, and a note edit moves
 * one stored note byte in place (PaulSummersExporter). Audio stays on UADE.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { paulSummersEncoder } from '@/engine/uade/encoders/PaulSummersEncoder';
import { buildPaulSummersGrid, detectPaulSummers, PAUL_SUMMERS_ROWS_PER_PATTERN } from './paulSummersGrid';

export function isPaulSummersFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  return detectPaulSummers(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)) !== null;
}

export function parsePaulSummersFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isPaulSummersFormat(buf)) throw new Error('Not a Paul Summers module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^snk\./i, '').replace(/\.snk$/i, '') || baseName;

  const grid = buildPaulSummersGrid(buf, filename);
  if (!grid) throw new Error('[PaulSummersParser] the voice streams of this module could not be read');
  const R = PAUL_SUMMERS_ROWS_PER_PATTERN;

  // The samples are the player's instrument ranges; the grid's instrument numbers index them.
  const instruments: InstrumentConfig[] = Array.from({ length: Math.max(1, grid.rangeCount) }, (_, i) => ({
    id: i + 1, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  return {
    name: `${moduleName} [Paul Summers]`, format: 'MOD' as TrackerFormat,
    patterns: grid.patterns, instruments, songPositions: grid.patterns.map((_, i) => i),
    songLength: grid.patterns.length, restartPosition: 0, numChannels: 4,
    initialSpeed: 1, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePlayerTickGrid: true,
    uadeVariableLayout: {
      formatId: 'paulSummers',
      numChannels: grid.voices,
      numFilePatterns: grid.blockRows.length,
      rowsPerPattern: R,
      moduleSize: buffer.byteLength,
      encoder: paulSummersEncoder,
      filePatternAddrs: grid.filePatternAddrs,
      filePatternSizes: grid.filePatternSizes,
      trackMap: grid.trackMap,
      blockRows: grid.blockRows,
      propagateSharedCells: true,
      noteBytes: grid.placements.map(pl => ({
        pattern: Math.floor(pl.tick / R), channel: pl.voice, row: pl.tick % R,
        offset: pl.offset, note: pl.note, base: pl.delta,
      })),
    } as UADEVariablePatternLayout,
  };
}
