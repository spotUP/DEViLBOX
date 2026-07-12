/**
 * Regression: Steve Turner (.jpo) pattern data is a set of variable-length
 * command BLOCKS addressed via the OFFTBL (pattern index → signed offset).
 * Blocks are shared across channels/positions, so the parser previously used
 * placeholder addresses + fabricated sizes and the harness measured 0.0000.
 *
 * Fixed with the structural raw-block carrier: each DISTINCT block (deduped by
 * its REAL file offset, sized by scanning to its terminator) carries its
 * original bytes + decoded baseline rows, re-emitted verbatim when unedited
 * (byte-exact) and re-packed on edit. See variableBlockCarrier.testkit.ts for
 * the asserted invariants; on revert of the carrier assertion 1 fails.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseSteveTurnerFile } from '../SteveTurnerParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

function parse(buffer: ArrayBuffer, filename: string): TrackerSong {
  return parseSteveTurnerFile(buffer, filename);
}

describeVariableBlockCarrier('steveTurner', parse);
