/**
 * AlcatrazPackerParser.ts — Alcatraz Packer (ALP) Amiga music format native parser
 *
 * Alcatraz Packer is an Amiga music format by Alcatraz/NEO (c) 1995.
 * Files are prefixed with "ALP." (e.g. ALP.SomeSong).
 *
 * Detection (from EP_Check5 in Alcatraz_Packer.AMP.asm):
 *   buf[0..3] == 0x50416E10  ("PAn\x10")
 *   u32BE(buf, 4): total size D1 — must be non-zero and non-negative (bit 31 clear)
 *   Minimum file size: 8 bytes
 *
 * Metadata extraction (from DTP_InitPlayer):
 *   addq.l #8,A0  → A0 now points to offset 8
 *   move.w (A0),D3  → word at offset 8
 *   lsr.w #4,D3    → sample count = u16BE(buf, 8) >> 4  (max 31)
 *   move.w 2(A0),D1 → word at offset 10
 *   lsr.w #1,D1    → song length = u16BE(buf, 10) >> 1  (max 128)
 *
 * Single-file format: player code + music data in one binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/Alcatraz_Packer/Alcatraz_Packer.AMP.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to hold the ALP magic and the total-size word. */
const MIN_FILE_SIZE = 8;

/** Maximum sample (instrument) count reported by the player (MI_MaxSamples). */
const MAX_SAMPLES = 31;

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
 * Return true if the buffer is an Alcatraz Packer (ALP) module.
 *
 * Detection mirrors EP_Check5 from Alcatraz_Packer.AMP.asm:
 *   cmp.l #$50416E10,(A0)+  → buf[0..3] == 0x50416E10
 *   move.l (A0),D1          → u32BE(buf, 4)
 *   beq fail                → must be non-zero
 *   bmi fail                → must be non-negative (bit 31 clear)
 */
export function isAlcatrazPackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Magic: 0x50416E10 = bytes [0x50, 0x41, 0x6E, 0x10]
  if (buf[0] !== 0x50 || buf[1] !== 0x41 || buf[2] !== 0x6e || buf[3] !== 0x10) return false;

  // Total size at offset 4: must be non-zero and bit 31 must be clear (non-negative)
  const totalSize = u32BE(buf, 4);
  if (totalSize === 0) return false;
  if (totalSize & 0x80000000) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an Alcatraz Packer (ALP) module file into a TrackerSong.
 *
 * Extracts sample count and song length from the binary header.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseAlcatrazPackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isAlcatrazPackerFormat(buf)) {
    throw new Error('Not an Alcatraz Packer module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "ALP." prefix (case-insensitive) or ".alp" extension
  const moduleName =
    baseName.replace(/^alp\./i, '').replace(/\.alp$/i, '') || baseName;

  // ── Metadata extraction ───────────────────────────────────────────────────

  // From InitPlayer:
  //   addq.l #8,A0           → A0 at offset 8 (past magic + total-size longword)
  //   move.w (A0),D3         → word at offset 8
  //   lsr.w #4,D3            → sample count
  //   move.w 2(A0),D1        → word at offset 10
  //   lsr.w #1,D1            → song length
  let sampleCount = 0;
  let songLength = 1;

  if (buf.length >= MIN_FILE_SIZE + 4) {
    const rawSamples = u16BE(buf, 8) >> 4;
    if (rawSamples > 0) sampleCount = Math.min(rawSamples, MAX_SAMPLES);

    const rawLength = u16BE(buf, 10) >> 1;
    if (rawLength > 0) songLength = rawLength;
  }

  // ── Instrument placeholders ──────────────────────────────────────────────

  const instrumentCount = Math.max(sampleCount, 1);

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
      originalPatternCount: 1,
      originalInstrumentCount: sampleCount,
    },
  };

  // ── Song name ─────────────────────────────────────────────────────────────

  const nameParts: string[] = [`${moduleName} [Alcatraz Packer]`];
  if (sampleCount > 0) nameParts.push(`(${sampleCount} smp)`);

  return {
    name: nameParts.join(' '),
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
