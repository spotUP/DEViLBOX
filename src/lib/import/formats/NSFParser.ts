/**
 * NSFParser.ts — NES Sound Format parser
 *
 * Parses NSF (NESM\x1A) and NSFE (chunk-based) headers. Extracts metadata
 * (title, artist, song count, expansion chip flags) and creates instrument
 * stubs for all detected channels. Full pattern extraction requires 6502
 * CPU emulation — not in scope; these files use UADE/audio for playback.
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
      id: `ch${i}`, name: `CH ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: 16 }, emptyCell),
    })),
  };
}

function readStr(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Instrument Builder ─────────────────────────────────────────────────────────

function buildNESInstruments(expansionByte: number): InstrumentConfig[] {
  const insts: InstrumentConfig[] = [];
  let id = 1;

  // Base 2A03 channels (Pulse 1, Pulse 2, Triangle, Noise)
  const nesBase = ['NES Pulse 1', 'NES Pulse 2', 'NES Triangle', 'NES Noise'];
  for (const name of nesBase) {
    insts.push({ id: id++, name, type: 'synth', synthType: 'FurnaceNES',
      furnace: { ...DEFAULT_FURNACE, chipType: 34, ops: 2 } });
  }

  // Expansion chips
  if (expansionByte & 0x01) { // VRC6
    for (const name of ['VRC6 Pulse 1', 'VRC6 Pulse 2', 'VRC6 Sawtooth']) {
      insts.push({ id: id++, name, type: 'synth', synthType: 'FurnaceNES',
        furnace: { ...DEFAULT_FURNACE, chipType: 34, ops: 2 } });
    }
  }
  if (expansionByte & 0x02) { // VRC7 (FM)
    for (let i = 0; i < 6; i++) {
      insts.push({ id: id++, name: `VRC7 FM ${i + 1}`, type: 'synth', synthType: 'FurnaceOPLL',
        furnace: { ...DEFAULT_FURNACE, chipType: 13, ops: 2 } });
    }
  }
  if (expansionByte & 0x04) { // FDS
    insts.push({ id: id++, name: 'FDS Wave', type: 'synth', synthType: 'FurnaceFDS',
      furnace: { ...DEFAULT_FURNACE, chipType: 15, ops: 2 } });
  }
  if (expansionByte & 0x08) { // MMC5
    for (const name of ['MMC5 Pulse 1', 'MMC5 Pulse 2']) {
      insts.push({ id: id++, name, type: 'synth', synthType: 'FurnaceMMC5',
        furnace: { ...DEFAULT_FURNACE, chipType: 34, ops: 2 } });
    }
  }
  if (expansionByte & 0x10) { // N163 (Namco 163)
    for (let i = 0; i < 8; i++) {
      insts.push({ id: id++, name: `N163 Wave ${i + 1}`, type: 'synth', synthType: 'FurnaceN163',
        furnace: { ...DEFAULT_FURNACE, chipType: 17, ops: 2 } });
    }
  }
  if (expansionByte & 0x20) { // Sunsoft 5B (AY-3-8910)
    for (let i = 0; i < 3; i++) {
      insts.push({ id: id++, name: `5B AY ${i + 1}`, type: 'synth', synthType: 'FurnaceAY',
        furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 } });
    }
  }

  return insts;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isNSFFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 5 &&
    b[0] === 0x4E && b[1] === 0x45 && b[2] === 0x53 && b[3] === 0x4D && b[4] === 0x1A;
}

export function isNSFEFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 4 &&
    b[0] === 0x4E && b[1] === 0x53 && b[2] === 0x46 && b[3] === 0x45; // "NSFE"
}

export async function parseNSFFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  let title = '', artist = '', songs = 1, expansion = 0;

  if (isNSFFormat(buffer)) {
    title     = readStr(buf, 14, 34);
    artist    = readStr(buf, 48, 34);
    songs     = buf[6] || 1;
    expansion = buf[127];
  } else if (isNSFEFormat(buffer)) {
    // Chunk-based NSFE format
    const dv = new DataView(buffer);
    let off = 4;
    while (off + 8 <= buf.length) {
      const size = dv.getUint32(off, true);
      const id   = String.fromCharCode(buf[off+4], buf[off+5], buf[off+6], buf[off+7]);
      off += 8;
      if (id === 'INFO' && size >= 9) {
        songs     = buf[off + 6] || 1;
        expansion = buf[off + 8];
      } else if (id === 'auth' && size > 0) {
        // Null-separated strings: title, artist, copyright, ripper
        let s = off, field = 0;
        for (let i = off; i < off + size; i++) {
          if (buf[i] === 0 || i === off + size - 1) {
            const text = readStr(buf, s, i - s + 1);
            if (field === 0) title  = text;
            if (field === 1) artist = text;
            s = i + 1; field++;
          }
        }
      } else if (id === 'NEND') break;
      off += size;
    }
  } else {
    throw new Error('Not a valid NSF/NSFE file');
  }

  const instruments = buildNESInstruments(expansion);
  const numCh = Math.min(instruments.length, 8);
  const pattern = emptyPattern(numCh);

  return {
    name: (title || filename.replace(/\.nsfe?$/i, '')) + (artist ? ` — ${artist}` : ''),
    format: 'NSF' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 150,
  };
}
