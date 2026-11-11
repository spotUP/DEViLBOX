/**
 * OrganyaParser.ts -- Organya (.org) format parser
 *
 * Organya is the music format used by Cave Story (Doukutsu Monogatari),
 * created by Daisuke "Pixel" Amaya. It uses 8 melody channels and 8 drum
 * channels for a total of 16 channels.
 *
 * The module is decoded by organyaGrid.ts (the original image is the carrier,
 * events are placed per track on the song's own position grid). Playback is
 * the Organya WASM engine (suppressNotes = true). A file the grid cannot decode
 * (size not implied by its track records) still plays: it gets the empty shell.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import { decodeOrganyaModule, organyaEventCell, ORGANYA_ROWS, type OrganyaModule } from './organyaGrid';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Check if a buffer looks like an Organya module.
 * Organya files begin with the ASCII magic bytes "Org-" at offset 0.
 */
export function isOrganyaFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const view = new Uint8Array(buffer, 0, 4);
  // "Org-" = 0x4F 0x72 0x67 0x2D
  return view[0] === 0x4F && view[1] === 0x72 && view[2] === 0x67 && view[3] === 0x2D;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse an Organya module file into a TrackerSong.
 *
 * Returns a minimal TrackerSong with one empty pattern.
 * The WASM engine handles all actual playback — this just provides the
 * TrackerSong shell that the UI/store layer expects.
 */
export async function parseOrganyaFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (buffer.byteLength < 4) {
    throw new Error(
      `Invalid Organya file: too small (${buffer.byteLength} bytes, minimum 4)`
    );
  }

  if (!isOrganyaFormat(buffer)) {
    throw new Error('Invalid Organya file: missing "Org-" magic bytes');
  }

  const decoded = decodeOrganyaModule(new Uint8Array(buffer));
  if (decoded) return buildGridSong(decoded, buffer, filename);

  const numChannels = 16; // 8 melody + 8 drum
  const numRows = 64;
  const baseName = filename.replace(/\.[^.]+$/, '');

  const emptyRows = Array.from({ length: numRows }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: numRows,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: ch < 8 ? `Melody ${ch + 1}` : `Drum ${ch - 7}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'Organya' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  const instruments: InstrumentConfig[] = [{
    id: 1, name: '', type: 'synth' as const,
    synthType: 'OrganyaSynth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  return {
    name: `${baseName} [Organya]`,
    format: 'Organya' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    organyaFileData: buffer.slice(0),
  };
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

function buildGridSong(m: OrganyaModule, buffer: ArrayBuffer, filename: string): TrackerSong {
  const cells = Array.from({ length: m.patterns }, () =>
    Array.from({ length: m.channels }, () => Array.from({ length: ORGANYA_ROWS }, emptyCell)));
  m.place.forEach((ps, t) => ps.forEach((p, i) => { cells[p.pattern][p.channel][p.row] = organyaEventCell(m, t, i); }));
  const names: string[] = [];
  m.lanes.forEach((n, t) => {
    const base = t < 8 ? `Melody ${t + 1}` : `Drum ${t - 7}`;
    for (let l = 0; l < n; l++) names.push(l === 0 ? base : `${base}.${l + 1}`);
  });
  const patterns: Pattern[] = cells.map((chs, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: ORGANYA_ROWS,
    channels: chs.map((rows, ch) => ({
      id: `channel-${ch}`, name: names[ch], muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null, rows,
    })),
    importMetadata: {
      sourceFormat: 'Organya' as const, sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: m.channels, originalPatternCount: m.patterns, originalInstrumentCount: 0,
    },
  }));
  const positions = patterns.map((_, p) => p);
  const baseName = filename.replace(/\.[^.]+$/, '');
  return {
    name: `${baseName} [Organya]`,
    format: 'Organya' as TrackerFormat,
    patterns,
    instruments: [{
      id: 1, name: '', type: 'synth' as const,
      synthType: 'OrganyaSynth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig],
    songPositions: positions,
    songLength: positions.length,
    restartPosition: 0,
    numChannels: m.channels,
    // One row is `zoom` position ticks of `wait` ms; at 125 BPM a speed of 1 is 20 ms.
    initialSpeed: Math.max(1, Math.round(m.zoom * m.wait / 20)),
    initialBPM: 125,
    linearPeriods: false,
    organyaFileData: buffer.slice(0),
  };
}
