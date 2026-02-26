/**
 * MartinWalkerParser.ts — Martin Walker music format detector/parser
 *
 * Detects modules composed with Martin Walker's Amiga music system (1990–94).
 * Common prefixes: avp.* (Avatar Productions), mw.*
 *
 * Detection logic ported from:
 *   uade-3.05/amigasrc/players/wanted_team/MartinWalker/src/Martin Walker.AMP.asm
 *   → EP_Check5 / DTP_Check2 routines (both files share the same algorithm)
 *
 * The format has five recognized variants:
 *   Format 1 (no SFX): file starts with 0x48E7FCFE (MOVEM.L opcode)
 *   Format 2 (SFX, original): file starts with 0x2F0841FA
 *   Format 3 (SFX, ripped with EagleRipper): 0x48E7FCFE at offset +28
 *   Format 4 (SFX, $6000 header): starts with word 0x6000, repeated 7–8 times
 *   Format 5 (SFX, variant): 0x2F0841FA at offset +28, scanned with step 2
 *
 * After locating the module body, all variants require:
 *   - opcode sequence 0xE9417000 followed by word 0x41FA at body+8
 *   - word 0x45FA at body+220 MUST be absent for format 1
 *   - word 0x45FA at body+220 (formats 2/3) or body+268 (formats 4/5) present
 *
 * Song name suffix: [Martin Walker]
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// Minimum plausible file size: need at least the header + body check areas.
// Format 1 checks offsets up to 160(body)+4 bytes; body is at offset 8+.
// Format 4 checks offsets up to 32+14+2+2 = 50+; with indirection up to ~300.
// Use 300 as a safe lower bound.
const MIN_FILE_SIZE = 300;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Safely read u16 at offset; returns 0 if out of bounds.
 */
function safeU16(buf: Uint8Array, off: number): number {
  if (off < 0 || off + 1 >= buf.length) return 0;
  return u16BE(buf, off);
}

/**
 * Safely read u32 at offset; returns 0 if out of bounds.
 */
function safeU32(buf: Uint8Array, off: number): number {
  if (off < 0 || off + 3 >= buf.length) return 0;
  return u32BE(buf, off);
}

/**
 * Check the inner loop condition (loop_1 in assembly).
 *
 * Assembly:
 *   loop_1:
 *     addq.l #4, A0
 *     cmp.l  #$E9417000, (A0)+   ; reads longword, A0 advances by 4
 *     bne.b  fail
 *     cmp.w  #$41FA, (A0)        ; check word at new A0 (after the +4 addq and 4-byte cmp advance)
 *     bne.b  fail
 *     cmp.l  140(A0), D1         ; D1 = 0x48E7FCFE
 *     beq.b  OK1
 *     cmp.l  156(A0), D1
 *     beq.b  OK1
 *     cmp.l  160(A0), D1
 *     bne.b  fail
 *   OK1:
 *     clr.w  (A2)  ; clear Format word
 *   OK:
 *     moveq  #0, D0   ; success
 *
 * The A0 passed here is the position BEFORE the addq.l #4 (i.e. at the `loop_1` label).
 * After `addq.l #4, A0`: A0 += 4.
 * `cmp.l #$E9417000, (A0)+`: reads 4 bytes at A0, then A0 += 4. So longword at A0+4.
 * `cmp.w #$41FA, (A0)`: word at A0+8 (A0 after both advances).
 * `cmp.l 140(A0), D1`: longword at A0+8+140 = A0+148.
 * etc.
 */
function checkInnerLoop(buf: Uint8Array, bodyOffset: number): boolean {
  const D1 = 0x48E7FCFE;
  // After addq.l #4: A0 = bodyOffset+4
  // cmp.l #$E9417000, (A0)+: longword at bodyOffset+4, A0 becomes bodyOffset+8
  if (safeU32(buf, bodyOffset + 4) !== 0xE9417000) return false;
  // cmp.w #$41FA, (A0): word at bodyOffset+8
  if (safeU16(buf, bodyOffset + 8) !== 0x41FA) return false;
  // A0 is now at bodyOffset+8
  // cmp.l 140(A0), D1: longword at bodyOffset+8+140 = bodyOffset+148
  // cmp.l 156(A0), D1: longword at bodyOffset+8+156 = bodyOffset+164
  // cmp.l 160(A0), D1: longword at bodyOffset+8+160 = bodyOffset+168
  const at140 = safeU32(buf, bodyOffset + 148);
  const at156 = safeU32(buf, bodyOffset + 164);
  const at160 = safeU32(buf, bodyOffset + 168);
  return at140 === D1 || at156 === D1 || at160 === D1;
}

