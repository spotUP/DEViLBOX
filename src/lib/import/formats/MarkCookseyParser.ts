/**
 * MarkCookseyParser.ts — Mark Cooksey Amiga music format native parser
 *
 * Mark Cooksey composed music for many classic Amiga games including Commando,
 * Ghosts 'n Goblins, Forgotten Worlds, and Ghost 'n Goblins. The player was
 * written by Cooksey and Richard Frankish.
 *
 * The format comes in three sub-variants, distinguished by binary signatures:
 *
 *   Old format  (mco prefix / UADE: Mark_Cooksey_Old)
 *     - Starts with 0xD040D040 (ASR/LSR instructions), then 0x4EFB (JMP table)
 *     - Four 0x6000 BRA instructions at offsets 8, 12, 16, 20
 *     - Then either 0x43FA at offset 40, or a fifth BRA at 24 plus 0x43FA at 150
 *
 *   New/Medium format  (mc prefix / UADE: Mark_Cooksey)
 *     - Starts with 0x601A (BRA #26), followed by a u32 displacement D1
 *     - Five zero longwords at offsets 8–27
 *     - Four 0x6000 BRA instructions starting after the zero block
 *     - 0x48E780F0 (MOVEM.L) found at the destination of the first BRA
 *
 *   Rare v1.3 format  (mcr prefix / UADE: Mark_Cooksey with mcr prefix)
 *     - Two 0x6000 BRA instructions at the very start (bytes 0-3)
 *     - Followed by 0x4DFA (LEA d16,PC), skip 2, then 0x4A56 or 0x4A16 (TST)
 *     - Skip 6, then 0x41F9 (LEA abs.l) with 0xDFF000 (Amiga custom registers)
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * References:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/Mark_Cooksey_Don_Adan/
 *     Mark Cooksey_v2.asm  (DTP_Check2, EP_SampleInit, DTP_InitPlayer routines)
 *   Reference Code/uade-3.05/eagleplayer.conf
 *     Mark_Cooksey     prefixes=mc,mcr
 *     Mark_Cooksey_Old prefixes=mco
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Sub-variant detection ──────────────────────────────────────────────────

/**
 * Check for the Old format (mco prefix).
 *
 * Mirrors the DTP_Check2 first branch in Mark Cooksey_v2.asm:
 *   cmp.l #$D040D040,(A0)   ; ASR D0 / ASR D0 pattern
 *   cmp.w #$4EFB,4(A0)      ; JMP (d16,PC)
 *   cmp.w #$6000,8(A0)      ; four BRA instructions
 *   cmp.w #$6000,12(A0)
 *   cmp.w #$6000,16(A0)
 *   cmp.w #$6000,20(A0)
 *   THEN either 0x43FA at 40, or 0x6000 at 24 AND 0x43FA at 150
 */
function isOldFormat(buf: Uint8Array): boolean {
  if (buf.length < 160) return false;

  if (u32BE(buf, 0) !== 0xD040D040) return false;
  if (u16BE(buf, 4) !== 0x4EFB) return false;

  const BRA = 0x6000;
  if (u16BE(buf, 8) !== BRA) return false;
  if (u16BE(buf, 12) !== BRA) return false;
  if (u16BE(buf, 16) !== BRA) return false;
  if (u16BE(buf, 20) !== BRA) return false;

  // Either 0x43FA at offset 40 (short form)
  if (u16BE(buf, 40) === 0x43FA) return true;

  // Or fifth BRA at 24 plus 0x43FA at 150 (long form)
  if (u16BE(buf, 24) === BRA && u16BE(buf, 150) === 0x43FA) return true;

  return false;
}

/**
 * Check for the New/Medium format (mc prefix).
 *
 * Mirrors the DTP_Check2 NextCheck branch in Mark Cooksey_v2.asm:
 *   cmp.w #$601A,(A0)       ; BRA #26
 *   move.l 2(A0),D1         ; displacement value (must be even, positive)
 *   tst.w 6(A0)             ; must be zero
 *   Five zero longwords at offsets 8, 12, 16, 20, 24 (dbf D2,ZeroCheck with D2=4)
 *   Four BRA instructions at words following the zero block (dbf D2,BranchCheck D2=3)
 *   cmp.l #$48E780F0,(A2)   ; MOVEM.L at BRA destination
 */
