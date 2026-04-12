import { c5 as registerVariableEncoder } from "./main-BbV5VyEH.js";
function xmNoteToAST(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const idx = xmNote + 24;
  return idx >= 1 && idx <= 73 ? idx : 0;
}
function xmEffectToAST(effTyp, eff) {
  switch (effTyp) {
    case 0:
      return eff !== 0 ? [112, eff] : null;
    case 1:
      return [113, eff];
    case 2:
      return [114, eff];
    case 4:
      return [116, eff];
    case 6:
      return [126, eff];
    case 7:
      return [122, eff];
    case 9:
      return [118, eff];
    case 10:
      return [125, eff];
    case 12:
      return [124, Math.min(64, eff)];
    case 13:
      return [123, eff];
    case 15:
      return [127, eff];
    case 14: {
      const sub = eff >> 4 & 15;
      const param = eff & 15;
      if (sub === 13) return [119, param];
      if (sub === 12) return [120, param];
      return null;
    }
    default:
      return null;
  }
}
function isEmpty(cell) {
  return cell.note === 0 && cell.instrument === 0 && cell.effTyp === 0 && cell.eff === 0;
}
const actionamicsEncoder = {
  formatId: "actionamics",
  encodePattern(rows) {
    const buf = [];
    let i = 0;
    while (i < rows.length) {
      const cell = rows[i];
      if (isEmpty(cell)) {
        let runLen = 0;
        while (i + runLen < rows.length && isEmpty(rows[i + runLen]) && runLen < 127) {
          runLen++;
        }
        buf.push(~runLen & 255);
        i += runLen;
        continue;
      }
      const note = xmNoteToAST(cell.note);
      const astEff = xmEffectToAST(cell.effTyp, cell.eff);
      if (note === 0 && astEff) {
        buf.push(astEff[0]);
        buf.push(astEff[1] & 255);
      } else if (note > 0) {
        buf.push(note & 111);
        if (cell.instrument > 0 && cell.instrument <= 111) {
          buf.push(cell.instrument & 111);
          if (astEff) {
            buf.push(astEff[0]);
            buf.push(astEff[1] & 255);
          }
        } else if (astEff) {
          buf.push(astEff[0]);
          buf.push(astEff[1] & 255);
        }
      } else {
        buf.push(254);
      }
      i++;
    }
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(actionamicsEncoder);
export {
  actionamicsEncoder as a
};
