import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function xmNoteToPuma(xmNote) {
  if (xmNote <= 0) return 0;
  const raw = (xmNote - 12) * 2;
  return Math.max(0, Math.min(254, raw & 254));
}
function xmEffectToPuma(effTyp, eff) {
  switch (effTyp) {
    case 12:
      return [1, Math.min(eff, 64)];
    // Set volume
    case 2:
      return [2, eff];
    // Pitch slide down
    case 1:
      return [3, eff];
    // Pitch slide up
    case 3:
      return [4, eff];
    // Portamento
    default:
      return [0, 0];
  }
}
function cellToEntry(cell) {
  const noteX2 = xmNoteToPuma(cell.note);
  const [eff, param] = xmEffectToPuma(cell.effTyp, cell.eff);
  const instr = cell.instrument & 31;
  const instrEffect = instr << 3 | eff & 7;
  return { noteX2, instrEffect, param };
}
function entriesEqual(a, b) {
  return a.noteX2 === b.noteX2 && a.instrEffect === b.instrEffect && a.param === b.param;
}
const pumaTrackerEncoder = {
  formatId: "pumaTracker",
  encodePattern(rows) {
    if (rows.length === 0) return new Uint8Array(0);
    const entries = [];
    let current = cellToEntry(rows[0]);
    let runLen = 1;
    for (let i = 1; i < rows.length; i++) {
      const next = cellToEntry(rows[i]);
      if (entriesEqual(current, next) && runLen < 64) {
        runLen++;
      } else {
        entries.push({ entry: current, runLen });
        current = next;
        runLen = 1;
      }
    }
    entries.push({ entry: current, runLen });
    const buf = new Uint8Array(entries.length * 4);
    for (let i = 0; i < entries.length; i++) {
      const { entry, runLen: len } = entries[i];
      buf[i * 4] = entry.noteX2;
      buf[i * 4 + 1] = entry.instrEffect;
      buf[i * 4 + 2] = entry.param;
      buf[i * 4 + 3] = len;
    }
    return buf;
  }
};
registerVariableEncoder(pumaTrackerEncoder);
function u8(view, off) {
  return view.getUint8(off);
}
function s8(view, off) {
  return view.getInt8(off);
}
function u16(view, off) {
  return view.getUint16(off, false);
}
function u32(view, off) {
  return view.getUint32(off, false);
}
function readMagic(view, off, magic) {
  if (off + magic.length > view.byteLength) return false;
  for (let i = 0; i < magic.length; i++) {
    if (view.getUint8(off + i) !== magic.charCodeAt(i)) return false;
  }
  return true;
}
const HEADER_SIZE = 80;
const ORDER_ENTRY_SIZE = 14;
const NUM_ROWS = 32;
const BUILTIN_WAVEFORMS = [
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 63, 55, 47, 39, 31, 23, 15, 7, 255, 7, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 55, 47, 39, 31, 23, 15, 7, 255, 7, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 47, 39, 31, 23, 15, 7, 255, 7, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 39, 31, 23, 15, 7, 255, 7, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 31, 23, 15, 7, 255, 7, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 23, 15, 7, 255, 7, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 15, 7, 255, 7, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 144, 7, 255, 7, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 144, 136, 255, 7, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 144, 136, 128, 7, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 144, 136, 128, 136, 15, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 144, 136, 128, 136, 144, 23, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 144, 136, 128, 136, 144, 152, 31, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 144, 136, 128, 136, 144, 152, 160, 39, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 144, 136, 128, 136, 144, 152, 160, 168, 47, 55]),
  new Uint8Array([192, 192, 208, 216, 224, 232, 240, 248, 0, 248, 240, 232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 144, 136, 128, 136, 144, 152, 160, 168, 176, 55]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127, 127]),
  new Uint8Array([129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 127, 127, 127]),
  new Uint8Array([128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 127, 127]),
  new Uint8Array([128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 127]),
  new Uint8Array([128, 128, 128, 128, 128, 128, 128, 128, 127, 127, 127, 127, 127, 127, 127, 127, 128, 128, 128, 128, 128, 128, 128, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([128, 128, 128, 128, 128, 128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 128, 128, 128, 128, 128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([128, 128, 128, 128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 128, 128, 128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([128, 128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 128, 128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127]),
  new Uint8Array([128, 128, 144, 152, 160, 168, 176, 184, 192, 200, 208, 216, 224, 232, 240, 248, 0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 127]),
  new Uint8Array([128, 128, 160, 176, 192, 208, 224, 240, 0, 16, 32, 48, 64, 80, 96, 112, 69, 69, 121, 125, 122, 119, 112, 102, 97, 88, 83, 77, 44, 32, 24, 18]),
  new Uint8Array([4, 219, 211, 205, 198, 188, 181, 174, 168, 163, 157, 153, 147, 142, 139, 138, 69, 69, 121, 125, 122, 119, 112, 102, 91, 75, 67, 55, 44, 32, 24, 18]),
  new Uint8Array([4, 248, 232, 219, 207, 198, 190, 176, 168, 164, 158, 154, 149, 148, 141, 131, 0, 0, 64, 96, 127, 96, 64, 32, 0, 224, 192, 160, 128, 160, 192, 224]),
  new Uint8Array([0, 0, 64, 96, 127, 96, 64, 32, 0, 224, 192, 160, 128, 160, 192, 224, 128, 128, 144, 152, 160, 168, 176, 184, 192, 200, 208, 216, 224, 232, 240, 248]),
  new Uint8Array([0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 127, 128, 128, 160, 176, 192, 208, 224, 240, 0, 16, 32, 48, 64, 80, 96, 112])
];
function isPumaTrackerFormat(buffer) {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const view = new DataView(buffer);
  for (let i = 0; i < 12; i++) {
    const c = u8(view, i);
    if (c !== 0 && c < 32) return false;
  }
  const lastOrder = u16(view, 12);
  const numPatterns = u16(view, 14);
  const numInstruments = u16(view, 16);
  const unknown = u16(view, 18);
  if (lastOrder > 255) return false;
  if (!numPatterns || numPatterns > 128) return false;
  if (!numInstruments || numInstruments > 32) return false;
  if (unknown !== 0) return false;
  const numOrders = lastOrder + 1;
  const minAdditional = numOrders * ORDER_ENTRY_SIZE + numPatterns * 8 + 4 + numInstruments * 16 + 4;
  const minSampleOffset = HEADER_SIZE + minAdditional;
  for (let i = 0; i < 10; i++) {
    const sampleLen = u16(view, 20 + 40 + i * 2);
    const sampleOff = u32(view, 20 + i * 4);
    if (sampleLen > 0 && !sampleOff) return false;
    if (sampleOff > 1048576) return false;
    if (sampleOff > 0 && sampleOff < minSampleOffset) return false;
  }
  if (HEADER_SIZE + numOrders * ORDER_ENTRY_SIZE > buffer.byteLength) return false;
  const probeCount = Math.min(numOrders, 4);
  for (let ord = 0; ord < probeCount; ord++) {
    const base = HEADER_SIZE + ord * ORDER_ENTRY_SIZE;
    let valid = true;
    for (let ch = 0; ch < 4; ch++) {
      const pattern = u8(view, base + ch * 3);
      const noteTranspose = s8(view, base + ch * 3 + 2);
      if (pattern >= 128) {
        valid = false;
        break;
      }
      if ((noteTranspose & 1) !== 0) {
        valid = false;
        break;
      }
      if (noteTranspose < -48 || noteTranspose > 48) {
        valid = false;
        break;
      }
    }
    if (!valid) return false;
    const speed = u8(view, base + 12);
    const zero = u8(view, base + 13);
    if (speed > 15 || zero !== 0) return false;
  }
  return true;
}
function parseVolScript(view, pos) {
  const limit = view.byteLength;
  let waveformIndex = -1;
  let isFirst = true;
  while (pos + 4 <= limit) {
    const cmd = u8(view, pos);
    if (isFirst && cmd !== 192) return { waveformIndex: -1, endPos: pos };
    switch (cmd) {
      case 160:
        pos += 4;
        break;
      case 176:
        return { waveformIndex, endPos: pos + 4 };
      case 192:
        if (isFirst) waveformIndex = u8(view, pos + 1);
        pos += 4;
        break;
      case 224:
        return { waveformIndex, endPos: pos + 4 };
      default:
        return { waveformIndex, endPos: pos };
    }
    isFirst = false;
  }
  return { waveformIndex, endPos: pos };
}
function skipPitchScript(view, pos) {
  const limit = view.byteLength;
  while (pos + 4 <= limit) {
    const cmd = u8(view, pos);
    switch (cmd) {
      case 160:
        pos += 4;
        break;
      case 176:
        return pos + 4;
      case 208:
        if (u8(view, pos + 1) & 1) return pos;
        pos += 4;
        break;
      case 224:
        return pos + 4;
      default: {
        if (readMagic(view, pos, "inst")) return pos;
        return pos;
      }
    }
  }
  return pos;
}
async function parsePumaTrackerFile(buffer, filename) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (!isPumaTrackerFormat(buffer)) {
    throw new Error("PumaTracker: invalid file format");
  }
  let songName = "";
  for (let i = 0; i < 12; i++) {
    const c = u8(view, i);
    if (c === 0) break;
    songName += String.fromCharCode(c);
  }
  const lastOrder = u16(view, 12);
  const numPatterns = u16(view, 14);
  const numInstruments = u16(view, 16);
  const numOrders = lastOrder + 1;
  const sampleOffsets = [];
  const sampleLengths = [];
  for (let i = 0; i < 10; i++) {
    sampleOffsets.push(u32(view, 20 + i * 4));
    sampleLengths.push(u16(view, 60 + i * 2) * 2);
  }
  const orders = [];
  let pos = HEADER_SIZE;
  for (let ord = 0; ord < numOrders; ord++) {
    const channels = [];
    for (let ch = 0; ch < 4; ch++) {
      channels.push({
        pattern: u8(view, pos + ch * 3),
        instrTranspose: s8(view, pos + ch * 3 + 1),
        noteTranspose: s8(view, pos + ch * 3 + 2)
      });
    }
    const speed = u8(view, pos + 12);
    orders.push({ channels, speed });
    pos += ORDER_ENTRY_SIZE;
  }
  const patternData = [];
  const filePatternAddrs = [];
  const filePatternSizes = [];
  for (let p = 0; p < numPatterns; p++) {
    if (!readMagic(view, pos, "patt")) {
      throw new Error(`PumaTracker: expected "patt" at 0x${pos.toString(16)}`);
    }
    pos += 4;
    const dataStart = pos;
    const rows = new Array(NUM_ROWS).fill(null).map(() => ({ noteX2: 0, instrEffect: 0, param: 0 }));
    let row = 0;
    while (row < NUM_ROWS && pos + 4 <= buffer.byteLength) {
      const noteX2 = u8(view, pos);
      const instrEffect = u8(view, pos + 1);
      const param = u8(view, pos + 2);
      const runLen = u8(view, pos + 3);
      pos += 4;
      if (noteX2 & 1) throw new Error(`PumaTracker: odd note byte at pattern ${p}`);
      if (!runLen || runLen > NUM_ROWS - row) throw new Error(`PumaTracker: bad runLen ${runLen} at pattern ${p} row ${row}`);
      for (let r = 0; r < runLen; r++) {
        rows[row + r] = { noteX2, instrEffect, param };
      }
      row += runLen;
    }
    filePatternAddrs.push(dataStart);
    filePatternSizes.push(pos - dataStart);
    patternData.push(rows);
  }
  if (!readMagic(view, pos, "patt")) {
    throw new Error(`PumaTracker: expected terminating "patt" at 0x${pos.toString(16)}`);
  }
  pos += 4;
  const waveformIndices = [];
  const instrOffsets = [];
  for (let ins = 0; ins < numInstruments; ins++) {
    if (!readMagic(view, pos, "inst")) {
      throw new Error(`PumaTracker: expected "inst" at 0x${pos.toString(16)} (instrument ${ins})`);
    }
    const instrStart = pos;
    pos += 4;
    const volResult = parseVolScript(view, pos);
    pos = volResult.endPos;
    waveformIndices.push(volResult.waveformIndex);
    if (!readMagic(view, pos, "insf")) {
      throw new Error(`PumaTracker: expected "insf" at 0x${pos.toString(16)} (instrument ${ins})`);
    }
    pos += 4;
    pos = skipPitchScript(view, pos);
    instrOffsets.push({ start: instrStart, end: pos });
  }
  if (!readMagic(view, pos, "inst")) {
    console.warn(`PumaTracker: expected terminating "inst" at 0x${pos.toString(16)}`);
  }
  const pcmSamples = [];
  for (let i = 0; i < 10; i++) {
    const len = sampleLengths[i];
    const off = sampleOffsets[i];
    if (!len || !off || off >= buffer.byteLength) {
      pcmSamples.push(null);
    } else {
      const avail = Math.min(len, buffer.byteLength - off);
      pcmSamples.push(bytes.slice(off, off + avail));
    }
  }
  const instruments = [];
  for (let ins = 0; ins < numInstruments; ins++) {
    const wfIdx = waveformIndices[ins];
    const id = ins + 1;
    const name2 = `Instrument ${id}`;
    let pcm = null;
    let loopStart = 0;
    let loopEnd = 0;
    if (wfIdx >= 0 && wfIdx < 10) {
      pcm = pcmSamples[wfIdx];
      loopStart = 0;
      loopEnd = 0;
    } else if (wfIdx >= 10 && wfIdx < 52) {
      pcm = BUILTIN_WAVEFORMS[wfIdx - 10];
      loopStart = 0;
      loopEnd = 32;
    }
    const pumaInstrOffset = instrOffsets[ins];
    const pumaChipRam = {
      moduleBase: 0,
      moduleSize: buffer.byteLength,
      instrBase: pumaInstrOffset ? pumaInstrOffset.start : 0,
      instrSize: pumaInstrOffset ? pumaInstrOffset.end - pumaInstrOffset.start : 0,
      sections: {}
    };
    if (!pcm || pcm.length === 0) {
      const pumaEmptyInst = {
        id,
        name: name2,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      };
      pumaEmptyInst.uadeChipRam = pumaChipRam;
      instruments.push(pumaEmptyInst);
    } else {
      const pumaSamplerInst = createSamplerInstrument(
        id,
        name2,
        pcm,
        64,
        // volume (full; actual volume controlled by vol script at runtime)
        8363,
        // Amiga ProTracker standard sample rate (A-3 = 8363 Hz)
        loopStart,
        loopEnd
      );
      pumaSamplerInst.uadeChipRam = pumaChipRam;
      instruments.push(pumaSamplerInst);
    }
  }
  const PANNING = [-50, 50, 50, -50];
  const patterns = orders.map((order, ordIdx) => {
    const channels = Array.from({ length: 4 }, (_, ch) => {
      const chnInfo = order.channels[ch];
      const rawPatt = chnInfo.pattern < patternData.length ? patternData[chnInfo.pattern] : null;
      let autoPorta = 0;
      const rows = Array.from({ length: NUM_ROWS }, (_2, row) => {
        const cell = {
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        };
        if (ch === 0 && row === 0 && order.speed > 0) {
          cell.effTyp = 15;
          cell.eff = order.speed;
        }
        if (!rawPatt) return cell;
        const p = rawPatt[row];
        if (p.noteX2) {
          const raw = p.noteX2 + chnInfo.noteTranspose;
          cell.note = Math.max(1, 12 + Math.trunc(raw / 2));
        }
        const rawInstr = p.instrEffect & 31;
        if (rawInstr !== 0) {
          cell.instrument = rawInstr + chnInfo.instrTranspose & 31;
        }
        const effType = p.instrEffect >> 5 & 7;
        const param = p.param;
        let hasExplicitPorta = false;
        switch (effType) {
          case 1:
            cell.effTyp = 12;
            cell.eff = Math.min(param, 64);
            autoPorta = 0;
            break;
          case 2:
            if (param > 0) {
              cell.effTyp = 2;
              cell.eff = param;
              autoPorta = 1;
              hasExplicitPorta = true;
            } else {
              autoPorta = 0;
            }
            break;
          case 3:
            if (param > 0) {
              cell.effTyp = 1;
              cell.eff = param;
              autoPorta = 2;
              hasExplicitPorta = true;
            } else {
              autoPorta = 0;
            }
            break;
        }
        if (!hasExplicitPorta) {
          if (p.noteX2) {
            autoPorta = 0;
          } else if (autoPorta === 1) {
            cell.effTyp2 = 2;
            cell.eff2 = 0;
          } else if (autoPorta === 2) {
            cell.effTyp2 = 1;
            cell.eff2 = 0;
          }
        }
        return cell;
      });
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows
      };
    });
    return {
      id: `pattern-${ordIdx}`,
      name: `Pattern ${ordIdx}`,
      length: NUM_ROWS,
      channels,
      importMetadata: {
        sourceFormat: "PumaTracker",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numInstruments
      }
    };
  });
  if (patterns.length === 0) {
    patterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: NUM_ROWS,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows: Array.from({ length: NUM_ROWS }, () => ({
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        }))
      })),
      importMetadata: {
        sourceFormat: "PumaTracker",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const songPositions = patterns.map((_, i) => i);
  const name = songName.trim() || filename.replace(/\.[^/.]+$/, "");
  const trackMap = orders.map(
    (order) => order.channels.map((ch) => ch.pattern < numPatterns ? ch.pattern : -1)
  );
  const variableLayout = {
    formatId: "pumaTracker",
    numChannels: 4,
    numFilePatterns: numPatterns,
    rowsPerPattern: NUM_ROWS,
    moduleSize: buffer.byteLength,
    encoder: pumaTrackerEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    pumaTrackerFileData: buffer.slice(0),
    uadeVariableLayout: variableLayout
  };
}
export {
  isPumaTrackerFormat,
  parsePumaTrackerFile
};
