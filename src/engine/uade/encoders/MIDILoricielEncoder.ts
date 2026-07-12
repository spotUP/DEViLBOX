/**
 * MIDILoricielEncoder — Encodes TrackerCell back to MIDI Loriciel (.midi) track bytes.
 *
 * A MIDI Loriciel module is a Standard MIDI File (MThd + one or more MTrk chunks)
 * played through Loriciel's proprietary Amiga bank. The note data is the MTrk
 * chunk stream — variable-length delta-time + running-status event bytes — which
 * has no clean fixed note/effect grid, so the faithful byte-exact inverse is a
 * per-byte carrier over the located track region.
 *
 * decodeCell (in MIDILoricielParser) stashes the exact source byte in the invisible
 * `period` carrier; this encoder reproduces it verbatim. Edited grid cells lack the
 * carrier and fall back to a zero byte. True event-level editing is future work; this
 * codec's job is a byte-exact export round-trip over the real MTrk region.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeMIDILoricielCell(cell: TrackerCell): Uint8Array {
  // Byte-exact carrier restore: reproduce the exact source byte when present.
  if (cell.period !== undefined) {
    return new Uint8Array([cell.period & 0xFF]);
  }
  return new Uint8Array([0x00]);
}

registerPatternEncoder('midiLoriciel', () => encodeMIDILoricielCell);

export { encodeMIDILoricielCell };
