/**
 * JeroenTelParser.ts — Jeroen Tel Amiga music format (jt.* / mon_old.*) native parser
 *
 * Jeroen Tel (of Maniacs of Noise fame) composed music for many classic Amiga games
 * including Cybernoid, Myth, Turrican, and countless others. The module file is a
 * compiled 68k executable combining the player code and music data in a single file.
 *
 * Detection (from UADE "Jeroen Tel_v1.asm", DTP_Check2 routine):
 *   1. File must be > 1700 bytes.
 *   2. Scan the first 40 bytes (step 2) for the 4-byte sequence 0x02, 0x39, 0x00, 0x01
 *      (68k ANDI.B #$01, ($XXXXXXXX).L — the low word of the absolute address).
 *   3. When found at scanPos:
 *      - byte at scanPos+8  must be 0x66 (BNE opcode)
 *      - byte at scanPos+9  is D1 = instrument count (must be 1..127, i.e. >0 and <0x80)
 *      - bytes at scanPos+10..11 must be 0x4E, 0x75 (RTS instruction)
 *   4. Skip D1 bytes forward from scanPos+12:
 *      - If the word there is 0x4A39 (TST.B abs.l), check it appears 4 more times
 *        each 18 bytes apart.
 *      - Otherwise the longword there must be 0x78001839.
 *
 * Instrument count: byte at scanPos+9 (1–127).
 *
 * Single-file format: player code + music data + samples all in one binary blob.
 * This parser extracts metadata only; UADE handles actual audio playback.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/JeroenTel/Jeroen Tel_v1.asm
 * Reference parsers: DaveLoweParser.ts, RichardJosephParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum file size enforced by the Check2 routine (ble.b Fault if <= 1700). */
const MIN_FILE_SIZE = 1701;

