/**
 * DesireParser.ts — Desire Amiga music format (DSR.*) native parser
 *
 * Desire is an Amiga music format by Dentons, adapted for EaglePlayer by Wanted Team.
 * The module file is a compiled 68k executable containing both player code and music
 * data in a single self-contained file.
 *
 * Detection (from UADE Desire_v1.asm, DTP_Check2 routine):
 *   1. File size must be > 2500 bytes.
 *   2. Check 4 consecutive longs of 0x00010101 starting at offset 8, spaced 16 bytes
 *      apart: offsets 8, 24, 40, 56.
 *   3. Scan forward from offset 72 for up to 400 bytes looking for the word 0x49FA.
 *      When found, verify the following bytes:
 *        - skip 2 bytes (addq.l #2, A0 after cmp.w post-increment)
 *        - long at +0: 0x45F900DF
 *        - long at +4: 0xF000357C
 *        - long at +8: 0x00FF009E
 *        - word at +12: 0x41FA
 *        - word at +14: relative offset that, when added to the current position
 *          (A0 after the word read), makes A0 equal to the file base (A2=0).
 *          That means u16BE(buf, pos+14) interpreted as signed and added to
 *          (foundPos + 16) must equal 0.
 *
 * Single-file format: player code + music data + samples all in one binary blob.
 * This parser extracts metadata only; UADE handles actual audio playback.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/Desire/src/Desire_v1.asm
 * Reference parsers: DaveLoweParser.ts, JeroenTelParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum file size enforced by the Check2 routine (ble.b Return if <= 2500). */
const MIN_FILE_SIZE = 2501;

/** Number of sample placeholder instruments to create. */
const NUM_PLACEHOLDER_INSTRUMENTS = 8;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function s16BE(buf: Uint8Array, off: number): number {
  const v = (buf[off] << 8) | buf[off + 1];
  return v < 0x8000 ? v : v - 0x10000;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Desire format module.
 *
 * Mirrors the DTP_Check2 routine from Desire_v1.asm exactly:
 *
 *   1. File > 2500 bytes.
 *   2. Four longs of 0x00010101 at offsets 8, 24, 40, 56.
 *   3. Scan offset 72..471 for word 0x49FA; when found verify the magic sequence
 *      that follows, ending with a relative back-reference to the file base.
 */
export function isDesireFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Step 1 — minimum file size
  if (buf.length < MIN_FILE_SIZE) return false;

  // Step 2 — four longs of 0x00010101 at offsets 8, 24, 40, 56
  // Assembly: addq.l #8,A0; loop 4 times (D1=3,dbf): cmp.l #$00010101,(A0); lea 16(A0),A0
  for (let i = 0; i < 4; i++) {
    const off = 8 + i * 16;
    if (off + 3 >= buf.length) return false;
    if (u32BE(buf, off) !== 0x00010101) return false;
  }

  // After the loop A0 = 8 + 4*16 = 72; A1 = A0 + 400 = 472
  // Step 3 — scan [72..472) for word 0x49FA
  // Assembly: cmp.w #$49FA,(A0)+ — post-increments A0 by 2 on each iteration
  const scanStart = 72;
  const scanEnd = 472; // exclusive upper bound (A0 must be < A1=472 when checked)

  for (let pos = scanStart; pos < scanEnd; pos += 2) {
    if (pos + 1 >= buf.length) return false;
    if (u16BE(buf, pos) !== 0x49FA) continue;

    // Found 0x49FA at pos. Assembly then does:
    //   (A0)+ already consumed the word, so A0 = pos+2
    //   addq.l #2,A0  →  A0 = pos+4
    //   cmp.l #$45F900DF,(A0)+  →  check [pos+4..pos+7], A0 = pos+8
    //   cmp.l #$F000357C,(A0)+  →  check [pos+8..pos+11], A0 = pos+12
    //   cmp.l #$00FF009E,(A0)+  →  check [pos+12..pos+15], A0 = pos+16
    //   cmp.w #$41FA,(A0)+      →  check [pos+16..pos+17], A0 = pos+18
    //   add.w (A0),A0           →  A0 += s16(pos+18); A0 = pos+18 + s16(pos+18)
    //   cmp.l A0,A2             →  require A0 == A2 == file_base (absolute address 0 in our model)
    //
    // In our relative offset model (A2 = buf+0, all offsets relative to buf start):
    //   The final A0 value in absolute Amiga memory would be:
    //     fileBase + pos + 18 + s16(pos+18)  (the add.w uses the current word then A0 points past it)
    //   Wait — add.w (A0),A0 reads at A0=pos+18, adds to A0, giving pos+18+s16.
    //   Then cmp.l A0,A2: A0 must equal A2 = fileBase.
    //   So: fileBase + (pos+18) + s16(buf, pos+18) == fileBase
    //   →  (pos+18) + s16(buf, pos+18) == 0  (relative to file base)
    //   →  s16(buf, pos+18) == -(pos+18)

    if (pos + 19 >= buf.length) return false;

    if (u32BE(buf, pos + 4) !== 0x45F900DF) continue;
    if (u32BE(buf, pos + 8) !== 0xF000357C) continue;
    if (u32BE(buf, pos + 12) !== 0x00FF009E) continue;
    if (u16BE(buf, pos + 16) !== 0x41FA) continue;

    // Back-reference check: pos+18 + s16(buf, pos+18) == 0
    const rel = s16BE(buf, pos + 18);
    if ((pos + 18 + rel) !== 0) continue;

    // All checks passed
    return true;
  }

  return false;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Desire module file into a TrackerSong.
 *
 * The format is a compiled 68k executable; there is no public specification
 * of the internal layout beyond what the UADE EaglePlayer uses for detection.
 * This parser creates a metadata-only TrackerSong with placeholder instruments.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseDesireFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isDesireFormat(buf)) {
    throw new Error('Not a Desire module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "DSR." prefix (case-insensitive)
  const moduleName = baseName.replace(/^dsr\./i, '') || baseName;

  // ── Instrument placeholders ──────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < NUM_PLACEHOLDER_INSTRUMENTS; i++) {
    instruments.push({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

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
      originalInstrumentCount: NUM_PLACEHOLDER_INSTRUMENTS,
    },
  };

  return {
    name: `${moduleName} [Desire]`,
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
