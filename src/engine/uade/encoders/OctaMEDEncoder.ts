/**
 * OctaMEDEncoder — Encodes TrackerCell back to OctaMED format.
 *
 * OctaMED uses the same cell encoding as MED (MMD0 and MMD1+ variants).
 * This module re-exports the MED encoder functions with OctaMED-specific
 * registration for format routing.
 *
 * MMD0 (3 bytes):
 *   byte[0]: instrHi[7:6] | noteIdx[5:0]
 *   byte[1]: instrLo[7:4] | command[3:0]
 *   byte[2]: param
 *
 * MMD1+ (4 bytes):
 *   byte[0]: note (0=none, 1-96)
 *   byte[1]: instrument (0-63)
 *   byte[2]: effect type
 *   byte[3]: effect parameter
 *
 * Reference: MEDEncoder.ts, MEDParser.ts (OctaMED format parser)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { encodeMED4Cell, encodeMED3Cell } from './MEDEncoder';

/**
 * Encode a TrackerCell to OctaMED MMD1+ binary (4 bytes).
 * Delegates to the shared MED encoder since the format is identical.
 */
export function encodeOctaMEDCell(cell: TrackerCell): Uint8Array {
  return encodeMED4Cell(cell);
}

/**
 * Encode a TrackerCell to OctaMED MMD0 binary (3 bytes).
 * Delegates to the shared MED encoder since the format is identical.
 */
export function encodeOctaMED3Cell(cell: TrackerCell): Uint8Array {
  return encodeMED3Cell(cell);
}

// Register under OctaMED-specific format IDs
registerPatternEncoder('octamed_mmd1', () => encodeOctaMEDCell);
registerPatternEncoder('octamed_mmd0', () => encodeOctaMED3Cell);