function isNewFormat(buf: Uint8Array): boolean {
  if (buf.length < 60) return false;

  if (u16BE(buf, 0) !== 0x601A) return false;

  // D1 = u32 at offset 2: must be positive and even
  const d1 = u32BE(buf, 2);
  if (d1 === 0 || (d1 & 0x80000000) !== 0) return false; // must be positive
  if ((d1 & 1) !== 0) return false;                        // must be even

  // word at offset 6 must be zero
  if (u16BE(buf, 6) !== 0x0000) return false;

  // Five zero longwords at offsets 8–27 (the ZeroCheck loop runs D2=4 → 5 iterations)
  for (let i = 0; i < 5; i++) {
    if (u32BE(buf, 8 + i * 4) !== 0x00000000) return false;
  }

  // After the zero block: four 0x6000 BRA instructions (BranchCheck, D2=3 → 4 iterations)
  // Each BRA is: opcode (0x6000) + even non-negative displacement
  const braStart = 28; // offset 8 + 5*4 = 28
  for (let i = 0; i < 4; i++) {
    if (buf.length < braStart + i * 4 + 4) return false;
    if (u16BE(buf, braStart + i * 4) !== 0x6000) return false;
    const disp = u16BE(buf, braStart + i * 4 + 2);
    if ((disp & 0x8000) !== 0) return false; // must be non-negative
    if ((disp & 1) !== 0) return false;       // must be even
  }

  // Check 0x48E780F0 at the BRA destination of the first BRA after zero block.
  // In the ASM: "lea 2(A0),A2" then "add.w (A2),A2" — A0 points to braStart,
  // A2 = braStart+2, then A2 += word at braStart+0 (the first BRA opword was at braStart,
  // displacement at braStart+2).
  // Actually in the ASM after BranchCheck loop: "add.w (A2),A2" where A2 was set to
  // "lea 2(A1),A2" (A1 pointing at word after the zero block = braStart).
  // A2 = braStart + 2, then add displacement word at A2 to A2.
  const a2base = braStart + 2;            // points at the displacement word of first BRA
  const firstDisp = u16BE(buf, a2base);   // displacement value
  const dest = a2base + firstDisp;        // destination address
  if (dest + 4 > buf.length) return false;
  if (u32BE(buf, dest) !== 0x48E780F0) return false;

  return true;
}

/**
 * Check for the Rare v1.3 format (mcr prefix).
 *
 * Mirrors the DTP_Check2 Third branch in Mark Cooksey_v2.asm:
 *   Two 0x6000 BRA instructions at the start (BranchCheck2, D2=1 → 2 iterations)
 *   cmp.w #$4DFA,(A0)       ; LEA d16(PC)
 *   addq.l #2,A0            ; skip 2 bytes
 *   cmp.w #$4A56,(A0) OR cmp.w #$4A16,(A0)  ; TST.W or TST.B
 *   addq.l #6,A0            ; skip 6 bytes
 *   cmp.w #$41F9,(A0)       ; LEA abs.l
 *   cmp.l #$DFF000,(A0)     ; Amiga custom chip registers base address
 */
