/**
 * MultiMediaSoundParser.ts — MultiMedia Sound Amiga music format native parser
 *
 * MultiMedia Sound (MMS) is an Amiga music format by Christian Haller and
 * Christian A. Weber (1991-93), adapted by Wanted Team.
 * Files are named with "MMS." or "SFX20." prefixes.
 *
 * Detection (from UADE MultiMedia Sound_V1.asm, DTP_Check2 routine):
 *   1. First 31 longwords (bytes 0..123): each must be even AND <= 0x20000
 *   2. buf[124..127] == 'SO31'  (0x53, 0x4F, 0x33, 0x31)
 *   3. u16BE(128) != 0          (channel/voice count must be non-zero)
 *
 * The assembly loops 31 times (moveq #30,D1; dbf D1,NextInfo), reading 4
 * bytes at a time and checking btst #0 (even) and cmp.l D3,D2 (bcs → > 0x20000 fails).
 *
 * File prefixes: "MMS." and "SFX20."
 *
 * Single-file format: music data binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/MultiMedia_Sound/MultiMedia Sound_V1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodeMmsCell, encodeMmsCell, MMS_CELL_SIZE } from '@/engine/uade/encoders/MultiMediaSoundEncoder';

// ── Constants ─────────────────────────────────────────────────────────────

/** Number of longwords checked at the start of the file. */
const NUM_LONGS = 31;

/** Maximum allowed value for each of the initial longwords. */
const MAX_LONG_VALUE = 0x20000;

const ORDER_LEN_OFFSET = 0x432;
const ORDER_OFFSET = 0x434;
const MAX_ORDER = 128;
const PATTERN_OFFSET = 0x4b8;
const ROWS = 64;
const CHANNELS = 4;
const PATTERN_SIZE = ROWS * CHANNELS * 4;

/** Minimum file size: 31*4 + 4 (SO31 magic) + 2 (non-zero word) = 130. */
const MIN_FILE_SIZE = 130;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a MultiMedia Sound module.
 *
 * Detection mirrors DTP_Check2 from MultiMedia Sound_V1.asm:
 *   moveq #30,D1 / moveq #2,D2 / swap D2 (D2 = 0x00020000)
 *   NextInfo:
 *     move.l (A0)+,D3 / btst #0,D3 (bne Fault) / cmp.l D3,D2 (bcs Fault) / dbf D1,NextInfo
 *   cmp.l #'SO31',(A0)+ / bne Fault
 *   tst.w (A0) / beq Fault
 */
export function isMultiMediaSoundFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Check first 31 longwords: each must be even AND <= 0x20000
  for (let i = 0; i < NUM_LONGS; i++) {
    const val = u32BE(buf, i * 4);
    if (val & 1) return false; // must be even
    if (val > MAX_LONG_VALUE) return false; // must be <= 0x20000
  }

  // buf[124..127] must be 'SO31'
  const magicOff = NUM_LONGS * 4; // = 124
  if (buf[magicOff] !== 0x53) return false; // 'S'
  if (buf[magicOff + 1] !== 0x4f) return false; // 'O'
  if (buf[magicOff + 2] !== 0x33) return false; // '3'
  if (buf[magicOff + 3] !== 0x31) return false; // '1'

  // u16BE(128) must be non-zero
  if (u16BE(buf, magicOff + 4) === 0) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a MultiMedia Sound module file into a TrackerSong.
 *
 * The grid is the real pattern data (MultiMedia Sound.AMP2.asm GetSongSize / CONVERTNOTE): order list at $434 (length
 * at $432), patterns of 64 rows x 4 channels x 4 bytes from $4B8, 1024 bytes each. Audio playback is delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseMultiMediaSoundFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isMultiMediaSoundFormat(buf)) {
    throw new Error('Not a MultiMedia Sound module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "MMS." or "SFX20." prefix (case-insensitive)
  const moduleName =
    baseName.replace(/^mms\./i, '').replace(/^sfx20\./i, '') || baseName;

  // ── Order list and patterns (GetSongSize: pattern count = highest order entry + 1) ──

  const orderLen = Math.min(buf[ORDER_LEN_OFFSET], MAX_ORDER);
  const order = Array.from(buf.subarray(ORDER_OFFSET, ORDER_OFFSET + orderLen));
  const wanted = (order.length > 0 ? Math.max(...order) : 0) + 1;
  const stored = Math.min(wanted, Math.max(0, Math.floor((buf.length - PATTERN_OFFSET) / PATTERN_SIZE)));

  // ── Instruments: one per non-empty sample slot (the first 31 longwords are the sample sizes) ──

  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < NUM_LONGS; i++) {
    instruments.push({
      id: i + 1,
      name: u32BE(buf, i * 4) > 0 ? `Sample ${i + 1}` : '',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  const patterns = Array.from({ length: Math.max(stored, 1) }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: ROWS,
    channels: Array.from({ length: CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: ROWS }, (_, r): TrackerCell => {
        if (p >= stored) return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } as TrackerCell;
        const off = PATTERN_OFFSET + p * PATTERN_SIZE + r * CHANNELS * MMS_CELL_SIZE + ch * MMS_CELL_SIZE;
        return decodeMmsCell(buf.subarray(off, off + MMS_CELL_SIZE));
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: CHANNELS,
      originalPatternCount: stored,
      originalInstrumentCount: instruments.length,
    },
  }));

  return {
    name: `${moduleName} [MultiMedia Sound]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: order.length > 0 ? order.map((n) => Math.min(n, patterns.length - 1)) : [0],
    songLength: Math.max(order.length, 1),
    restartPosition: 0,
    numChannels: CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'multiMediaSound',
      patternDataFileOffset: PATTERN_OFFSET,
      bytesPerCell: MMS_CELL_SIZE,
      rowsPerPattern: ROWS,
      numChannels: CHANNELS,
      numPatterns: stored,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMmsCell,
      decodeCell: decodeMmsCell,
    } satisfies UADEPatternLayout,
  };
}
