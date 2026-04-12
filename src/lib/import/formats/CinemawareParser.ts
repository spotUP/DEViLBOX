/**
 * CinemawareParser.ts — Cinemaware Amiga music format native parser
 *
 * Cinemaware is an Amiga music format used in Cinemaware game titles.
 * Files are typically prefixed with "CIN." (e.g. "CIN.Wing Commander").
 *
 * Detection (from UADE Cinemaware.asm, DTP_Check2 routine):
 *   bytes[0..3] == 'IBLK'  (0x49, 0x42, 0x4C, 0x4B)
 *   byte[4] = sampleCount — must be >= 1 and <= 127 (0x80 or above is invalid)
 *   'ASEQ' (0x41, 0x53, 0x45, 0x51) must be found (on 2-byte boundaries) in the
 *   range [4 + sampleCount*138 + 18, 4 + sampleCount*138 + 18 + 256)
 *
 * Metadata extraction:
 *   Sample count read from byte[4].
 *   No subsong extraction; always returns 1 subsong.
 *
 * Single-file format: actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/Cinemaware/Cinemaware.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum plausible file size: header (5 bytes) + 1 sample entry (138 bytes) + 18 + 4 ('ASEQ'). */
const MIN_FILE_SIZE = 5 + 138 + 18 + 4;

/** Maximum instruments to create as placeholders. */
const MAX_INSTRUMENTS = 127;

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Cinemaware module.
 *
 * Detection mirrors DTP_Check2 from Cinemaware.asm:
 *   cmp.l  #'IBLK',(A1)+       → bytes[0..3] == 'IBLK'
 *   move.b (A1),D2              → sampleCount = buf[4]
 *   beq.b  fault                → sampleCount must be != 0
 *   cmp.b  #$80,D2 / bhi fault  → sampleCount must be <= 127 (0x80 and above invalid)
 *   mulu.w #138,D2              → compute block offset
 *   lea    18(A1),A1            → seek to ASEQ search start
 *   lea    256(A1),A2           → ASEQ search end
 *   FindAseq: search every 2 bytes for 'ASEQ'
 */
export function isCinemawareFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (buf.length < MIN_FILE_SIZE) return false;

  // Check 'IBLK' magic at bytes 0..3
  if (
    buf[0] !== 0x49 ||
    buf[1] !== 0x42 ||
    buf[2] !== 0x4c ||
    buf[3] !== 0x4b
  ) {
    return false;
  }

  // Sample count at byte 4: must be 1..127
  const sampleCount = buf[4];
  if (sampleCount === 0 || sampleCount >= 0x80) return false;

  // ASEQ search window: [searchStart, searchStart + 256)
  const searchStart = 4 + sampleCount * 138 + 18;
  const searchEnd = searchStart + 256;

  if (searchEnd > buf.length) return false;

  // Scan every 2 bytes for 'ASEQ' (0x41, 0x53, 0x45, 0x51)
  for (let off = searchStart; off < searchEnd; off += 2) {
    if (
      buf[off] === 0x41 &&
      buf[off + 1] === 0x53 &&
      buf[off + 2] === 0x45 &&
      buf[off + 3] === 0x51
    ) {
      return true;
    }
  }

  return false;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Cinemaware module file into a TrackerSong.
 *
 * Extracts sample count from the binary header.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseCinemawareFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isCinemawareFormat(buf)) {
    throw new Error('Not a Cinemaware module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "CIN." prefix (case-insensitive) or ".cin" extension
  const moduleName =
    baseName.replace(/^cin\./i, '').replace(/\.cin$/i, '') || baseName;

  // ── Metadata extraction ───────────────────────────────────────────────────

  const sampleCount = Math.min(buf[4], MAX_INSTRUMENTS);

  // ── Song name ─────────────────────────────────────────────────────────────

  const songName =
    sampleCount > 0
      ? `${moduleName} [Cinemaware](${sampleCount} smp)`
      : moduleName;

  // ── Instruments — names extracted from 138-byte group descriptors ──────
  // Each group at offset 5 + i*138 has 60 bytes of group data then 3 × 26B
  // sub-entries. Each sub-entry's first 6 bytes are an IFF filename (e.g.
  // "DRUM01") referencing a companion Instruments/*.iff file. Full PCM
  // extraction requires those companion files; here we at least surface
  // the real instrument names instead of "Sample N" placeholders.

  const instrumentLength = Math.max(sampleCount, 1);
  const instruments: InstrumentConfig[] = Array.from(
    { length: instrumentLength },
    (_, i) => {
      let name = `Sample ${i + 1}`;
      const groupOff = 5 + i * 138;
      const subEntryOff = groupOff + 60;
      if (subEntryOff + 6 <= buf.length) {
        const nameBytes = buf.slice(subEntryOff, subEntryOff + 6);
        const decoded = String.fromCharCode(...nameBytes).replace(/\0/g, '').trim();
        if (decoded.length > 0) name = decoded;
      }
      return {
        id: i + 1,
        name,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig;
    },
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

  return {
    name: songName,
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
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'cinemaware',
      patternDataFileOffset: 0,
      bytesPerCell: 4,
      rowsPerPattern: 64,
      numChannels: 4,
      numPatterns: 1,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMODCell,
      decodeCell: decodeMODCell,
    } as UADEPatternLayout,
  };
}
