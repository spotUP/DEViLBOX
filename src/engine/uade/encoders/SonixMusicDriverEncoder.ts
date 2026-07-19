/**
 * SonixMusicDriverEncoder — Encodes TrackerCell rows back to SNX voice event streams.
 *
 * SNX is a variable-length event stream format (16-bit words, big-endian).
 * Each voice channel is an independent stream of opcodes:
 *
 *   0xFFFF          end of track
 *   0xC000-0xFFFE   rest/delay for (word & 0x3FFF) ticks
 *   0x83nn          volume set to nn (0-127)
 *   0x82nn          tempo change to nn
 *   0x81nn          loop control
 *   0x80nn          instrument change to register nn (0-based)
 *   0x0000          rest for 1 tick
 *   0x0Nnn          note on: high byte = note index (1-127), low byte = volume
 *
 * This encoder is the exact inverse of parseSnxVoiceStream in SonixMusicDriverParser,
 * which quantizes the driver's CIA-tick timeline to display rows of SNX_TICKS_PER_ROW ticks
 * each (the tracker `speed` convention). So one grid row emits SNX_TICKS_PER_ROW ticks of
 * WAIT: a note row is NOTE word + WAIT(SNX_TICKS_PER_ROW); an empty row is a bare WAIT of
 * the same span (runs of empties coalesce into one WAIT). Re-parsing the emitted stream
 * lands every note back on its original row. NB: never 0x0000 — under the parser 0x0000 is a
 * 0-tick no-op that would drop the row.
 *
 * Reverse mappings:
 *   xmNote -> noteIndex: noteIndex = clamp(xmNote, 1, 127) (parser: xmNote = clamp(noteIndex, 1, 96))
 *   xmVol -> velByte:    velByte = round((clamp(xmVol - 0x10, 0, 64) / 64) * 127)
 *   instrument -> register: register = instrument - 1 (parser: instrument = register + 1)
 *
 * Since SNX is variable-length, this uses UADEVariablePatternLayout with
 * full-pattern re-serialization.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';
import { SNX_TICKS_PER_ROW } from '@/engine/sonix/sonixPosition';

/** Push a WAIT covering `ticks` CIA ticks, chunked to the 0x3FFF opcode ceiling. */
function pushWait(words: number[], ticks: number): void {
  let remaining = ticks;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 0x3FFF);
    words.push(0xC000 | chunk);
    remaining -= chunk;
  }
}

/** True when a row carries no trigger and no state change (a pure hold/rest tick). */
function isEmptyRow(cell: TrackerCell): boolean {
  return (cell.note ?? 0) === 0 && (cell.instrument ?? 0) === 0 && (cell.volume ?? 0) === 0;
}

/**
 * Encode a single channel's pattern rows back to an SNX voice event stream (row-grid inverse).
 *
 * Strategy — every row spans SNX_TICKS_PER_ROW CIA ticks:
 * - A run of empty rows -> one WAIT of (run length * SNX_TICKS_PER_ROW), chunked to 0x3FFF.
 * - A non-empty (trigger) row emits its instrument/volume change words, the NOTE word, then a
 *   WAIT(SNX_TICKS_PER_ROW) for that single row. Re-parsing lands the note back on the same row.
 * - Stream ends with 0xFFFF.
 */
