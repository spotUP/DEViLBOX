/**
 * MonotoneParser.ts - MONOTONE (.MON) native parser (Trixter's PC speaker tracker).
 *
 * The module is decoded by monotoneGrid.ts (cells kept as raw words, exact
 * inverse); the grid is the module's own patterns (64 rows x tracks), the song
 * order is its order list. Identification: length byte 0x08 + "MONOTONE" at
 * offset 0, version 1, and a file size of exactly 351 + patterns*64*tracks*2.
 * Reference: monotone-wasm/reference/MT_SONG.PAS, MT_PLAY.PAS.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern } from '@/types';
import { decodeMonotoneModule, isMonotoneModule, monWordToCell, monWordIndex, MON_ROWS, type MonotoneModule } from './monotoneGrid';

export function isMonotoneFormat(bytes: Uint8Array): boolean {
  return isMonotoneModule(bytes);
}

export function parseMonotoneFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    const m = decodeMonotoneModule(bytes);
    return m ? buildSong(m, filename, bytes) : null;
  } catch (e) {
    console.warn('[MonotoneParser] Parse failed:', e);
    return null;
  }
}

function buildSong(m: MonotoneModule, filename: string, bytes: Uint8Array): TrackerSong {
  const fallback = filename.replace(/\.[^/.]+$/, '');

  const patterns: Pattern[] = Array.from({ length: m.patterns }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: MON_ROWS,
    channels: Array.from({ length: m.tracks }, (_t, ch) => ({
      id: `channel-${ch}`,
      name: `Track ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: MON_ROWS }, (_r, row) => monWordToCell(m.words[monWordIndex(m, p, row, ch)])),
    })),
    importMetadata: {
      sourceFormat: 'MON',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: m.tracks,
      originalPatternCount: m.patterns,
      originalInstrumentCount: 0,
    },
  }));

  const positions = m.order.filter((p) => p < m.patterns);
  return {
    name: m.title.trim() || fallback,
    format: 'MON',
    patterns,
    instruments: [],
    songPositions: positions,
    songLength: positions.length,
    restartPosition: 0,
    numChannels: m.tracks,
    // Initial speed is ticks per row: max(tracks, 4) at 60 Hz (MT_PLAY.PAS:238).
    initialSpeed: Math.max(m.tracks, 4),
    initialBPM: 125,
    linearPeriods: false,
    // Native playback: the MONOTONE WASM replayer (MonotoneReplayer in wasmEngineRegistry.ts).
    monotoneFileData: bytes.slice().buffer as ArrayBuffer,
  };
}
