/**
 * SAPParser.ts — Atari 8-bit POKEY SAP format parser
 *
 * Parses the plain-ASCII header (terminated by 0xFF 0xFF) for metadata:
 * title, author, song count, stereo flag. Creates POKEY instrument stubs.
 * Full pattern extraction requires POKEY+6502 emulation — not in scope.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import { DEFAULT_FURNACE } from '@/types/instrument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(numCh: number): Pattern {
  return {
    id: 'p0', name: 'Pattern 1', length: 16,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `POKEY ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: 16 }, emptyCell),
    })),
  };
}

// ── Header Parser ─────────────────────────────────────────────────────────────

interface SAPMeta {
  name: string;
  author: string;
  date: string;
  songs: number;
  stereo: boolean;
}

function parseSAPHeader(buf: Uint8Array): SAPMeta {
  const meta: SAPMeta = { name: '', author: '', date: '', songs: 1, stereo: false };
  let off = 0;

  while (off < buf.length - 1) {
    if (buf[off] === 0xFF && buf[off + 1] === 0xFF) break;

    // Find end of line
    let lineEnd = off;
    while (lineEnd < buf.length && buf[lineEnd] !== 0x0A) lineEnd++;
    const line = new TextDecoder('latin1')
      .decode(buf.subarray(off, lineEnd))
      .replace(/\r/g, '')
      .trim();

    if (line.startsWith('NAME '))   meta.name   = line.slice(5).replace(/^"|"$/g, '').trim();
    if (line.startsWith('AUTHOR ')) meta.author = line.slice(7).replace(/^"|"$/g, '').trim();
    if (line.startsWith('DATE '))   meta.date   = line.slice(5).replace(/^"|"$/g, '').trim();
    if (line.startsWith('SONGS '))  meta.songs  = parseInt(line.slice(6)) || 1;
    if (line === 'STEREO')          meta.stereo = true;

    off = lineEnd + 1;
  }

  return meta;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isSAPFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 3 && b[0] === 0x53 && b[1] === 0x41 && b[2] === 0x50; // "SAP"
}

export async function parseSAPFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  if (!isSAPFormat(buffer)) throw new Error('Not a valid SAP file');
  const buf = new Uint8Array(buffer);
  const meta = parseSAPHeader(buf);

  // Stereo SAP uses two POKEY chips (8 channels total)
  const numCh = meta.stereo ? 8 : 4;

  const instruments: InstrumentConfig[] = Array.from({ length: numCh }, (_, i) => ({
    id: i + 1,
    name: `POKEY ${i + 1}`,
    type: 'synth' as const,
    synthType: 'FurnacePOKEY' as const,
    furnace: { ...DEFAULT_FURNACE, chipType: 20, ops: 2 },
  }));

  return {
    name: (meta.name || filename.replace(/\.sap$/i, '')) + (meta.author ? ` — ${meta.author}` : ''),
    format: 'SAP' as TrackerFormat,
    patterns: [emptyPattern(numCh)],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 125,
  };
}
