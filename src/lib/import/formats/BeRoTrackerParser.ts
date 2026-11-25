/**
 * BeRoTrackerParser.ts - BeRoTracker (.brt) detection and song shell.
 *
 * Playback is the clean-room WASM replayer (berotracker-wasm, BeRoTrackerEngine): the parser checks
 * the 'BRTF' signature the way the engine's load() does, walks the chunks (bbmp description section 2)
 * for INFO channels, PORD order list and each PATT's row count, and hands the bytes over as
 * beRoTrackerFileData. One empty pattern per pattern number with its own row count, so the playhead
 * (songPos = order index, row) lands. The newer ZIP form ('PK\3\4') is refused, as the engine does.
 * shortcut: cells are empty, no cell decode yet; upgrade when the WASM grid parser is built.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';

const DEFAULT_ROWS = 64;
const MAX_ROWS = 4096;

const isMagic = (b: Uint8Array, s: string): boolean => b.length >= 4 && [...s].every((c, i) => b[i] === c.charCodeAt(0));

export function isBeRoTrackerFormat(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && isMagic(bytes, 'BRTF');
}

/** The newer ZIP-packed BeRoTracker form; the engine refuses it, so the import says so. */
export function isBeRoTrackerZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
}

interface BrtHeader { channels: number; speed: number; bpm: number; order: number[]; rows: Map<number, number> }

/** Chunk walk: tag, u32 length, data; unknown chunks skipped; stops where a chunk runs past the end. */
function readHeader(b: Uint8Array): BrtHeader | null {
  if (!isBeRoTrackerFormat(b)) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let channels = 0, speed = 6, bpm = 125;
  let order: number[] = [];
  const rows = new Map<number, number>();
  for (let pos = 8; pos + 8 <= b.length;) {
    const tag = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]);
    const n = v.getUint32(pos + 4, true);
    pos += 8;
    if (n > b.length - pos) break;
    const p = pos;
    pos += n;
    if (tag === 'INFO' && n >= 16) {
      // version u16, flags u16, speed u8, bpm u8, sep u16, gv u16, mixVol u16, reserved u16, channels u16
      speed = Math.max(b[p + 4], 1);
      bpm = b[p + 5];
      channels = v.getUint16(p + 14, true);
    } else if (tag === 'PORD' && n >= 2) {
      const k = Math.min(v.getUint16(p, true), 256);
      order = Array.from({ length: k + 1 }, (_, i) => (p + 2 + i < pos ? b[p + 2 + i] : 255));
    } else if (tag === 'PATT' && n >= 1) {
      const num = b[p];
      const nameLen = p + 1 < pos ? b[p + 1] : 0;
      const o = p + 2 + nameLen;
      if (num < 240 && o + 2 <= pos) rows.set(num, Math.min(v.getUint16(o, true), MAX_ROWS));
    }
  }
  if (channels < 1 || channels > 256) return null;
  const end = order.indexOf(255);
  if (end >= 0) order = order.slice(0, end);
  // Skip markers (240..254) stay in place so order index = engine curOrder; each shows the pattern the engine moves on to.
  const real = order.map((p, i) => (p < 240 ? p : order.slice(i).find((q) => q < 240) ?? 0));
  return { channels, speed, bpm, order: real, rows };
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export function parseBeRoTrackerFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  const h = readHeader(bytes);
  if (!h) return null;
  const channels = h.channels;
  const order = h.order.length > 0 ? h.order : [0];
  const count = Math.max(...order, ...h.rows.keys()) + 1;
  // Pattern index = pattern number, so songPositions is the file's order list as is.
  const patterns: Pattern[] = Array.from({ length: count }, (_, p) => {
    const length = h.rows.get(p) || DEFAULT_ROWS; // engine fix-up: missing or 0-row listed patterns play as 64 empty rows
    return {
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length,
      channels: Array.from({ length: channels }, (_, c) => ({
        id: `channel-${c}`, name: `Channel ${c + 1}`, muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null,
        rows: Array.from({ length }, emptyCell),
      })),
      importMetadata: {
        sourceFormat: 'BeRoTracker', sourceFile: filename, importedAt: new Date().toISOString(),
        originalChannelCount: channels, originalPatternCount: count, originalInstrumentCount: 0,
      },
    };
  });
  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'BeRoTracker',
    patterns,
    instruments: [],
    songPositions: order,
    songLength: order.length,
    restartPosition: 0,
    numChannels: channels,
    initialSpeed: h.speed,
    initialBPM: h.bpm,
    linearPeriods: false,
    beRoTrackerFileData: bytes.slice().buffer as ArrayBuffer,
  };
}
