/**
 * QuartetParser.ts — Quartet / Quartet PSG / Quartet ST Amiga music format parser
 *
 * Quartet is a 4-channel Amiga tracker format originally authored by Dan Lennard
 * (Quartet/QPA, 1990) and Rob Povey & Steve Wetherill (Quartet ST/QTS and
 * Quartet PSG/SQT, 1989-90). All three share the same UADE player family but
 * have distinct binary layouts and detection signatures.
 *
 * File naming conventions (from eagleplayer.conf):
 *   qpa.<songname>  — Quartet (Amiga 4-channel PCM sampler)
 *   sqt.<songname>  — Quartet PSG (Atari ST YM-2149 PSG)
 *   qts.<songname>  — Quartet ST (Atari ST 4-channel sampler)
 *
 * ── Detection per variant (from UADE DTP_Check2 routines) ──────────────────
 *
 * Quartet (QPA)   — Quartet_v1.asm, Check2 (lines 299–335):
 *   byte[0]  = tempo, must be 1..30 (0x01..0x1E)
 *   byte[1]  = 0x50 (ASCII 'P')
 *   3000 % tempo == 0
 *   End-sentinel scan: scanning word-by-word backward from the (even-aligned)
 *   end of file, looking for the first 0xFFFF word. Once found, the two
 *   preceding longwords must also both be 0xFFFFFFFF.
 *
 * Quartet PSG (SQT) — Quartet PSG.asm, Check2 (lines 230–258):
 *   bytes[0..1] = 0x60 0x00 (BRA.W)
 *   Four consecutive BRA.W instructions with positive even displacements
 *   at offsets 0, 4, 8, 12. Then at offset 16, 0x49FA (LEA PC-relative).
 *   Jump through first BRA.W and check for 0x48E7FFFE (MOVEM.L) + 0x4DFA +
 *   0x51EE at +4 + 0x6100 at +8.
 *
 * Quartet ST (QTS)  — Quartet ST_v1.asm, Check2 (lines 331–361):
 *   word[0]   = speed, must be 1..16 (0x0001..0x0010)
 *   byte[7]   = 4
 *   byte[6]   ≤ 4
 *   dword[8]  = 0
 *   word[12]  may be 'WT' (optional extended header); else dword[12] = 0
 *   dword[24] ≤ 0x4C and dword[24] & 3 == 0
 *   word[16]  = 0x0056
 *
 * This parser extracts metadata only. Actual audio playback is delegated
 * entirely to UADE.
 *
 * References:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/Quartet/Quartet_v1.asm
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/Quartet_PSG/Quartet PSG.asm
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/QuartetST/Quartet ST_v1.asm
 *   Reference Code/uade-3.05/eagleplayer.conf  (prefix mappings)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Binary helpers ──────────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number {
  return buf[off] ?? 0;
}

function u16BE(buf: Uint8Array, off: number): number {
  return (((buf[off] ?? 0) << 8) | (buf[off + 1] ?? 0)) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    (((buf[off] ?? 0) << 24) |
      ((buf[off + 1] ?? 0) << 16) |
      ((buf[off + 2] ?? 0) << 8) |
      (buf[off + 3] ?? 0)) >>>
    0
  );
}

// ── Prefix helpers ──────────────────────────────────────────────────────────

type QuartetVariant = 'qpa' | 'sqt' | 'qts' | null;

/** Return the lowercase prefix (without dot) if the basename starts with one
 *  of the three Quartet prefixes, otherwise null. */
function detectPrefix(basename: string): QuartetVariant {
  const lower = basename.toLowerCase();
  if (lower.startsWith('qpa.')) return 'qpa';
  if (lower.startsWith('sqt.')) return 'sqt';
  if (lower.startsWith('qts.')) return 'qts';
  return null;
}

/** Strip the Quartet prefix from the basename to produce a human-readable song name. */
function stripPrefix(basename: string): string {
  return basename.replace(/^(qpa|sqt|qts)\./i, '') || basename;
}

// ── Per-variant binary detection ────────────────────────────────────────────

