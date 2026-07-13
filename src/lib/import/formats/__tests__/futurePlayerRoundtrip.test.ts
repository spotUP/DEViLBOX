/**
 * Regression: Future Player (.fp) voice data is a call-GRAPH over shared
 * command BLOCKS (subroutine bodies + top-level voice sequences), each a REAL
 * contiguous byte range ending at cmd 0 (end/return) or cmd 7 (jump). The
 * parser previously fabricated per-voice sizes (Math.max(nonEmpty*4, 64)) and
 * the encoderRoundtrip harness measured 0.0000.
 *
 * Fixed with the structural raw-block carrier: BFS-enumerate every reachable
 * block (deduped by code offset, sized by scanning to its terminator), carry
 * each block's original bytes + decoded baseline rows, re-emit verbatim when
 * unedited (byte-exact) and re-pack on edit. See variableBlockCarrier.testkit.ts
 * for the invariants; on revert of the carrier assertion 1 fails.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseFuturePlayerFile } from '../FuturePlayerParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

function parse(buffer: ArrayBuffer, filename: string): TrackerSong {
  return parseFuturePlayerFile(buffer, filename);
}

describeVariableBlockCarrier('futurePlayer', parse);
