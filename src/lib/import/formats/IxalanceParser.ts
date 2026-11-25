/**
 * IxalanceParser.ts -- Ixalance (.ixs) format parser
 *
 * Ixalance is an extended Impulse Tracker format supporting up to 64 channels.
 * Playback is the Ixalance WASM engine (suppressNotes = true); the grid is decoded
 * in wasm by the replayer's own unpacker (ixs_grid.cpp).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Check if a buffer looks like an Ixalance (IXS) file.
 * IXS files have "IXS!" magic bytes at offset 0.
 */
export function isIxsFormat(data: ArrayBuffer): boolean {
  if (data.byteLength < 32) return false;
  const view = new DataView(data);
  // "IXS!" = 0x49 0x58 0x53 0x21
  return view.getUint8(0) === 0x49 &&
         view.getUint8(1) === 0x58 &&
         view.getUint8(2) === 0x53 &&
         view.getUint8(3) === 0x21;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse an Ixalance (IXS) module file into a TrackerSong. The grid comes from the replayer's own
 * loader and IT pattern unpacker in wasm (ixalanceEditWasm / ixs_grid.cpp); playback stays the
 * Ixalance engine, which plays `ixsFileData` (an edit is saved into those bytes on export).
 */
export async function parseIxsFile(
  fileName: string,
  data: ArrayBuffer,
): Promise<TrackerSong> {
  if (data.byteLength <= 100) {
    throw new Error(
      `Invalid IXS file: too small (${data.byteLength} bytes, minimum 100)`
    );
  }
  const { ixalanceGrid } = await import('@/engine/ixalance/ixalanceEditWasm');
  const grid = await ixalanceGrid(new Uint8Array(data));
  const numChannels = Math.max(1, grid.channels);
  const baseName = fileName.replace(/\.[^.]+$/, '');

  let maxIns = 0;
  const patterns = grid.patterns.map((cells, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: cells.length,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch % 2 === 0 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: cells.map((row) => { const c = row[ch]; if (c.instrument > maxIns) maxIns = c.instrument; return c; }),
    })),
    importMetadata: {
      sourceFormat: 'IXS' as const,
      sourceFile: fileName,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: grid.patterns.length,
      originalInstrumentCount: maxIns,
    },
  }));

  // The engine plays the module's own instruments; these slots only carry the numbers the grid uses.
  const instruments: InstrumentConfig[] = Array.from({ length: Math.max(1, maxIns) }, (_, i) => ({
    id: i + 1, name: '', type: 'synth' as const,
    synthType: 'IxalanceSynth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const songPositions = grid.order.length ? grid.order : [0];
  return {
    name: `${baseName} [Ixalance]`,
    format: 'IXS' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    ixsFileData: data.slice(0),
  };
}