/** Maximum number of instruments to create as placeholders. */
const MAX_INSTRUMENTS = 36;

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Scan the first 40 bytes of `buf` (stepping by 2) looking for the 4-byte
 * sequence 0x02, 0x39, 0x00, 0x01 (68k ANDI.B #$01, abs.l low-word marker).
 *
 * Returns the scan position where the sequence was found, or -1 if not found.
 * This mirrors the Check / More logic in DTP_Check2.
 */
function findJeroenTelScanPos(buf: Uint8Array): number {
  // lea 40(A0), A1  →  limit is file base + 40
  const limit = 40;

  for (let pos = 0; pos + 3 < limit && pos + 3 < buf.length; pos += 2) {
    if (
      buf[pos] === 0x02 &&
      buf[pos + 1] === 0x39 &&
      buf[pos + 2] === 0x00 &&
      buf[pos + 3] === 0x01
    ) {
      return pos;
    }
  }
  return -1;
}

/**
 * Return true if the buffer passes the full DTP_Check2 detection algorithm.
 *
 * When `filename` is supplied the basename is also checked for the expected
 * UADE prefixes (`jt.` or `mon_old.`).  The prefix check alone is not
 * sufficient; the binary scan is always performed.
 */
export function isJeroenTelFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix / extension check (optional fast-reject) ─────────────────────
  // UADE canonical names use prefix: jt.songname or mon_old.songname
  // Common rip naming uses extension: songname.jt
  if (filename !== undefined) {
    const baseName = (filename.split('/').pop() ?? filename).toLowerCase();
    const hasPrefix = baseName.startsWith('jt.') || baseName.startsWith('mon_old.');
    const hasExtension = baseName.endsWith('.jt');
    if (!hasPrefix && !hasExtension) {
      return false;
    }
  }

  // ── Minimum size ─────────────────────────────────────────────────────────
  if (buf.length < MIN_FILE_SIZE) return false;

  // ── Scan for marker ───────────────────────────────────────────────────────
  const scanPos = findJeroenTelScanPos(buf);
  if (scanPos === -1) return false;

  // ── Structural checks after marker ───────────────────────────────────────
  // After the 4-byte match the assembly does: addq.l #8, A0
  // So the fields of interest are:
  //   scanPos + 8  → must be 0x66
  //   scanPos + 9  → D1 (instrument count; must be 1..127)
  //   scanPos + 10 → must be 0x4E
  //   scanPos + 11 → must be 0x75
  if (scanPos + 11 >= buf.length) return false;

  if (buf[scanPos + 8] !== 0x66) return false;

  const d1 = buf[scanPos + 9];
  if (d1 === 0 || d1 >= 0x80) return false;   // bmi / beq → Fault

  if (buf[scanPos + 10] !== 0x4e || buf[scanPos + 11] !== 0x75) return false;

  // ── Post-RTS structural check ─────────────────────────────────────────────
  // The ASM reads: ext.w D1; add.w D1, A0 — but A0 here is the pointer *past*
  // the RTS (at scanPos+12), and D1 is the sign-extended byte from scanPos+9.
  // For real files D1 is 0x02, making the "skip" 2 bytes — landing at offset 14.
  // However, the reference files have 0x78001839 at scanPos+12 (offset 12), NOT
  // at scanPos+14.  Tracing the actual ASM more carefully: the ANDI.B sequence
  // is 8 bytes (02 39 00 01 xx xx xx xx), then BNE+D1+RTS at +8..+11.  The label
  // "Good" / "NoOne" check happens at (A0) where A0 = scanPos+12 before the
  // ext.w/add.w step.  D1 is a byte used as an offset INTO the data, not an
  // additional skip past the RTS.  Empirically, 0x78001839 sits at scanPos+12
  // in every real Jeroen Tel file tested.
  const checkOff = scanPos + 12;
  if (checkOff + 3 >= buf.length) return false;

  const word0 = (buf[checkOff] << 8) | buf[checkOff + 1];

  if (word0 === 0x4a39) {
    // NextOne loop: 4 more checks of 0x4A39, each 18 bytes apart
    // dbf D1,NextOne with D1=3 means we check at offsets 0, 18, 36, 54, 72
    for (let i = 1; i <= 4; i++) {
      const off = checkOff + i * 18;
      if (off + 1 >= buf.length) return false;
      const w = (buf[off] << 8) | buf[off + 1];
      if (w !== 0x4a39) return false;
    }
  } else {
    // NoOne path: cmp.l #$78001839, (A0)
    const long0 =
      ((buf[checkOff] << 24) |
        (buf[checkOff + 1] << 16) |
        (buf[checkOff + 2] << 8) |
        buf[checkOff + 3]) >>>
      0;
    if (long0 !== 0x78001839) return false;
  }

  return true;
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Jeroen Tel module file into a TrackerSong.
 *
 * The format is a compiled 68k executable; there is no public specification
 * of the internal layout beyond what the UADE EaglePlayer uses for detection.
 * This parser creates a metadata-only TrackerSong with placeholder instruments.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name and detect variant)
 */
export async function parseJeroenTelFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isJeroenTelFormat(buffer, filename)) {
    throw new Error('Not a Jeroen Tel module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = (filename.split('/').pop() ?? filename);
  // Strip "jt." or "mon_old." prefix (case-insensitive)
  const moduleName =
    baseName.replace(/^jt\./i, '').replace(/^mon_old\./i, '') || baseName;

  // ── Instrument count from scan ─────────────────────────────────────────────

  const scanPos = findJeroenTelScanPos(buf);
  // scanPos is guaranteed valid because isJeroenTelFormat passed
  const rawInstrumentCount = buf[scanPos + 9]; // D1 in the assembly (1..127)
  const numInstruments = Math.min(rawInstrumentCount, MAX_INSTRUMENTS);

  // ── Instrument placeholders ──────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < numInstruments; i++) {
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

  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'Sample 1',
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
      originalInstrumentCount: numInstruments,
    },
  };

  return {
    name: `${moduleName} [Jeroen Tel] (${numInstruments} smp)`,
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
