/**
 * BuzParser.ts - Buzzic 1 (.buz) / Buzzic 2 (.buz2) detection and song shell.
 *
 * Playback is the clean-room WASM replayer (buz-wasm, BuzEngine): the parser only checks the
 * file the same way buz_open does and hands the bytes over as buzFileData. The grid shows one
 * 16-row pattern per song block so the playhead (songPos = block, row = row in block) lands.
 * shortcut: cells are empty, no note decode yet; upgrade when the block/sequence grid is built.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';

const BUZ_ROWS = 16;
const le32 = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24));
const le16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);

interface BuzHeader { v2: boolean; bpm: number; first: number; last: number }

/** Same checks as synthw_buz_open / open_buz1 / open_buz2 in buz-wasm/src/buz_engine.cpp. */
function readHeader(b: Uint8Array): BuzHeader | null {
  if (b.length === 44712 || b.length === 45224) {
    const base = 128 * (b.length === 44712 ? 148 : 152);
    const n = le32(b, base);
    if (n < 1 || n > 128) return null;
    const first = le32(b, base + 17564), last = le32(b, base + 17568);
    if (first < 0 || last < first || last > 127) return null;
    return { v2: false, bpm: le32(b, base + 17560), first, last };
  }
  if (b.length >= 156 && b[0] === 0x62 && b[1] === 0x75 && b[2] === 0x7a && b[3] === 0x32 && le16(b, 4) === 2) {
    const first = le32(b, 16), last = le32(b, 20);
    if (first < 0 || last < first || last >= 256) return null;
    return { v2: true, bpm: le32(b, 12), first, last };
  }
  return null;
}

export function isBuzFormat(bytes: Uint8Array): boolean {
  return readHeader(bytes) !== null;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export function parseBuzFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  const h = readHeader(bytes);
  if (!h) return null;
  const label = h.v2 ? 'Buzzic 2' : 'Buzzic 1';
  // Pattern index = block number, so the worklet's songPos maps straight to a pattern.
  const patterns: Pattern[] = Array.from({ length: h.last + 1 }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Block ${p}`,
    length: BUZ_ROWS,
    channels: [{
      id: 'channel-0', name: label, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: BUZ_ROWS }, emptyCell),
    }],
    importMetadata: {
      sourceFormat: 'BUZ', sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: 1, originalPatternCount: h.last + 1, originalInstrumentCount: 0,
    },
  }));
  const positions = Array.from({ length: h.last - h.first + 1 }, (_, i) => h.first + i);
  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'BUZ',
    patterns,
    instruments: [],
    songPositions: positions,
    songLength: positions.length,
    restartPosition: 0,
    numChannels: 1,
    initialSpeed: 6,
    initialBPM: h.bpm > 0 ? h.bpm : 125,
    linearPeriods: false,
    buzFileData: bytes.slice().buffer as ArrayBuffer,
  };
}
