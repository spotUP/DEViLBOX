import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
function encodeQCCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  out[0] = (cell.instrument ?? 0) & 255;
  if (note > 0 && note >= 37 && note <= 72) {
    out[1] = note - 37;
  } else {
    out[1] = 255;
  }
  let effTyp = cell.effTyp ?? 0;
  let eff = cell.eff ?? 0;
  if (effTyp === 4 && eff > 0) {
    const speed = eff >> 4 & 15;
    const depth = Math.min(15, Math.floor((eff & 15) / 2));
    eff = speed << 4 | depth;
  }
  if (effTyp === 9 && eff > 0) {
    eff = Math.floor(eff / 2);
  }
  out[2] = effTyp & 15;
  out[3] = eff & 255;
  return out;
}
registerPatternEncoder("quadraComposer", () => encodeQCCell);
export {
  encodeQCCell as e
};
