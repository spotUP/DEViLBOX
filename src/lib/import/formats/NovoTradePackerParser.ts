/**
 * NovoTradePackerParser.ts — NovoTrade Packer Amiga music format native parser
 *
 * NovoTrade Packer is an Amiga music format originally used in Castlevania (1990)
 * by NovoTrade/Konami, later adapted by Wanted Team for EaglePlayer/DeliTracker.
 * Files are conventionally prefixed with "NTP." (e.g. NTP.SomeSong).
 *
 * Detection (from DTP_Check2 routine in NovoTrade Packer_v1.asm):
 *   bytes[0..3]          == 'MODU' (0x4D, 0x4F, 0x44, 0x55)
 *   u16BE(buf, 16) = D1  > 0, even (bit 0 == 0), non-negative (bit 15 == 0)
 *   u16BE(buf, 24) = D2  > 0, even (bit 0 == 0), non-negative (bit 15 == 0)
 *   bytes[4 + D1..4 + D1 + 3]           == 'BODY' (0x42, 0x4F, 0x44, 0x59)
 *   bytes[4 + D1 + D2..4 + D1 + D2 + 3] == 'SAMP' (0x53, 0x41, 0x4D, 0x50)
 *   file length >= 32 bytes
 *
 * Metadata (from DTP_InitPlayer routine):
 *   u16BE(buf, 22) = sample count
 *   u16BE(buf, 24) = song length
 *   u16BE(buf, 26) = pattern count
 *
 * Single-file format: player code + music data in one binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/NovoTradePacker/src/NovoTrade Packer_v1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to safely read the initial header fields. */
const MIN_FILE_SIZE = 32;

/** Maximum instruments to create as placeholders. */
const MAX_INSTRUMENTS = 64;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) & 0xffff;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a NovoTrade Packer module.
 *
 * Detection mirrors DTP_Check2 from NovoTrade Packer_v1.asm:
 *   1. bytes[0..3] == 'MODU'
 *   2. u16BE(buf, 16): D1 must be > 0, even, and non-negative (bit 15 clear)
 *   3. u16BE(buf, 24): D2 must be > 0, even, and non-negative (bit 15 clear)
 *   4. bytes at offset (4 + D1) == 'BODY'
 *   5. bytes at offset (4 + D1 + D2) == 'SAMP'
 *   6. file must be >= 32 bytes
 */
export function isNovoTradePackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (buf.length < MIN_FILE_SIZE) return false;

  // Check 'MODU' magic at offset 0
  if (
    buf[0] !== 0x4d ||
    buf[1] !== 0x4f ||
    buf[2] !== 0x44 ||
    buf[3] !== 0x55
  ) {
    return false;
  }

  // D1 = u16BE(buf, 16): header size — must be > 0, even, and non-negative
  const d1 = u16BE(buf, 16);
  if (d1 === 0) return false;
  if (d1 & 0x8000) return false; // bit 15 set → negative (bmi.b Fault)
  if (d1 & 0x0001) return false; // bit 0 set → odd (btst #0,D1 / bne.b Fault)

  // D2 = u16BE(buf, 24): body size — must be > 0, even, and non-negative
  const d2 = u16BE(buf, 24);
  if (d2 === 0) return false;
  if (d2 & 0x8000) return false; // bit 15 set → negative
  if (d2 & 0x0001) return false; // bit 0 set → odd

  // Check 'BODY' marker at offset (4 + D1)
  const bodyOffset = 4 + d1;
  if (bodyOffset + 4 > buf.length) return false;
  if (
    buf[bodyOffset] !== 0x42 ||
    buf[bodyOffset + 1] !== 0x4f ||
    buf[bodyOffset + 2] !== 0x44 ||
    buf[bodyOffset + 3] !== 0x59
  ) {
    return false;
  }

  // Check 'SAMP' marker at offset (4 + D1 + D2)
  const sampOffset = 4 + d1 + d2;
  if (sampOffset + 4 > buf.length) return false;
  if (
    buf[sampOffset] !== 0x53 ||
    buf[sampOffset + 1] !== 0x41 ||
    buf[sampOffset + 2] !== 0x4d ||
    buf[sampOffset + 3] !== 0x50
  ) {
    return false;
  }

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a NovoTrade Packer module file into a TrackerSong.
 *
 * Extracts sample count, song length, and pattern count from the binary header.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseNovoTradePackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isNovoTradePackerFormat(buf)) {
    throw new Error('Not a NovoTrade Packer module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "NTP." prefix (case-insensitive) or ".ntp" extension
  const moduleName =
    baseName.replace(/^ntp\./i, '').replace(/\.ntp$/i, '') || baseName;

  // ── Metadata extraction ───────────────────────────────────────────────────

  // From InitPlayer (DTP_InitPlayer in the assembly):
  //   u16BE(buf, 22) = sample count  (move.w 22(A0),D2 → Samples)
  //   u16BE(buf, 24) = song length   (move.w 24(A0),... → Length+2)
  //   u16BE(buf, 26) = pattern count (move.w 26(A0),... → Patterns+2)
  let sampleCount = 0;
  let songLength = 0;
  let patternCount = 0;

  if (buf.length >= MIN_FILE_SIZE) {
    sampleCount = u16BE(buf, 22);
    songLength = u16BE(buf, 24);
    patternCount = u16BE(buf, 26);
  }

  // ── Instrument placeholders ───────────────────────────────────────────────

  const instrumentCount = Math.min(Math.max(sampleCount, 1), MAX_INSTRUMENTS);

  const instruments: InstrumentConfig[] = Array.from(
    { length: instrumentCount },
    (_, i) =>
      ({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      }) as InstrumentConfig,
  );

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
      originalPatternCount: patternCount,
      originalInstrumentCount: sampleCount,
    },
  };

  // ── Song name ─────────────────────────────────────────────────────────────

  const nameParts: string[] = [`${moduleName} [NovoTrade]`];
  if (patternCount > 0) nameParts.push(`(${patternCount} patt)`);

  return {
    name: nameParts.join(' '),
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: songLength || 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
