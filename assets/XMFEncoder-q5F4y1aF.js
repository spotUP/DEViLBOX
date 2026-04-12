import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
function reverseXMFEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { xmfEff: 0, param: 0 };
  switch (effTyp) {
    case 11:
      return { xmfEff: 11, param: Math.max(0, eff - 1) };
    // position jump (parser incremented)
    case 14:
      return { xmfEff: eff >> 4 | 224, param: eff & 15 };
    // extended: 0xExy
    default:
      return { xmfEff: effTyp, param: eff };
  }
}
function encodeXMFCell(cell) {
  const out = new Uint8Array(6);
  const note = cell.note ?? 0;
  if (note > 0 && note >= 37) {
    out[0] = note - 36;
  } else {
    out[0] = 0;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  const eff1 = reverseXMFEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = eff1.xmfEff & 255;
  out[5] = eff1.param & 255;
  const eff2 = reverseXMFEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
  out[3] = eff2.xmfEff & 255;
  out[4] = eff2.param & 255;
  return out;
}
registerPatternEncoder("xmf", () => encodeXMFCell);
export {
  encodeXMFCell as e
};
