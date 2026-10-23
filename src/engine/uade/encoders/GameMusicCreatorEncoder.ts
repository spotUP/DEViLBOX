/**
 * GameMusicCreatorEncoder — Encodes TrackerCell back to Game Music Creator (.gmc)
 * native binary format for the legacy GameMusicCreatorParser.
 *
 * GMC cell encoding (4 bytes), as read by gmc-wasm/src/gmc.c:
 *   bytes[0..1]: period, u16BE (high nibble of byte 0 must be 0)
 *   byte[2]:     (sample << 4) | effect command (0x00-0x08)
 *   byte[3]:     effect parameter
 *   Note cut:    bytes[0..1] = 0xFFFE
 *
 * GMC has 15 samples, so the sample number fits the high nibble of byte 2.
 *
 * GMC effect → XM effect mapping (reverse of parser):
 *   XM 0x01 → GMC 0x01 (portamento up)
 *   XM 0x02 → GMC 0x02 (portamento down)
 *   XM 0x0C → GMC 0x03 (set volume)
 *   XM 0x0D → GMC 0x04 (pattern break)
 *   XM 0x0B → GMC 0x05 (position jump)
 *   XM 0x0E/0x00 → GMC 0x06 (LED filter on)
 *   XM 0x0E/0x01 → GMC 0x07 (LED filter off)
 *   XM 0x0F → GMC 0x08 (set speed)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
// ProTracker naming (note 13 = C-1 = 856), one table: src/lib/amiga/periodNotes.ts.
import { cellPeriod, periodToPtNote } from '@/lib/amiga/periodNotes';

export function encodeGameMusicCreatorCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  if (xmNote === 97) {
    // Note cut
    out[0] = 0xFF;
    out[1] = 0xFE;
    out[2] = 0;
    out[3] = 0;
  } else {
    // Bytes 0/1: period u16BE (the sample number lives in byte 2, not here).
    // The MOD period table is lossy (a raw off-table Amiga period decodes to the nearest
    // note, whose canonical period differs), so prefer the exact source period stashed by
    // decodeCell in the `period` carrier while it still names the note; an edited note's
    // stale period does not count (src/lib/amiga/periodNotes.ts cellPeriod).
    const period = cellPeriod(cell) & 0x0FFF;
    out[0] = (period >> 8) & 0x0F;
    out[1] = period & 0xFF;

    // Byte 2: GMC effect command (reverse XM→GMC mapping)
    let gmcCmd = 0;
    let gmcParam = eff;
    switch (effTyp) {
      case 0x01: gmcCmd = 0x01; break;                         // portamento up
      case 0x02: gmcCmd = 0x02; break;                         // portamento down
      case 0x0C: gmcCmd = 0x03; gmcParam = eff & 0x7F; break; // set volume
      case 0x0D: gmcCmd = 0x04; break;                         // pattern break
      case 0x0B: gmcCmd = 0x05; break;                         // position jump
      case 0x0E:
        if (eff === 0x00) gmcCmd = 0x06;                       // LED filter on
        else if (eff === 0x01) gmcCmd = 0x07;                  // LED filter off
        gmcParam = 0;
        break;
      case 0x0F: gmcCmd = 0x08; break;                         // set speed
      default: gmcCmd = 0; gmcParam = 0; break;
    }
    out[2] = ((instr & 0x0F) << 4) | (gmcCmd & 0x0F);
    out[3] = gmcParam & 0xFF;
  }

  // Byte-exact carrier restore. GMC's effect map is many-to-one (cmd 0 drops its param,
  // byte2's high nibble and default cmds collapse to 0), so byte2/byte3 cannot always be
  // reproduced from the XM view. decodeGameMusicCreatorCell stashes the exact source bytes in the invisible
  // pan/cutoff carriers (fields the GMC grid loop never sets) — reproduce them verbatim on
  // every path (note-cut included). Edited grid cells lack the carriers and keep the
  // canonical derivation above.
  if (cell.pan !== undefined)    out[2] = cell.pan & 0xFF;
  if (cell.cutoff !== undefined) out[3] = cell.cutoff & 0xFF;

  return out;
}

/**
 * Inverse of encodeGameMusicCreatorCell, the single GMC cell decoder (import loop and
 * pattern layout both call it). Besides the visible fields it returns the byte-exact
 * carriers: period (exact source period), pan (raw byte2), cutoff (raw byte3).
 * Callers that build an editable grid cell must drop the carriers.
 */
export function decodeGameMusicCreatorCell(bytes: Uint8Array): TrackerCell {
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const prm = bytes[3];
  const noteCut = b0 === 0xFF && b1 === 0xFE;

  const periodRaw = noteCut ? 0 : (b0 << 8) | b1;
  const sampleNum = noteCut ? 0 : b2 >> 4;
  const cmd = b2 & 0x0F;

  let note = 0;
  if (noteCut) note = 97; // XM note-cut
  else if (periodRaw > 0) note = periodToPtNote(periodRaw);

  // Effect mapping (Load_gmc.cpp switch)
  let effTyp = 0;
  let eff = prm;
  switch (cmd) {
    case 0x00: effTyp = 0; eff = 0; break;
    case 0x01: effTyp = 0x01; break;
    case 0x02: effTyp = 0x02; break;
    case 0x03: effTyp = 0x0C; eff = prm & 0x7F; break;
    case 0x04: effTyp = 0x0D; break;
    case 0x05: effTyp = 0x0B; break;
    case 0x06: effTyp = 0x0E; eff = 0x00; break;
    case 0x07: effTyp = 0x0E; eff = 0x01; break;
    case 0x08: effTyp = 0x0F; break;
    default:   effTyp = 0; eff = 0; break;
  }

  return {
    note, instrument: sampleNum, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0,
    period: periodRaw, pan: b2, cutoff: prm,
  };
}

registerPatternEncoder('gameMusicCreator', () => encodeGameMusicCreatorCell);
