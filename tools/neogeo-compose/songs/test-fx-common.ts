/**
 * Shared setup of the test-fx1..6 tunes: feature tests for the BossGame AY compiler (one AY, 3 channels, speed 6,
 * 32 rows). They keep what the old player contract drops (keepOutsideContract), so the files show every feature
 * the compiler must learn. Spec: BossGame thoughts/spot/2026-11-14-fur-features-plan.md, "Test tunes for devilbox-5f".
 */
import { ScrambleSongBuilder } from '@/lib/export/neogeo/scrambleCompose';
import type { NeoGeoPattern } from '@/lib/export/neogeo/neoGeoCompose';

export const A = 0, B = 1, C = 2;

export function testFxSong(name: string, linearPitch: 0 | 1 | 2): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder(name, 6, 32, 3);
  s.linearPitch = linearPitch;
  s.keepOutsideContract = true;
  return s;
}

/** Note `d` octaves away: oct('C-4', -1) = 'C-3'. */
export function oct(note: string, d: number): string {
  return note.slice(0, -1) + (Number(note.slice(-1)) + d);
}

/** Orders the patterns and ends the last one with 0B00 (jump to order 0) on its last row. */
export function finish(s: ScrambleSongBuilder, ...patterns: NeoGeoPattern[]): ScrambleSongBuilder {
  patterns.forEach((p) => s.order.push(s.indexOf(p)));
  patterns[patterns.length - 1].put(A, 31, { fx: [[0x0b, 0x00]] });
  return s;
}
