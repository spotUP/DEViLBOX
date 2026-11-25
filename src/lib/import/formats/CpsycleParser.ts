/**
 * CpsycleParser.ts -- Psycle tracker (.psy) format parser
 *
 * Psycle is an open-source modular music tracker for Windows. It supports
 * PSY3 (current) and PSY2 (legacy) file formats. PSY3 files begin with
 * "PSY3SONG" and PSY2 files begin with "PSY2SONG".
 *
 * Playback is the cpsycle WASM engine (suppressNotes = true). The PSY3 grid is decoded in
 * wasm by the vendored loader and beerz77 unpacker (cpsycle-wasm/cpsycle_grid.c); edits are
 * saved into `psycleFileData` on export (CpsycleExporter).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

const PSY3_MAGIC = 'PSY3SONG';
const PSY2_MAGIC = 'PSY2SONG';

/**
 * Check if a buffer looks like a Psycle module (PSY2 or PSY3).
 * Both formats start with an 8-byte ASCII magic string.
 */
export function isPsycleFormat(data: ArrayBuffer): boolean {
  if (data.byteLength < 8) return false;

  const header = new Uint8Array(data, 0, 8);
  let magic = '';
  for (let i = 0; i < 8; i++) {
    magic += String.fromCharCode(header[i]);
  }

  return magic === PSY3_MAGIC || magic === PSY2_MAGIC;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a Psycle module file into a TrackerSong. PSY3 songs get the decoded grid and order;
 * PSY2 songs (no wasm grid decoder) keep a single empty pattern shell.
 */
export async function parsePsycleFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isPsycleFormat(buffer)) {
    throw new Error('Invalid Psycle file: missing PSY2SONG or PSY3SONG magic');
  }
  const baseName = filename.replace(/\.[^.]+$/, '');
  const isPsy3 = new TextDecoder().decode(new Uint8Array(buffer, 0, 8)) === PSY3_MAGIC;

  // shortcut: PSY2 songs have no grid decoder yet, so they open as one empty 64x64 pattern.
  let grid: { channels: number; order: number[]; patterns: { note: number; instrument: number; volume: number; effTyp: number; eff: number; effTyp2: number; eff2: number }[][][] };
  if (isPsy3) {
    const { cpsycleGrid } = await import('@/engine/cpsycle/cpsycleEditWasm');
    grid = await cpsycleGrid(new Uint8Array(buffer));
  } else {
    const empty = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
    grid = { channels: 64, order: [0], patterns: [Array.from({ length: 64 }, () => Array.from({ length: 64 }, empty))] };
  }
  const numChannels = Math.max(1, grid.channels);

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
      pan: 0,
      instrumentId: null,
      color: null,
      rows: cells.map((row) => { const c = row[ch]; if (c.instrument > maxIns) maxIns = c.instrument; return c; }),
    })),
    importMetadata: {
      sourceFormat: 'Psycle' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: grid.patterns.length,
      originalInstrumentCount: maxIns,
    },
  }));

  // The engine plays the song's own machines; these slots only carry the machine numbers the grid uses.
  const instruments: InstrumentConfig[] = Array.from({ length: Math.max(1, maxIns) }, (_, i) => ({
    id: i + 1, name: `Machine ${i + 1}`, type: 'synth' as const,
    synthType: 'CpsycleSynth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const songPositions = grid.order.length ? grid.order : [0];
  return {
    name: `${baseName} [Psycle]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    psycleFileData: buffer.slice(0),
  };
}
