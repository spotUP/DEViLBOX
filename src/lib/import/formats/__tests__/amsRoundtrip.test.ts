/**
 * Regression: AMS (Velvet Studio / Extreme Tracker) packs rows with an
 * event-mask compression that omits empty cells — a non-canonical encoding no
 * from-scratch encoder reproduces, so the harness measured ams at 0.0286.
 * Fixed with the structural raw-block carrier (blockRawBytes + blockRows on the
 * variable layout); see variableBlockCarrier.testkit.ts for the invariants.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseAMSFile } from '../AMSParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

// parseAMSFile takes a Uint8Array and may return null; adapt to the
// (ArrayBuffer, filename) => TrackerSong contract the testkit expects.
function parse(buffer: ArrayBuffer, filename: string): TrackerSong {
  const song = parseAMSFile(new Uint8Array(buffer), filename);
  if (!song) throw new Error('parseAMSFile returned null');
  return song;
}

describeVariableBlockCarrier('ams', parse);
