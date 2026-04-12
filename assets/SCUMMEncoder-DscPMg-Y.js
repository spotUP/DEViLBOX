import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
const MOD_PERIODS = [
  856,
  808,
  762,
  720,
  678,
  640,
  604,
  570,
  538,
  508,
  480,
  453,
  428,
  404,
  381,
  360,
  339,
  320,
  302,
  285,
  269,
  254,
  240,
  226,
  214,
  202,
  190,
  180,
  170,
  160,
  151,
  143,
  135,
  127,
  120,
  113
];
function xmNoteToPeriod(xmNote) {
  if (xmNote === 0) return 0;
  const periodIdx = xmNote - 37;
  if (periodIdx < 0 || periodIdx >= MOD_PERIODS.length) return 0;
  return MOD_PERIODS[periodIdx];
}
function encodeSCUMMCell(cell) {
  const out = new Uint8Array(4);
  const period = xmNoteToPeriod(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  out[0] = instr & 240 | period >> 8 & 15;
  out[1] = period & 255;
  out[2] = (instr & 15) << 4 | effTyp & 15;
  out[3] = eff & 255;
  return out;
}
registerPatternEncoder("scumm", () => encodeSCUMMCell);
export {
  encodeSCUMMCell as e
};
