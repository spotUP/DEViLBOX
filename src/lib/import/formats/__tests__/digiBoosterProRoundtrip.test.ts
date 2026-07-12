/**
 * Regression: DBM (DigiBooster Pro) packs all channels into one per-pattern
 * stream with event-mask compression that omits empty cells — a non-canonical
 * encoding no from-scratch encoder reproduces, so the harness measured
 * digiBoosterPro at 0.0000. Fixed with the structural raw-block carrier
 * (blockRawBytes + blockRows on the variable layout); see
 * variableBlockCarrier.testkit.ts for the asserted invariants.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseDigiBoosterProFile } from '../DigiBoosterProParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

// parseDigiBoosterProFile takes a Uint8Array and may return null; adapt to the
// (ArrayBuffer, filename) => TrackerSong contract the testkit expects.
function parse(buffer: ArrayBuffer, filename: string): TrackerSong {
  const song = parseDigiBoosterProFile(new Uint8Array(buffer), filename);
  if (!song) throw new Error('parseDigiBoosterProFile returned null');
  return song;
}

describeVariableBlockCarrier('digiBoosterPro', parse);
