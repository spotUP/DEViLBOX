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
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/MultiMedia_Sound/MultiMedia Sound_V1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Number of longwords checked at the start of the file. */
const NUM_LONGS = 31;

/** Maximum allowed value for each of the initial longwords. */
const MAX_LONG_VALUE = 0x20000;

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
 * This parser creates a metadata-only TrackerSong.
 * Actual audio playback is always delegated to UADE.
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

  // ── Instrument placeholder ────────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [
    {
      id: 1,
      name: 'Sample 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig,
  ];

  // ── Empty pattern (placeholder — UADE handles actual audio) ──────────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [MultiMedia Sound]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