/**
 * Detect Quartet (QPA) format.
 *
 * From Quartet_v1.asm Check2:
 *   1. byte[1] == 0x50
 *   2. byte[0] in 1..30 (tempo)
 *   3. 3000 % tempo == 0
 *   4. End-of-file scan: walk word-by-word backward from the even-aligned
 *      file end. Find the first 0xFFFF word within 16 words. At that position
 *      the two preceding longwords (at -2 and -6 bytes relative to the scan
 *      pointer after stepping back one word) must also be 0xFFFFFFFF.
 *
 * Assembly reference (Check2, Quartet_v1.asm):
 *   cmp.b  #$50, 1(A0)      ; must be 0x50
 *   cmp.b  #30,  (A0)       ; must be ≤ 30
 *   move.b (A0), D1         ; D1 = tempo
 *   beq.b  Fault            ; zero → fault
 *   move.l #3000, D2
 *   divu.w D1, D2
 *   swap   D2
 *   tst.w  D2               ; remainder must be zero
 *   ...
 *   ; D2 = (file size, even-aligned), A0 advanced to end
 *   moveq  #15, D2          ; scan up to 16 words
 *   moveq  #-1, D3          ; 0xFFFF sentinel
 * NextEnd:
 *   move.w -(A0), D1
 *   beq.b  Zero             ; zero → skip
 *   cmp.w  D3, D1           ; 0xFFFF?
 *   beq.b  CheckEnd
 * Zero:
 *   dbf    D2, NextEnd
 *   bra.b  Fault            ; not found → fault
 * CheckEnd:
 *   cmp.l  -2(A0), D3       ; longword at -2 must be 0xFFFFFFFF
 *   bne.b  Fault
 *   cmp.l  -6(A0), D3       ; longword at -6 must be 0xFFFFFFFF
 *   bne.b  Fault
 */
function isQPAFormat(buf: Uint8Array): boolean {
  if (buf.length < 8) return false;

  // Check byte[1] == 0x50 ('P')
  if (u8(buf, 1) !== 0x50) return false;

  // Check tempo: byte[0] in 1..30
  const tempo = u8(buf, 0);
  if (tempo === 0 || tempo > 30) return false;

  // Check 3000 % tempo == 0
  if (3000 % tempo !== 0) return false;

  // End-of-file sentinel scan.
  // The player aligns down to even by clearing bit 0 of the size:
  //   move.l dtg_ChkSize(A5), D2
  //   bclr   #0, D2          ; round down to even
  //   add.l  D2, A0          ; A0 now points to even-aligned end
  //
  // Then it scans backward (move.w -(A0)) up to 16 words looking for 0xFFFF.
  // Once found at position ptr (after the -(A0) pre-decrement), it checks:
  //   cmp.l -2(A0), D3  →  longword at (ptr - 2) == 0xFFFFFFFF
  //   cmp.l -6(A0), D3  →  longword at (ptr - 6) == 0xFFFFFFFF
  // Since A0 was already decremented by 2 to read the 0xFFFF word, these
  // offsets are relative to the byte AFTER the 0xFFFF word that was read.
  // Concretely if the 0xFFFF word is at file offset W:
  //   A0 after -(A0) = W  (pointing at the start of the 0xFFFF word)
  //   -2(A0) → W - 2 → longword at W-2 must be 0xFFFFFFFF
  //   -6(A0) → W - 6 → longword at W-6 must be 0xFFFFFFFF

  const endEven = buf.length & ~1;         // even-aligned end offset
  const scanStart = endEven;               // start scanning from here (exclusive)
  const scanWords = 16;

  let found = false;
  for (let i = 0; i < scanWords; i++) {
    const wordOff = scanStart - 2 - i * 2; // ptr after -(A0) pre-decrement
    if (wordOff < 0) break;

    const w = u16BE(buf, wordOff);
    if (w === 0) continue;                 // zero: skip (dbf continues)
    if (w === 0xffff) {
      // CheckEnd: verify the two preceding longwords
      // -2(A0) → longword at wordOff - 2
      // -6(A0) → longword at wordOff - 6
      if (wordOff - 2 < 0 || wordOff - 6 < 0) break;
      const l1 = u32BE(buf, wordOff - 2);
      const l2 = u32BE(buf, wordOff - 6);
      if (l1 === 0xffffffff && l2 === 0xffffffff) {
        found = true;
      }
      break; // found or not, stop scanning (non-zero non-0xFFFF → Fault)
    }
    // Non-zero, non-0xFFFF word found → Fault
    break;
  }

  return found;
}

