import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
function reverseEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return 255;
  switch (effTyp) {
    case 1:
      return 0 << 4 | eff & 15;
    case 2:
      return 1 << 4 | eff & 15;
    case 3:
      return 2 << 4 | eff & 15;
    case 4:
      return 4 << 4 | eff & 15;
    case 15:
      return 5 << 4 | eff & 15;
    case 14:
      if (eff === 4) return 6 << 4 | 0;
      if (eff === 20) return 6 << 4 | 1;
      if ((eff & 240) === 144) return 7 << 4 | eff & 15;
      return 255;
    default:
      return 255;
  }
}
function encode669Cell(cell) {
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  const volume = cell.volume ?? 0;
  const hasNote = note > 0;
  const hasVolume = volume > 0;
  if (!hasNote && !hasVolume) {
    out[0] = 255;
    out[1] = 0;
  } else if (!hasNote) {
    out[0] = 254;
    const rawVol = Math.min(15, Math.round(volume * 15 / 64));
    out[1] = rawVol & 15;
  } else {
    const rawNote = Math.max(0, Math.min(63, note - 37));
    const instrHi = instr & 3;
    out[0] = rawNote << 2 | instrHi;
    const instrLo = instr >> 2 & 15;
    const rawVol = hasVolume ? Math.min(15, Math.round(volume * 15 / 64)) : 0;
    out[1] = instrLo << 4 | rawVol & 15;
  }
  out[2] = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  return out;
}
registerPatternEncoder("composer667", () => encode669Cell);
export {
  encode669Cell as e
};
