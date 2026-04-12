import { c4 as xmNoteToPeriod, b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
const XM_NOTE_CUT = 97;
function reverseEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { sfxEff: 0, param: 0 };
  switch (effTyp) {
    case 0:
      return { sfxEff: 0, param: eff };
    // arpeggio
    case 1:
      return { sfxEff: 1, param: eff };
    // portamento up
    case 2:
      return { sfxEff: 2, param: eff };
    // portamento down
    case 12:
      return { sfxEff: 6, param: eff };
    // set volume
    case 15:
      return { sfxEff: 9, param: eff };
    // set speed
    case 10:
      return { sfxEff: 5, param: eff };
    // volume slide
    case 14:
      return { sfxEff: 3, param: eff };
    // filter/extended
    default:
      return { sfxEff: 0, param: 0 };
  }
}
function encodeSoundFXCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  let period = 0;
  if (note === XM_NOTE_CUT) {
    period = -2;
  } else if (note > 0) {
    period = xmNoteToPeriod(note);
  }
  out[0] = period >> 8 & 255;
  out[1] = period & 255;
  const instr = cell.instrument ?? 0;
  const { sfxEff, param } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = (instr & 15) << 4 | sfxEff & 15;
  out[3] = param & 255;
  return out;
}
registerPatternEncoder("soundfx", () => encodeSoundFXCell);
export {
  encodeSoundFXCell as e
};