/**
 * Detect Quartet PSG (SQT) format.
 *
 * From Quartet PSG.asm Check2:
 *   Four BRA.W instructions (opcode 0x6000) at offsets 0, 4, 8, 12, each
 *   with a positive even displacement. Followed by 0x49FA (LEA PC-rel) at
 *   offset 16. Then the code follows the first BRA.W jump destination and
 *   checks for 0x48E7FFFE (MOVEM.L), 0x4DFA, 0x51EE at +4, 0x6100 at +8.
 *
 * Assembly reference (Check2, Quartet PSG.asm):
 *   moveq  #3, D1
 * GoodBra:
 *   cmp.w  #$6000, (A0)+   ; BRA.W opcode
 *   bne.b  Fault
 *   move.w (A0)+, D2       ; displacement
 *   bmi.b  Fault           ; must be ≥ 0
 *   beq.b  Fault           ; must be ≠ 0
 *   btst   #0, D2          ; must be even
 *   bne.b  Fault
 *   dbf    D1, GoodBra     ; 4 iterations total
 *   cmp.w  #$49FA, (A0)    ; LEA after the 4 BRA.Ws
 *   bne.b  Fault
 *   subq.l #6, A0          ; rewind to start of first BRA.W
 *   add.w  (A0), A0        ; follow displacement of first BRA.W
 *   cmp.l  #$48E7FFFE, (A0)+ ; MOVEM.L D0-D7/A0-A6,-(SP)
 *   bne.b  Fault
 *   cmp.w  #$4DFA, (A0)    ; LEA at dest
 *   bne.b  Fault
 *   cmp.w  #$51EE, 4(A0)   ; SUBQ at +4
 *   bne.b  Fault
 *   cmp.w  #$6100, 8(A0)   ; BSR at +8
 *   bne.b  Fault
 */
function isSQTFormat(buf: Uint8Array): boolean {
  if (buf.length < 24) return false;

  // Check four BRA.W instructions at offsets 0, 4, 8, 12
  let off = 0;
  for (let i = 0; i < 4; i++) {
    if (u16BE(buf, off) !== 0x6000) return false;
    const disp = u16BE(buf, off + 2);
    if (disp === 0) return false;          // zero displacement → Fault
    if (disp & 0x8000) return false;      // negative (bmi) → Fault
    if (disp & 0x0001) return false;      // odd (btst #0) → Fault
    off += 4;
  }

  // offset 16: check for 0x49FA (LEA PC-relative)
  if (u16BE(buf, 16) !== 0x49fa) return false;

  // Follow the first BRA.W:
  //   subq.l #6, A0  →  rewind from offset 16 back to offset 10... wait:
  //   after 4 × move.w (A0)+, A0 is at byte 16 (past the four 4-byte units).
  //   subq.l #6, A0  →  A0 = 10
  //   add.w (A0), A0 →  read word at offset 10 (the displacement of BRA.W at offset 8)
  //   Then A0 = 10 + displacement_at_10
  //   BUT: the BRA.W at offset 8 has its displacement at offset 10.
  //   The BRA.W destination = (PC after instruction) + disp = 12 + disp_at_10
  //
  // Wait, re-reading more carefully:
  //   GoodBra loop processes offsets [0,1,2,3], [4,5,6,7], [8,9,10,11], [12,13,14,15]
  //   After the loop A0 = 16.
  //   cmp.w #$49FA, (A0)  → offset 16 (already confirmed)
  //   subq.l #6, A0       → A0 = 10
  //   add.w (A0), A0      → read word at offset 10 (= displacement of BRA 3, at offset 8+2)
  //                         A0 = 10 + disp10
  // The first BRA.W's destination from the CPU perspective:
  //   PC_after_instr = 4, dest = 4 + disp_at_2
  // But the assembly does add.w (A0), A0 with A0=10, so dest_offset = 10 + disp_at_10.
  // disp_at_10 is buf[10..11].

  const disp10 = u16BE(buf, 10);           // displacement word at offset 10
  const dest = 10 + disp10;               // follow the jump
  if (dest + 10 > buf.length) return false;

  // At dest: check MOVEM.L D0-D7/A0-A6,-(SP) = 0x48E7FFFE
  if (u32BE(buf, dest) !== 0x48e7fffe) return false;

  // At dest+4: check 0x4DFA (LEA PC-relative)
  if (u16BE(buf, dest + 4) !== 0x4dfa) return false;

  // At dest+8: check 0x51EE (SUBQ.W)
  if (u16BE(buf, dest + 8) !== 0x51ee) return false;

  // At dest+12: check 0x6100 (BSR.W)
  if (dest + 12 + 2 > buf.length) return false;
  if (u16BE(buf, dest + 12) !== 0x6100) return false;

  return true;
}