function encodeSnxVoiceStream(rows: TrackerCell[], _channel: number): Uint8Array {
  const words: number[] = [];
  let lastInstr = 1; // track current instrument (1-based, matching parser default)

  let i = 0;
  while (i < rows.length) {
    const cell = rows[i];

    if (isEmptyRow(cell)) {
      // Rest run -> single WAIT covering every empty row at SNX_TICKS_PER_ROW ticks each.
      let count = 0;
      while (i < rows.length && isEmptyRow(rows[i])) { count++; i++; }
      pushWait(words, count * SNX_TICKS_PER_ROW);
      continue;
    }

    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const vol = cell.volume ?? 0;

    // Emit instrument change if needed (spends 0 ticks; folds into the following note).
    if (instr > 0 && instr !== lastInstr) {
      const register = instr - 1; // reverse: parser does instrument = register + 1
      words.push(0x8000 | (register & 0xFF));
      lastInstr = instr;
    }

    // Emit volume change if the volume column is set (XM volume format 0x10-0x50).
    if (vol >= 0x10) {
      const snxVol = Math.round(((Math.min(vol, 0x50) - 0x10) / 64) * 127);
      words.push(0x8300 | (snxVol & 0xFF));
    }

    if (note > 0 && note <= 96) {
      const noteIndex = Math.max(1, Math.min(127, note));
      const velByte = vol >= 0x10
        ? Math.round(((Math.min(vol, 0x50) - 0x10) / 64) * 127)
        : 100; // default velocity when no volume set
      words.push(((noteIndex & 0x7F) << 8) | (velByte & 0xFF));
    }
    // This display row consumes SNX_TICKS_PER_ROW ticks.
    pushWait(words, SNX_TICKS_PER_ROW);
    i++;
  }

  // End of track marker
  words.push(0xFFFF);

  // Convert words to bytes (big-endian uint16)
  const out = new Uint8Array(words.length * 2);
  for (let w = 0; w < words.length; w++) {
    out[w * 2] = (words[w] >> 8) & 0xFF;
    out[w * 2 + 1] = words[w] & 0xFF;
  }
  return out;
}

const sonixEncoder: VariableLengthEncoder = {
  formatId: 'sonixMusicDriver',
  encodePattern: encodeSnxVoiceStream,
};

registerVariableEncoder(sonixEncoder);

/**
 * Encode a single channel's pattern rows back to a TINY voice event stream.
 *
 * TINY opcodes differ from SNX (0x80/0x81 swapped, note low byte = duration):
 *   0xFFFF       end of track
 *   0x81nn       instrument change to register nn (0-based)
 *   0x80nn       rest for nn ticks (nn = 1..255)
 *   0xNNdd       note on: high = note index (1-127), low = duration in ticks
 *
 * Inverse of parseTinyVoiceStream. Since the raw-block carrier emits unedited
 * streams verbatim, this only runs on edited channels; each note is emitted as
 * a 1-tick event and trailing empty rows collapse to rest opcodes (edit-path
 * fidelity, not byte-exact reproduction of the original durations).
 */
function encodeTinyVoiceStream(rows: TrackerCell[], _channel: number): Uint8Array {
  const words: number[] = [];
  let lastInstr = 1; // 1-based, matching parser default

  let i = 0;
  while (i < rows.length) {
    const cell = rows[i];
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const vol = cell.volume ?? 0;
    const isEmpty = note === 0 && instr === 0 && vol === 0;

    if (isEmpty) {
      let count = 0;
      while (i < rows.length) {
        const r = rows[i];
        if ((r.note ?? 0) === 0 && (r.instrument ?? 0) === 0 && (r.volume ?? 0) === 0) {
          count++; i++;
        } else break;
      }
      // Rest opcode 0x80nn caps nn at 255; chunk longer rests.
      while (count > 0) {
        const chunk = Math.min(255, count);
        words.push(0x8000 | chunk);
        count -= chunk;
      }
      continue;
    }

    if (instr > 0 && instr !== lastInstr) {
      words.push(0x8100 | ((instr - 1) & 0xFF)); // instrument change (0-based)
      lastInstr = instr;
    }

    if (note > 0) {
      const noteIndex = Math.max(1, Math.min(127, note));
      words.push((noteIndex << 8) | 0x01); // duration 1 tick (rests carry the hold)
    }
    i++;
  }

  words.push(0xFFFF);

  const out = new Uint8Array(words.length * 2);
  for (let w = 0; w < words.length; w++) {
    out[w * 2] = (words[w] >> 8) & 0xFF;
    out[w * 2 + 1] = words[w] & 0xFF;
  }
  return out;
}

const sonixTinyEncoder: VariableLengthEncoder = {
  formatId: 'sonixMusicDriverTiny',
  encodePattern: encodeTinyVoiceStream,
};

registerVariableEncoder(sonixTinyEncoder);

export { encodeSnxVoiceStream, sonixEncoder, encodeTinyVoiceStream, sonixTinyEncoder };
