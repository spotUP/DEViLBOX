/**
 * Regression: IFF SMUS (Sonix) TRAK chunks are variable-length event streams
 * (note+duration / rest / instrument events, durations quantized through
 * DURATION_TABLE on decode) — a non-canonical encoding no from-scratch encoder
 * reproduces byte-exact, so the harness measured iffSmus at 0.0000. Fixed with
 * the structural raw-block carrier (one block per TRAK = one channel;
 * blockRawBytes + blockRows on the variable layout); see
 * variableBlockCarrier.testkit.ts for the asserted invariants.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseIffSmusFile } from '../IffSmusParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

// parseIffSmusFile is async and takes (buffer, filename, companionFiles?).
function parse(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  return parseIffSmusFile(buffer, filename);
}

describeVariableBlockCarrier('iffSmus', parse);
