/**
 * KdmParser.ts - Ken Silverman KDM (.kdm) native parser.
 *
 * The module is decoded by kdmGrid.ts (the original image is the carrier,
 * grid events are placed per track and lane at the song's own tick zoom).
 * Playback is the KDM WASM replayer (kdm-wasm, KdmEngine). One grid row is
 * `zoom` ticks of 1/120 s: speed = zoom at 300 BPM is zoom * 2.5 / 300 s.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';
import { decodeKdmModule, isKdmModule, kdmEventCell, KDM_ROWS, type KdmModule } from './kdmGrid';

export function isKdmFormat(bytes: Uint8Array): boolean {
  return isKdmModule(bytes);
}

export function parseKdmFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    const m = decodeKdmModule(bytes);
    return m ? buildSong(m, filename, bytes) : null;
  } catch (e) {
    console.warn('[KdmParser] Parse failed:', e);
    return null;
  }
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

function buildSong(m: KdmModule, filename: string, bytes: Uint8Array): TrackerSong {
  const cells = Array.from({ length: m.patterns }, () =>
    Array.from({ length: m.channels }, () => Array.from({ length: KDM_ROWS }, emptyCell)));
  m.place.forEach((p, i) => { cells[p.pattern][p.channel][p.row] = kdmEventCell(m, i); });
  const names: string[] = [];
  m.lanes.forEach((n, t) => { for (let l = 0; l < n; l++) names.push(l === 0 ? `Track ${t + 1}` : `Track ${t + 1}.${l + 1}`); });

  const patterns: Pattern[] = cells.map((chs, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: KDM_ROWS,
    channels: chs.map((rows, ch) => ({
      id: `channel-${ch}`, name: names[ch], muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null, rows,
    })),
    importMetadata: {
      sourceFormat: 'KDM', sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: m.channels, originalPatternCount: m.patterns, originalInstrumentCount: 0,
    },
  }));
  const positions = patterns.map((_, p) => p);
  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'KDM',
    patterns,
    instruments: [],
    songPositions: positions,
    songLength: positions.length,
    restartPosition: 0,
    numChannels: m.channels,
    initialSpeed: m.zoom,
    initialBPM: 300,
    linearPeriods: false,
    kdmFileData: bytes.slice().buffer as ArrayBuffer,
  };
}
