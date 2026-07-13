/**
 * Regression: klystrack (.kt) patterns are bit-packed (a 4-bit presence nibble per
 * step selects NOTE/INST/CTRL/CMD; VOLUME rides in the CTRL byte high bits), so no
 * naive packer reproduces the on-disk bytes and the encoderRoundtrip harness
 * previously measured 0.0000.
 *
 * Fixed with the structural raw-block carrier: KlysParser parses the whole .kt
 * stream LINEARLY (mirroring mus_load_song_RW — fx, instruments, sequences) to
 * recover each pattern's REAL [offset, size), carries the original bytes + decoded
 * baseline rows, re-emits verbatim when unedited (byte-exact) and re-packs on edit
 * (KlysEncoder.encodeKlysPattern). The linear parse is validated to EOF, so wrong
 * field sizes omit the carrier rather than ship a wrong parse. See
 * variableBlockCarrier.testkit.ts for the invariants; on revert of the carrier
 * assertion 1 fails.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseKlystrack } from '../KlysParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

function parse(buffer: ArrayBuffer, _filename: string): TrackerSong {
  return parseKlystrack(buffer);
}

describeVariableBlockCarrier('klystrack', parse);
