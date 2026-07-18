/**
 * sunNativeData.ts — SunTronicNativeData model + shared pool-decode helper
 *
 * This module owns:
 *   1. The SunTronicNativeData export shape (block pool + order list).
 *   2. decodeSunBlockPool — the ONE authoritative pool decode (transpose=0).
 *      Previously inlined in SunTronicParser.ts; now shared so both the layout
 *      builder and the native-data builder call the same function.
 *   3. buildSunTronicNativeData — assembles the model from a parsed score + pool.
 */

import type { TrackerCell } from '@/types';
import type { SunV13Score, SunCmdWidths } from './SunTronicV13';
import { decodeSunGroup } from './sunGroupCodec';

// ── Exported interfaces ──────────────────────────────────────────────────────

/** One order position: which pool block + transpose each of the 4 voices plays. */
export interface SunPosition {
  blockIndex: [number, number, number, number]; // pool block index per voice (-1 = empty/invalid)
  transpose: [number, number, number, number];  // signed semitones per voice
}

/** Export source-of-truth: the shared per-voice block pool + the order list. */
export interface SunTronicNativeData {
  /** Dedup'd block pool at raw pitch (transpose 0). Index === blockIndex. */
  blocks: TrackerCell[][];
  /** Song arrangement (subsong 0). */
  positions: SunPosition[];
  /** Command widths for this score — needed to re-decode a pool cell's sunRaw at
   *  a position transpose (reprojectSunGrid). Same object decodeSunBlockPool used. */
  widths: SunCmdWidths;
  /** Sampled-instrument count — the decodeSunGroup instrument-select boundary. */
  numSampled: number;
}

// ── Pool decode (single source of truth) ────────────────────────────────────

/**
 * Decode each track block at transpose=0 (raw pitch) so blockRows[i] is
 * independent of any position-level transpose. Concatenating sunRaw on each
 * cell reproduces the original block bytes exactly (pool byte-exact property).
 * Mirrors the Hively model (separate from the 4-ch grid walks, which bake
 * transpose for display).
 *
 * Previously inlined in parseSunTronicV13File (SunTronicParser.ts ~603-626).
 * Extracted here so layout builder and native-data builder share ONE decode.
 */
export function decodeSunBlockPool(score: SunV13Score): TrackerCell[][] {
  const widths = { arpShift: score.arpShift, volSlideRateFromStream: score.volSlideRateFromStream };
  const numSampled = score.sampledInstruments.length;

  return score.blocks.map((b) => {
    // Compute the exclusive block end for the over-read guard.
    // decodeSunBlock (SunTronicV13.ts:420-452) walks past sortedStarts[i+1] to
    // find the 0x00 terminator of the last group; b.byteSize therefore already
    // includes any terminator that overhangs into the next block's nominal start.
    // Use b.h1Offset + b.byteSize (the authoritative end measured by
    // decodeSunBlock), clamped to h1.length. This mirrors the sortedStarts[i+1]
    // computation at SunTronicV13.ts:974 in spirit — both bound the walk at the
    // true end of this block's content.
    const blockLimit = Math.min(b.h1Offset + b.byteSize, score.h1.length);

    const blockCells: TrackerCell[] = [];
    let pos = b.h1Offset;
    let curInstr = 0;
    for (let r = 0; r < b.rowCount; r++) {
      const decoded = decodeSunGroup(score.h1, pos, 0, curInstr, numSampled, widths, blockLimit);
      curInstr = decoded.curInstr;
      pos = decoded.nextPos;
      blockCells.push(decoded.cell);
    }
    return blockCells;
  });
}

/**
 * Map every pool group-start offset (hunk#1-relative) to the (blockIndex,
 * rowInBlock) pair that owns it. The pool blocks partition h1 on group
 * boundaries, so a display-grid cursor that flows past a short block into the
 * following blocks can resolve its TRUE owning block per row — which the naive
 * "r is a row index into the position's start block" assumption cannot.
 *
 * Mirrors decodeSunBlockPool's walk exactly (same widths, same blockLimit,
 * same group advance) so the offsets line up cell-for-cell with `blocks[bi][ri]`.
 * First writer wins: a terminator that overhangs from a previous block must not
 * overwrite the next block's genuine row-start.
 */
export function buildPoolRowIndex(
  score: SunV13Score,
): Map<number, { blockIndex: number; rowInBlock: number }> {
  const widths = { arpShift: score.arpShift, volSlideRateFromStream: score.volSlideRateFromStream };
  const numSampled = score.sampledInstruments.length;
  const map = new Map<number, { blockIndex: number; rowInBlock: number }>();

  score.blocks.forEach((b, blockIndex) => {
    const blockLimit = Math.min(b.h1Offset + b.byteSize, score.h1.length);
    let pos = b.h1Offset;
    let curInstr = 0;
    for (let rowInBlock = 0; rowInBlock < b.rowCount; rowInBlock++) {
      if (!map.has(pos)) map.set(pos, { blockIndex, rowInBlock });
      const decoded = decodeSunGroup(score.h1, pos, 0, curInstr, numSampled, widths, blockLimit);
      curInstr = decoded.curInstr;
      pos = decoded.nextPos;
    }
  });
  return map;
}

// ── Native data builder ──────────────────────────────────────────────────────

/**
 * Build the SunTronicNativeData model from a parsed score + pre-decoded pool.
 *
 * @param score   Parsed V1.3 score (from parseSunTronicV13Score).
 * @param blockRows  Transpose-0 pool (from decodeSunBlockPool).
 */
export function buildSunTronicNativeData(
  score: SunV13Score,
  blockRows: TrackerCell[][],
): SunTronicNativeData {
  const subsong0 = score.subsongs[0];
  const positions: SunPosition[] = subsong0
    ? subsong0.entries.map((e) => ({
        blockIndex: e.trackPtrs.map(
          (p) => score.blockIndexByOffset.get(p) ?? -1,
        ) as [number, number, number, number],
        transpose: [...e.transposes] as [number, number, number, number],
      }))
    : [];

  return {
    blocks: blockRows,
    positions,
    widths: { arpShift: score.arpShift, volSlideRateFromStream: score.volSlideRateFromStream },
    numSampled: score.sampledInstruments.length,
  };
}
