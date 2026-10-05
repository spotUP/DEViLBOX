/**
 * Sc68Parser.ts — SC68 container ('SC68 Music-file', Atari ST) detection and parser
 *
 * Extracts metadata (title, composer, replay rate) from the SC68 container
 * chunks. Returns a TrackerSong with the raw binary stored in sc68FileData for
 * the Sc68Engine WASM player. Raw and ICE!-packed SNDH files are not SC68
 * containers: SNDHParser takes them and PsgplayEngine plays them.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, InstrumentConfig } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(numCh: number, rows: number): Pattern {
  return {
    id: 'p0', name: 'Pattern 1', length: rows,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `YM ${String.fromCharCode(65 + i)}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

/** Read a null-terminated ASCII string from a byte buffer. */
function readNullTerminated(buf: Uint8Array, off: number, maxLen: number = 256): string {
  let text = '';
  let i = off;
  const end = Math.min(off + maxLen, buf.length);
  while (i < end && buf[i] !== 0) {
    text += String.fromCharCode(buf[i++]);
  }
  return text;
}

/** Check if bytes at offset match a given ASCII tag. */
function matchTag(buf: Uint8Array, off: number, tag: string): boolean {
  if (off + tag.length > buf.length) return false;
  for (let i = 0; i < tag.length; i++) {
    if (buf[off + i] !== tag.charCodeAt(i)) return false;
  }
  return true;
}

function readU16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function readU32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

// ── Metadata Structures ──────────────────────────────────────────────────────

interface Sc68Metadata {
  title: string;
  composer: string;
  year: string;
  numSubsongs: number;
  replayFreq: number;
  subFormat: string;   // 'SC68'
}

// ── SC68 Container Parser ────────────────────────────────────────────────────

function parseSC68Container(buf: Uint8Array): Sc68Metadata {
  const meta: Sc68Metadata = {
    title: '', composer: '', year: '',
    numSubsongs: 1, replayFreq: 50, subFormat: 'SC68',
  };

  // Skip text header line (ends with LF)
  let off = 4;
  while (off < buf.length && buf[off] !== 0x0A) off++;
  off++;

  // Walk SC68 chunks: 2-char ID + uint32 BE size + data
  while (off + 6 <= buf.length) {
    const id0 = String.fromCharCode(buf[off], buf[off + 1]);
    const size = readU32BE(buf, off + 2);
    const dataOff = off + 6;
    if (dataOff + size > buf.length) break;

    if (id0 === 'NM') meta.title = readNullTerminated(buf, dataOff, size);
    else if (id0 === 'AN') meta.composer = readNullTerminated(buf, dataOff, size);
    else if (id0 === 'FQ' && size >= 2) meta.replayFreq = readU16BE(buf, dataOff);

    off = dataOff + size;
  }
  return meta;
}

// ── Format Detection ─────────────────────────────────────────────────────────

export function isSc68Format(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data);
  if (bytes.length < 4) return false;

  // SC68 container: "SC68 Music-file" at offset 0
  return matchTag(bytes, 0, 'SC68 Music-file');
}

// ── Parser ────────────────────────────────────────────────────────────────────

export async function parseSc68File(fileName: string, data: ArrayBuffer): Promise<TrackerSong> {
  const meta = parseSC68Container(new Uint8Array(data));
  const baseName = fileName.replace(/\.sc68$/i, '');

  // Build display title
  let title = meta.title || baseName;
  if (meta.composer) title += ` — ${meta.composer}`;
  title += ` [${meta.subFormat}]`;

  // YM2149 has 3 tone channels: A, B, C
  const NUM_CHANNELS = 3;
  const pattern = emptyPattern(NUM_CHANNELS, 64);

  const ymInst: InstrumentConfig = {
    id: 1, name: 'YM2149 Channel', type: 'synth', synthType: 'Sc68Synth',
    effects: [], volume: 0, pan: 0,
  };

  return {
    name: title,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments: [ymInst],
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    sc68FileData: data.slice(0),
  };
}
