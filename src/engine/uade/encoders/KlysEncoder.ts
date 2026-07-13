/**
 * KlysEncoder.ts — Encodes TrackerCell back to Klystrack native step format.
 *
 * Klystrack pattern step (6 bytes, little-endian):
 *   byte[0]: note       (0=empty, 1-96=note, 97=note-off; 0xFF in native = empty)
 *   byte[1]: instrument (0xFF=no instrument, 0-254=instrument index)
 *   byte[2]: ctrl       (bitfield: legato, slide, vibrato)
 *   byte[3]: volume     (0-128 or special values; 0=default)
 *   byte[4]: command low byte  (command = type << 8 | param; low = param)
 *   byte[5]: command high byte (high = type)
 *
 * TrackerCell mapping (from KlysParser / WASM callback):
 *   cell.note = step.note (1-96, 97=off, 0=empty)
 *   cell.instrument = step.instrument + 1 (parser adds 1; 0xFF native → -1 or 0 in cell)
 *   cell.volume = step.volume
 *   cell.effTyp = command >> 8 (effect type)
 *   cell.eff = command & 0xFF (effect parameter)
 *
 * Reverse mapping:
 *   note: cell.note (0=empty → 0, 1-96 → same, 97=noteoff → 97)
 *   instrument: cell.instrument - 1 if > 0, else 0xFF
 *   ctrl: 0 (not exposed in TrackerCell)
 *   volume: cell.volume
 *   command: (cell.effTyp << 8) | cell.eff
 *
 * This is a fixed-size 6-byte cell encoder.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder, registerVariableEncoder } from '../UADEPatternEncoder';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';

export function encodeKlysCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(6);

  // Byte 0: note
  const note = cell.note ?? 0;
  out[0] = note & 0xFF;

  // Byte 1: instrument (reverse: parser adds 1, so subtract 1; 0 or negative → 0xFF)
  const instr = cell.instrument ?? 0;
  out[1] = instr > 0 ? ((instr - 1) & 0xFF) : 0xFF;

  // Byte 2: ctrl (not tracked in TrackerCell — default 0)
  out[2] = 0;

  // Byte 3: volume
  out[3] = (cell.volume ?? 0) & 0xFF;

  // Bytes 4-5: command (little-endian uint16: type << 8 | param)
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  const command = ((effTyp & 0xFF) << 8) | (eff & 0xFF);
  out[4] = command & 0xFF;        // low byte (param)
  out[5] = (command >> 8) & 0xFF; // high byte (type)

  return out;
}

registerPatternEncoder('klystrack', () => encodeKlysCell);

// ─── Variable-length pattern packer (edit fall-back for the raw-block carrier) ──
//
// Klystrack patterns are bit-packed: a 4-bit presence nibble per step selects
// which of NOTE/INST/CTRL/CMD follow, and VOLUME presence rides in the high bits
// of the CTRL byte (`bits |= ctrl & ~7`, v>=14) because it does not fit the nibble.
// See `mus_load_song_RW` in klystrack-wasm/common/music.c (pattern loop).
//
// This packer is a REAL inverse of KlysParser's block decoder: an UNEDITED block
// is served verbatim from the raw-byte carrier, so this only runs when a cell is
// edited. It emits the v>=24 pattern form (u16 steps, u8 color, nibble map, payload)
// and carries VOLUME via the CTRL byte. Blocks carry raw note/instrument/volume
// (0xFF = absent) so presence is a clean value test; `ctrl` itself is not surfaced
// in TrackerCell, so an edited step re-packs with ctrl = 0.

const PAK_BIT_NOTE = 1;
const PAK_BIT_INST = 2;
const PAK_BIT_CTRL = 4;
const PAK_BIT_CMD = 8;
const PAK_BIT_VOLUME = 128;
const KLYS_NOTE_NONE = 0xff;
const KLYS_NO_INSTRUMENT = 0xff;
const KLYS_NO_VOLUME = 0xff;

/** Pack one klystrack pattern (single-channel step list) into its on-disk bytes. */
export function encodeKlysPattern(rows: TrackerCell[]): Uint8Array {
  const steps = rows.length;
  const nibbleLen = (steps >> 1) + (steps & 1);
  const packed = new Uint8Array(nibbleLen);
  const payload: number[] = [];

  let ci = 0;
  for (let s = 0; s < steps; s++) {
    const c = rows[s];
    const note = c.note ?? KLYS_NOTE_NONE;
    const instrument = c.instrument ?? KLYS_NO_INSTRUMENT;
    const volume = c.volume ?? KLYS_NO_VOLUME;
    const command = (((c.effTyp ?? 0) & 0xff) << 8) | ((c.eff ?? 0) & 0xff);

    const hasNote = note !== KLYS_NOTE_NONE;
    const hasInst = instrument !== KLYS_NO_INSTRUMENT;
    const hasCmd = command !== 0;
    const hasVol = volume !== KLYS_NO_VOLUME;

    // VOLUME presence must ride in the CTRL byte's high bits.
    const extraBits = hasVol ? PAK_BIT_VOLUME : 0;
    const needCtrlByte = extraBits !== 0;

    let bits = 0;
    if (hasNote) bits |= PAK_BIT_NOTE;
    if (hasInst) bits |= PAK_BIT_INST;
    if (needCtrlByte) bits |= PAK_BIT_CTRL;
    if (hasCmd) bits |= PAK_BIT_CMD;

    const isLow = (s & 1) !== 0 || s === steps - 1;
    if (isLow) packed[ci] |= bits & 0xf;
    else packed[ci] |= (bits & 0xf) << 4;

    // Payload order mirrors the decoder: note, inst, ctrl, cmd (LE u16), volume.
    if (hasNote) payload.push(note & 0xff);
    if (hasInst) payload.push(instrument & 0xff);
    if (needCtrlByte) payload.push(extraBits & 0xff); // real ctrl (low 3 bits) = 0
    if (hasCmd) {
      payload.push(command & 0xff);
      payload.push((command >> 8) & 0xff);
    }
    if (hasVol) payload.push(volume & 0xff);

    if (s & 1) ci++;
  }

  const out = new Uint8Array(2 + 1 + nibbleLen + payload.length);
  out[0] = steps & 0xff;
  out[1] = (steps >> 8) & 0xff;
  out[2] = 0; // color (v>=24)
  out.set(packed, 3);
  out.set(payload, 3 + nibbleLen);
  return out;
}

export const klysVariableEncoder: VariableLengthEncoder = {
  formatId: 'klystrack',
  encodePattern: (rows) => encodeKlysPattern(rows),
};

registerVariableEncoder(klysVariableEncoder);
