/**
 * KSSParser.ts — MSX KSS format parser
 *
 * Supports KSCC (standard) and KSSX (extended) formats.
 * Detects sound chips from device flags: AY-3-8910 (PSG, always present),
 * SCC (K051649, assumed present), OPLL (YM2413/FMPAC), SN76489,
 * and MSX-AUDIO (Y8950). Builds a TrackerSong with one instrument per
 * detected chip and one empty pattern covering all channels.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import type { InstrumentConfig, FurnaceConfig } from '@/types/instrument';
import { DEFAULT_FURNACE } from '@/types/instrument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(id: string, name: string, numCh: number, rows: number): Pattern {
  return {
    id, name, length: rows,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `CH ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

// ── KSS Header ────────────────────────────────────────────────────────────────

interface KSSHeader {
  magic: 'KSCC' | 'KSSX';
  loadAddress: number;
  loadSize: number;
  initAddress: number;
  playAddress: number;
  bankMode: number;
  extraHeaderSize: number;
  deviceFlags: number;
  // KSSX extended fields
  extraDataStart: number;
  extraDataSize: number;
}

function parseHeader(buf: Uint8Array, dv: DataView): KSSHeader {
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== 'KSCC' && magic !== 'KSSX') throw new Error('Not a valid KSS file');

  const header: KSSHeader = {
    magic: magic as 'KSCC' | 'KSSX',
    loadAddress:     dv.getUint16(4, true),
    loadSize:        dv.getUint16(6, true),
    initAddress:     dv.getUint16(8, true),
    playAddress:     dv.getUint16(10, true),
    bankMode:        buf[12],
    extraHeaderSize: buf[13],
    deviceFlags:     buf[14],
    extraDataStart:  0,
    extraDataSize:   0,
  };

  // KSSX extended header (16 extra bytes after byte 15)
  if (magic === 'KSSX' && buf.length >= 32) {
    header.extraDataStart = dv.getUint32(16, true);
    header.extraDataSize  = dv.getUint32(20, true);
  }

  return header;
}

// ── Chip Detection ────────────────────────────────────────────────────────────

interface KSSChips {
  ay8910:   boolean;  // AY-3-8910 PSG — always present
  scc:      boolean;  // K051649 SCC — assumed present in most KSS files
  opll:     boolean;  // YM2413 / FMPAC — bit 0 of device flags
  sn76489:  boolean;  // SN76489 — bit 1 of device flags
  y8950:    boolean;  // MSX-AUDIO (Y8950) — bit 3 of device flags
}

function detectChips(flags: number): KSSChips {
  return {
    ay8910:  true,
    scc:     true,
    opll:    (flags & 0x01) !== 0,
    sn76489: (flags & 0x02) !== 0,
    y8950:   (flags & 0x08) !== 0,
  };
}

// ── Instruments & Channel Layout ──────────────────────────────────────────────

interface InstrumentLayout {
  instruments: InstrumentConfig[];
  totalChannels: number;
}

function buildInstruments(chips: KSSChips): InstrumentLayout {
  const insts: InstrumentConfig[] = [];
  let id = 1;
  let totalChannels = 0;

  const add = (name: string, synthType: InstrumentConfig['synthType'], chipType: number, ops: number, channels: number) => {
    insts.push({
      id: id++, name, type: 'synth', synthType,
      furnace: { ...DEFAULT_FURNACE, chipType, ops } as FurnaceConfig,
      effects: [], volume: 0, pan: 0,
    });
    totalChannels += channels;
  };

  // AY-3-8910 PSG: 3 channels — always present
  if (chips.ay8910)  add('AY PSG',      'FurnaceAY',     6,  2, 3);

  // SCC (K051649): 5 wave channels
  if (chips.scc)     add('SCC Wave',    'FurnaceSCC',    53, 2, 5);

  // OPLL (YM2413/FMPAC): 9 FM channels
  if (chips.opll)    add('OPLL FM',     'FurnaceOPLL',   13, 2, 9);

  // SN76489: 4 channels (3 tone + 1 noise)
  if (chips.sn76489) add('SN PSG',      'FurnacePSG',     0, 2, 4);

  // Y8950 (MSX-AUDIO): 9 FM + 1 ADPCM = 10 channels
  if (chips.y8950)   add('MSX-AUDIO',   'FurnaceY8950',  14, 2, 10);

  // Fallback
  if (totalChannels === 0) {
    add('AY PSG', 'FurnaceAY', 6, 2, 3);
  }

  return { instruments: insts, totalChannels };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isKSSFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  if (b.length < 16) return false;
  // "KSCC" (0x4B 0x53 0x43 0x43) or "KSSX" (0x4B 0x53 0x53 0x58)
  if (b[0] !== 0x4B || b[1] !== 0x53) return false;
  return (b[2] === 0x43 && b[3] === 0x43) || (b[2] === 0x53 && b[3] === 0x58);
}

export function parseKSSFile(buffer: ArrayBuffer, filename?: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const dv  = new DataView(buffer);

  if (buf.length < 16) throw new Error('KSS file too small');

  const header = parseHeader(buf, dv);
  const chips  = detectChips(header.deviceFlags);
  const layout = buildInstruments(chips);

  const { instruments, totalChannels } = layout;
  const numCh   = Math.max(totalChannels, 1);
  const numRows = 64;
  const pattern = emptyPattern('p0', 'Pattern 0', numCh, numRows);

  // KSS has no embedded title — use filename
  const title = (filename || 'KSS File').replace(/\.kss$/i, '');

  return {
    name: title,
    format: 'KSS' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 125,
  };
}
