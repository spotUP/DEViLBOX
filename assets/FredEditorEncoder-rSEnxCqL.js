import { c5 as registerVariableEncoder } from "./main-BbV5VyEH.js";
function xmNoteToFE(xmNote) {
  if (xmNote <= 0 || xmNote === 97) return 0;
  const fe = xmNote - 12;
  return fe >= 1 && fe <= 72 ? fe : 0;
}
function s8(value) {
  return value < 0 ? value + 256 : value & 255;
}
const fredEditorEncoder = {
  formatId: "fredEditor",
  encodePattern(rows) {
    const buf = [];
    let lastInstrument = 0;
    let emptyCount = 0;
    function flushEmpty() {
      while (emptyCount > 0) {
        const batch = Math.min(emptyCount, 122);
        buf.push(s8(-(batch + 1)));
        emptyCount -= batch;
      }
    }
    for (const cell of rows) {
      const feNote = xmNoteToFE(cell.note);
      const isNoteOff = cell.note === 97;
      const instrument = cell.instrument ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const isSpeedChange = effTyp === 15 && eff > 0;
      if (isNoteOff) {
        flushEmpty();
        buf.push(s8(-124));
        continue;
      }
      if (isSpeedChange && feNote === 0) {
        flushEmpty();
        buf.push(s8(-126));
        buf.push(eff & 255);
        continue;
      }
      if (feNote > 0) {
        flushEmpty();
        if (instrument > 0 && instrument - 1 !== lastInstrument) {
          buf.push(s8(-125));
          buf.push(instrument - 1 & 255);
          lastInstrument = instrument - 1;
        }
        if (effTyp === 3 && eff > 0) {
          buf.push(s8(-127));
          buf.push(eff & 255);
          buf.push(feNote & 255);
          buf.push(0);
          continue;
        }
        buf.push(feNote & 127);
        if (isSpeedChange) {
          buf.push(s8(-126));
          buf.push(eff & 255);
        }
        continue;
      }
      emptyCount++;
    }
    flushEmpty();
    buf.push(s8(-128));
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(fredEditorEncoder);
export {
  fredEditorEncoder as f
};