/**
 * Detect Quartet ST (QTS) format.
 *
 * From Quartet ST_v1.asm Check2:
 *   word[0]   = speed, must be 1..16
 *   byte[7]   = 4  (exact)
 *   byte[6]   ≤ 4
 *   dword[8]  = 0
 *   word[12]  may be 'WT' (0x5754) — optional extended header flag
 *              otherwise dword[12] must be 0
 *   dword[24] ≤ 0x4C and dword[24] & 3 == 0
 *   word[16]  = 0x0056
 *
 * Assembly reference (Check2, Quartet ST_v1.asm):
 *   move.w (A0), D1      ; speed word
 *   beq.b  Fault         ; must be non-zero
 *   cmp.w  #$10, D1      ; must be ≤ 16
 *   bhi.b  Fault
 *   cmp.b  #4, 7(A0)     ; byte[7] must be exactly 4
 *   bne.b  Fault
 *   cmp.b  #4, 6(A0)     ; byte[6] must be ≤ 4
 *   bhi.b  Fault
 *   tst.l  8(A0)         ; dword[8] must be 0
 *   bne.b  Fault
 *   cmp.w  #'WT', 12(A0) ; optional 'WT' marker
 *   beq.b  Skippy
 * NoSpec:
 *   tst.l  12(A0)        ; if not 'WT', dword[12] must be 0
 *   bne.b  Fault
 * Skippy:
 *   cmp.l  #$4C, 24(A0)  ; dword[24] must be ≤ 0x4C
 *   bhi.b  Fault
 *   move.l 24(A0), D1
 *   and.w  #3, D1        ; must be divisible by 4
 *   bne.b  Fault
 *   cmp.w  #$0056, 16(A0); word[16] must be 0x0056
 *   bne.b  Fault  (labelled Oki on success)
 */
function isQTSFormat(buf: Uint8Array): boolean {
  if (buf.length < 28) return false;

  // word[0]: speed, 1..16
  const speed = u16BE(buf, 0);
  if (speed === 0 || speed > 0x10) return false;

  // byte[7] == 4
  if (u8(buf, 7) !== 4) return false;

  // byte[6] <= 4
  if (u8(buf, 6) > 4) return false;

  // dword[8] == 0
  if (u32BE(buf, 8) !== 0) return false;

  // word[12]: either 'WT' (0x5754) or dword[12] == 0
  const wt = u16BE(buf, 12);
  if (wt !== 0x5754) {
    // not 'WT' → dword[12] must be 0
    if (u32BE(buf, 12) !== 0) return false;
  }

  // dword[24] <= 0x4C and divisible by 4
  const d24 = u32BE(buf, 24);
  if (d24 > 0x4c) return false;
  if ((d24 & 3) !== 0) return false;

  // word[16] == 0x0056
  if (u16BE(buf, 16) !== 0x0056) return false;

  return true;
}

// ── Public detection API ────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Quartet, Quartet PSG, or Quartet ST module.
 *
 * Detection strategy:
 *   1. If a filename is provided, attempt prefix-based identification (qpa./sqt./qts.)
 *      and run only the matching binary check.
 *   2. If no filename is provided (or prefix is absent), try all three binary
 *      checks in order: QPA → SQT → QTS.
 *
 * @param buffer    Raw file bytes
 * @param filename  Optional original filename (used for prefix check)
 */
export function isQuartetFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  if (filename) {
    const basename = filename.split('/').pop() ?? filename;
    const prefix = detectPrefix(basename);
    if (prefix === 'qpa') return isQPAFormat(buf);
    if (prefix === 'sqt') return isSQTFormat(buf);
    if (prefix === 'qts') return isQTSFormat(buf);
    // No recognized prefix — fall through to brute-force detection
  }

  return isQPAFormat(buf) || isSQTFormat(buf) || isQTSFormat(buf);
}

