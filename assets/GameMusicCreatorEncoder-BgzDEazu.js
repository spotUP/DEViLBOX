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
function encodeGameMusicCreatorCell(cell) {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  if (xmNote === 97) {
    out[0] = 255;
    out[1] = 254;
    out[2] = 0;
    out[3] = 0;
    return out;
  }
  const period = xmNoteToPeriod(xmNote);
  out[0] = (instr & 15) << 4 | period >> 8 & 15;
  out[1] = period & 255;
  let gmcCmd = 0;
  let gmcParam = eff;
  switch (effTyp) {
    case 1:
      gmcCmd = 1;
      break;
    // portamento up
    case 2:
      gmcCmd = 2;
      break;
    // portamento down
    case 12:
      gmcCmd = 3;
      gmcParam = eff & 127;
      break;
    // set volume
    case 13:
      gmcCmd = 4;
      break;
    // pattern break
    case 11:
      gmcCmd = 5;
      break;
    // position jump
    case 14:
      if (eff === 0) gmcCmd = 6;
      else if (eff === 1) gmcCmd = 7;
      gmcParam = 0;
      break;
    case 15:
      gmcCmd = 8;
      break;
    // set speed
    default:
      gmcCmd = 0;
      gmcParam = 0;
      break;
  }
  out[2] = gmcCmd & 15;
  out[3] = gmcParam & 255;
  return out;
}
registerPatternEncoder("gameMusicCreator", () => encodeGameMusicCreatorCell);
export {
  encodeGameMusicCreatorCell as e
};