export function isMartinWalkerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  const D1_MAGIC = 0x48E7FCFE;

  // ── Format 1: file starts with 0x48E7FCFE ─────────────────────────────
  if (safeU32(buf, 0) === D1_MAGIC) {
    // cmp.w #$45FA, 220(A0) — if present, this is NOT format 1 (fall through)
    if (safeU16(buf, 220) === 0x45FA) {
      // fall through to other formats
    } else {
      // loop_1 check: bodyOffset = 0 (before the addq.l #4)
      if (checkInnerLoop(buf, 0)) return true;
    }
  }

  // ── Format 2: file starts with 0x2F0841FA ─────────────────────────────
  if (safeU32(buf, 0) === 0x2F0841FA) {
    // addq.l #4, A0 → A0=4; add.w (A0), A0 → A0 = 4 + u16(buf,4)
    const rel2 = safeU16(buf, 4);
    const bodyAfterRel = 4 + rel2;
    // then fall into OK_3: moveq #28, D2; add.l D2, A0 → +28
    const bodyOffset = bodyAfterRel + 28;
    // cmp.w #$45FA, 220(A0)
    if (safeU16(buf, bodyOffset + 220) !== 0x45FA) return false;
    return checkInnerLoop(buf, bodyOffset);
  }

  // ── Format 3: 0x48E7FCFE at offset +28 (ripped with ER) ──────────────
  if (safeU32(buf, 28) === D1_MAGIC) {
    // OK_3: moveq #28, D2; add.l D2, A0 → body at +28
    const bodyOffset = 28;
    // cmp.w #$45FA, 220(A0)
    if (safeU16(buf, bodyOffset + 220) !== 0x45FA) return false;
    return checkInnerLoop(buf, bodyOffset);
  }

  // ── Format 4: starts with word 0x6000, repeated at offsets 0,4,8,…,28 ─
  if (safeU16(buf, 0) === 0x6000) {
    const D2 = 0x6000;
    // cmp.w 4(A0), D2 through cmp.w 28(A0), D2: seven more checks
    let ok4 = true;
    for (let i = 4; i <= 28; i += 4) {
      if (safeU16(buf, i) !== D2) { ok4 = false; break; }
    }
    if (ok4) {
      // Now check cmp.w 32(A0), D2:
      //   beq.b NextCheck → cmp.w 36(A0), D2; bne.b fail
      //   bne.b NextCheck (3rd format original) → skip directly to NextCheck
      const at32 = safeU16(buf, 32);
      if (at32 !== D2) {
        // 3rd format (with SFX) original ver. → goto NextCheck
      } else {
        // cmp.w 36(A0), D2: bne.b fail
        if (safeU16(buf, 36) !== D2) return false;
      }
      // NextCheck: addq.l #8, A0; addq.l #6, A0 → offset 14
      // move.l A0, A1; add.w (A0), A0
      const rel4a = safeU16(buf, 14);
      const bodyA = 14 + rel4a;
      // cmp.l (A0), D1: check for D1_MAGIC at bodyA
      if (safeU32(buf, bodyA) === D1_MAGIC) {
        // loop_2: cmp.w #$45FA, 268(A0)
        if (safeU16(buf, bodyA + 268) === 0x45FA) {
          return checkInnerLoop(buf, bodyA);
        }
        // cmp.w #$E942, 274(A0) — 4th format
        if (safeU16(buf, bodyA + 274) === 0xE942) {
          return checkInnerLoop(buf, bodyA);
        }
        return false;
      }
      // 5th format: addq.l #8, A1; addq.l #4, A1 → A1 = 14+12 = 26; add.w (A1), A1
      const rel4b = safeU16(buf, 26);
      const bodyB = 26 + rel4b;
      // cmp.l (A1)+, D1 → check D1_MAGIC at bodyB, A1 advances by 4
      if (safeU32(buf, bodyB) !== D1_MAGIC) return false;
      // cmp.w #$43FA, (A1) → word at bodyB+4
      if (safeU16(buf, bodyB + 4) !== 0x43FA) return false;
      // st (A2) + OK → success
      return true;
    }
  }

  // ── Format 5: scan for 0x2F0841FA at offset +28 (step 2, up to 5 tries) ─
  // CheckIt1: loop D2=4 (5 iterations), cmp.l #$2F0841FA, 28(A0); addq.l #2,A0
  for (let i = 0; i <= 4 * 2; i += 2) {
    if (safeU32(buf, i + 28) === 0x2F0841FA) {
      // OK_5: moveq #75, D2; scan for D1_MAGIC at A0 stepping by 2
      // CheckIt2: up to 76 iterations
      for (let j = 0; j <= 75 * 2; j += 2) {
        const scanOff = i + j;
        if (safeU32(buf, scanOff) === D1_MAGIC) {
          // loop_2: cmp.w #$45FA, 268(A0)
          if (safeU16(buf, scanOff + 268) === 0x45FA) {
            return checkInnerLoop(buf, scanOff);
          }
          // cmp.w #$E942, 274(A0)
          if (safeU16(buf, scanOff + 274) === 0xE942) {
            return checkInnerLoop(buf, scanOff);
          }
          return false;
        }
      }
    }
  }

  return false;
}

export function parseMartinWalkerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isMartinWalkerFormat(buf)) throw new Error('Not a Martin Walker module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^(avp|mw)\./i, '') || baseName;

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Sample 1', type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
      solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [Martin Walker]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