// ── Internal variant resolver ───────────────────────────────────────────────

/** Determine which Quartet variant the buffer is. Returns null if none match. */
function resolveVariant(buf: Uint8Array, filename?: string): QuartetVariant {
  if (filename) {
    const basename = filename.split('/').pop() ?? filename;
    const prefix = detectPrefix(basename);
    if (prefix) return prefix;
  }
  if (isQPAFormat(buf)) return 'qpa';
  if (isSQTFormat(buf)) return 'sqt';
  if (isQTSFormat(buf)) return 'qts';
  return null;
}

// ── Placeholder pattern builder ─────────────────────────────────────────────

function buildEmptyPattern(filename: string, numInstruments: number) {
  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  return {
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
}

// ── Variant-specific metadata labels ───────────────────────────────────────

const VARIANT_LABEL: Record<NonNullable<QuartetVariant>, string> = {
  qpa: 'Quartet',
  sqt: 'Quartet PSG',
  qts: 'Quartet ST',
};

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Quartet (QPA/SQT/QTS) module file into a TrackerSong.
 *
 * Extracts tempo (for QPA variants) and creates 16 placeholder instruments
 * (matching the format's MI_MaxSamples=16 from the EaglePlayer header).
 * All actual audio playback is delegated to UADE.
 *
 * Instrument count by variant:
 *   QPA — 16 (MI_MaxSamples = 16 from NewModuleInfo in Quartet_v1.asm)
 *   SQT — no sample init in player (PSG synth only), so 0 instruments created
 *   QTS — 20 (MI_MaxSamples = 20 from NewModuleInfo in Quartet ST_v1.asm)
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive song name and variant)
 */
export async function parseQuartetFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  const basename = filename.split('/').pop() ?? filename;

  const variant = resolveVariant(buf, filename);
  if (variant === null) {
    throw new Error('Not a Quartet module');
  }

  // ── Song name ─────────────────────────────────────────────────────────────
  const moduleName = stripPrefix(basename);
  const label = VARIANT_LABEL[variant];

  // ── Tempo (QPA only) ─────────────────────────────────────────────────────
  // In QPA files byte[0] is the tempo (1..30). The player uses this to set
  // the interrupt period: higher tempo value = faster replay.
  // QTS has a speed word at word[0] (1..16) but uses it differently.
  // SQT embeds tempo inside the self-contained module executable.
  let tempoValue = 6; // sensible default (≈ 125 BPM equivalent in MOD terms)
  if (variant === 'qpa' && buf.length >= 1) {
    const qpaTempo = u8(buf, 0);
    if (qpaTempo >= 1 && qpaTempo <= 30) {
      // Convert: original player runs at 50 Hz VBL. At tempo T, a new note
      // fires every T vertical blanks. Effective BPM ≈ (50/T) × (pattern rows / 64).
      // We store the raw tempo as the initial speed for display purposes.
      tempoValue = qpaTempo;
    }
  } else if (variant === 'qts' && buf.length >= 2) {
    const qtsSpeed = u16BE(buf, 0);
    if (qtsSpeed >= 1 && qtsSpeed <= 16) {
      tempoValue = qtsSpeed;
    }
  }

  // ── Instrument count by variant ───────────────────────────────────────────
  // QPA: 16 PCM samples (MI_MaxSamples dc.l MI_MaxSamples,16 in Quartet_v1.asm)
  // SQT: PSG synthesizer, no PCM samples — no SampleInit routine in player
  // QTS: 20 PCM samples (MI_MaxSamples dc.l MI_MaxSamples,20 in Quartet ST_v1.asm)
  const numInstruments = variant === 'qpa' ? 16 : variant === 'qts' ? 20 : 0;

  // ── Placeholder instruments ───────────────────────────────────────────────
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

  // Ensure at least one placeholder so the song is never entirely empty
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'Channel 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Pattern placeholder ───────────────────────────────────────────────────
  const pattern = buildEmptyPattern(filename, numInstruments);

  return {
    name: `${moduleName} [${label}]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: tempoValue,
    initialBPM: 125,
    linearPeriods: false,
  };
}
