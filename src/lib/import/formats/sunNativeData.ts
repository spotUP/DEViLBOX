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
import type { SunV13Score } from './SunTronicV13';
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
  };
}
