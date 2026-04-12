import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
function encodeTFMXCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  const vol = cell.volume ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  if (note === 0 && instr === 0) {
    if (effTyp === 13) {
      out[0] = 240;
      return out;
    }
    if (effTyp === 15 && eff > 0) {
      out[0] = 243;
      out[1] = Math.max(0, eff - 1) & 255;
      return out;
    }
  }
  if (note === 97) {
    out[0] = 245;
    return out;
  }
  if (note > 0 && note < 97) {
    const tfmxNote = Math.max(0, Math.min(63, note - 37));
    const macro = Math.max(0, instr - 1) & 127;
    const relVol = Math.min(15, Math.round(vol / 4));
    const wait = effTyp === 15 ? eff : 0;
    out[0] = wait > 0 ? tfmxNote | 128 : tfmxNote;
    out[1] = macro;
    out[2] = relVol << 4 & 240;
    out[3] = wait > 0 ? wait & 255 : 0;
    return out;
  }
  if (effTyp === 3 && note > 0) {
    const tfmxNote = Math.max(0, Math.min(63, note - 37));
    out[0] = tfmxNote | 192;
    out[1] = Math.max(0, instr - 1) & 127;
    out[2] = Math.min(15, Math.round(vol / 4)) << 4 & 240;
    out[3] = eff & 255;
    return out;
  }
  out[0] = 255;
  return out;
}
registerPatternEncoder("tfmx", () => encodeTFMXCell);
export {
  encodeTFMXCell as e
};