function isRareFormat(buf: Uint8Array): boolean {
  if (buf.length < 24) return false;

  // Two BRA instructions at offsets 0 and 4 (each 4 bytes: opcode + displacement)
  if (u16BE(buf, 0) !== 0x6000) return false;
  const disp0 = u16BE(buf, 2);
  if ((disp0 & 0x8000) !== 0) return false; // non-negative
  if ((disp0 & 1) !== 0) return false;       // even

  if (u16BE(buf, 4) !== 0x6000) return false;
  const disp1 = u16BE(buf, 6);
  if ((disp1 & 0x8000) !== 0) return false;
  if ((disp1 & 1) !== 0) return false;

  // After two BRAs (8 bytes consumed), look for 0x4DFA
  let pos = 8;
  if (u16BE(buf, pos) !== 0x4DFA) return false;
  pos += 2; // skip 4DFA opcode
  pos += 2; // skip the displacement operand (addq.l #2,A0 in the check)

  // At pos: 0x4A56 (TST.W d16(A6)) or 0x4A16 (TST.B d8(A6))
  if (pos + 2 > buf.length) return false;
  const tst = u16BE(buf, pos);
  if (tst !== 0x4A56 && tst !== 0x4A16) return false;
  pos += 6; // skip the TST instruction + operand (addq.l #6,A0 in the check)

  // At pos: 0x41F9 (LEA abs.l) followed by 0x00DFF000
  if (pos + 6 > buf.length) return false;
  if (u16BE(buf, pos) !== 0x41F9) return false;
  pos += 2;
  if (u32BE(buf, pos) !== 0x00DFF000) return false;

  return true;
}

// ── Format variant labels ──────────────────────────────────────────────────

type MarkCookseyVariant = 'old' | 'new' | 'rare';

function detectVariant(buf: Uint8Array): MarkCookseyVariant | null {
  if (isOldFormat(buf)) return 'old';
  if (isNewFormat(buf)) return 'new';
  if (isRareFormat(buf)) return 'rare';
  return null;
}

// ── Public format detection ────────────────────────────────────────────────

/**
 * Return true if the buffer is a Mark Cooksey format module.
 *
 * Two checks are performed:
 *   1. Filename prefix: mc., mcr., or mco. (case-insensitive) at start of basename.
 *   2. Binary signature: one of the three sub-variant patterns.
 *
 * The prefix check is intentionally lenient (accepts any capitalisation) to
 * match how UADE eagleplayer.conf defines prefixes=mc,mcr for Mark_Cooksey
 * and prefixes=mco for Mark_Cooksey_Old.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (used for prefix check)
 */
export function isMarkCookseyFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);
  if (buf.length < 24) return false;

  // Prefix check (optional but strongly recommended guard against false positives)
  if (filename !== undefined) {
    const baseName = filename.split('/').pop()?.split('\\').pop() ?? filename;
    if (!/^mc[ro]?\./i.test(baseName) && !/^mco\./i.test(baseName)) {
      return false;
    }
  }

  return detectVariant(buf) !== null;
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Mark Cooksey module file into a TrackerSong.
 *
 * Mark Cooksey modules are compiled 68k Amiga executables combining the player
 * code with music and sample data. There is no public specification of the
 * internal layout beyond what the EaglePlayer detection code reveals.
 *
 * This parser therefore creates a metadata-only TrackerSong with up to 64
 * placeholder instruments (the format's documented maximum sample count).
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name and variant)
 */
export async function parseMarkCookseyFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  const variant = detectVariant(buf);

  if (variant === null) {
    throw new Error('Not a Mark Cooksey module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop()?.split('\\').pop() ?? filename;
  // Strip mc., mcr., mco. prefix (case-insensitive)
  const moduleName = baseName.replace(/^mc[or]?\./i, '') || baseName;

  // ── Variant label ─────────────────────────────────────────────────────────

  const variantLabel =
    variant === 'old'  ? 'Old (mco)'   :
    variant === 'rare' ? 'Rare (mcr)'  :
                         'New (mc)';

  // ── Instrument placeholders ──────────────────────────────────────────────
  //
  // The format supports up to 64 samples. The exact count requires emulating
  // the 68k InitPlayer routine to walk internal data structures, which is
  // outside the scope of a metadata-only parser. We create 64 placeholders
  // to ensure the TrackerSong can represent any module in the format family.
  //
  // Reference: Mark Cooksey_v2.asm EP_SampleInit, which iterates D5 = Samples - 1
  // where Samples is populated by InitPlayer scanning the binary.

  const NUM_PLACEHOLDER_INSTRUMENTS = 64;
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
      pan: (ch === 0 || ch === 3) ? -50 : 50,
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
    name: `${moduleName} [Mark Cooksey ${variantLabel}]`,
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
