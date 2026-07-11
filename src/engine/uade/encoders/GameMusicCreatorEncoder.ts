/**
 * GameMusicCreatorEncoder — Encodes TrackerCell back to Game Music Creator (.gmc)
 * native binary format for the legacy GameMusicCreatorParser.
 *
 * GMC cell encoding (4 bytes):
 *   byte[0]: (sample << 4) | ((period >> 8) & 0x0F)
 *   byte[1]: period & 0xFF
 *   byte[2]: GMC effect command (0x00-0x08) in low nibble
 *   byte[3]: effect parameter
 *
 * This differs from standard 31-instrument MOD encoding:
 *   - GMC has only 15 samples, so the full instrument fits in the high nibble of byte 0
 *   - Byte 2 high nibble is unused (no instrument low nibble contribution)
 *   - Effect commands are GMC-specific (not standard ProTracker effects)
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

// Standard ProTracker period table (finetune 0), 36 entries: C-1 to B-3
const MOD_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

function xmNoteToPeriod(xmNote: number): number {
  if (xmNote === 0) return 0;
  const periodIdx = xmNote - 37;
  if (periodIdx < 0 || periodIdx >= MOD_PERIODS.length) return 0;
  return MOD_PERIODS[periodIdx];
}

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
    // Byte 0/1: (sample << 4) | (period >> 8), period low byte.
    // The MOD period table is lossy (a raw off-table Amiga period decodes to the nearest
    // note, whose canonical period differs), so prefer the exact source period stashed by
    // decodeCell in the `period` carrier. Edited grid cells carry no period → derive it
    // from the note.
    const period = cell.period !== undefined ? (cell.period & 0x0FFF) : xmNoteToPeriod(xmNote);
    out[0] = ((instr & 0x0F) << 4) | ((period >> 8) & 0x0F);
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
    out[2] = gmcCmd & 0x0F;
    out[3] = gmcParam & 0xFF;
  }

  // Byte-exact carrier restore. GMC's effect map is many-to-one (cmd 0 drops its param,
  // byte2's high nibble and default cmds collapse to 0), so byte2/byte3 cannot always be
  // reproduced from the XM view. decodeCell stashes the exact source bytes in the invisible
  // pan/cutoff carriers (fields the GMC grid loop never sets) — reproduce them verbatim on
  // every path (note-cut included). Edited grid cells lack the carriers and keep the
  // canonical derivation above.
  if (cell.pan !== undefined)    out[2] = cell.pan & 0xFF;
  if (cell.cutoff !== undefined) out[3] = cell.cutoff & 0xFF;

  return out;
}

registerPatternEncoder('gameMusicCreator', () => encodeGameMusicCreatorCell);
