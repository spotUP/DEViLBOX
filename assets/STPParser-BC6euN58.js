import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const STP_NOTE_OFFSET$1 = 25;
function reverseSTPEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };
  switch (effTyp) {
    case 1:
      return { cmd: 1, param: eff };
    case 2:
      return { cmd: 2, param: eff };
    case 3:
      return { cmd: 3, param: eff };
    case 12:
      return { cmd: 4, param: eff };
    case 10: {
      const up = eff >> 4 & 15;
      const down = eff & 15;
      return { cmd: 5, param: down << 4 | up };
    }
    case 11:
      return { cmd: 6, param: eff };
    case 13:
      return { cmd: 7, param: eff };
    case 15:
      return { cmd: 15, param: eff };
    default:
      return { cmd: 0, param: 0 };
  }
}
function encodeSTPCell(cell) {
  const out = new Uint8Array(4);
  out[0] = (cell.instrument ?? 0) & 255;
  const note = cell.note ?? 0;
  if (note > 0 && note >= STP_NOTE_OFFSET$1) {
    out[1] = note - STP_NOTE_OFFSET$1;
  } else {
    out[1] = 0;
  }
  const { cmd, param } = reverseSTPEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = cmd & 255;
  out[3] = param & 255;
  return out;
}
registerPatternEncoder("stp", () => encodeSTPCell);
function u8(v, off) {
  return v.getUint8(off);
}
function u16be(v, off) {
  return v.getUint16(off, false);
}
function u32be(v, off) {
  return v.getUint32(off, false);
}
function readStringFixed(v, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    if (c >= 32) s += String.fromCharCode(c);
  }
  return s.trim();
}
function readStringNull(buf, off, maxLen) {
  let s = "";
  let i = 0;
  while (i < maxLen && off + i < buf.length) {
    const c = buf[off + i];
    i++;
    if (c === 0) break;
    if (c >= 32) s += String.fromCharCode(c);
  }
  return { str: s.trim(), end: off + i };
}
const FILE_HEADER_SIZE = 204;
const STP_MAGIC = [83, 84, 80, 51];
const STP_NOTE_OFFSET = 25;
function convertCIATempo(ciaSpeed) {
  if (ciaSpeed === 0) return 125;
  return Math.round(125 * 3546 / ciaSpeed);
}
function isSTPFormat(buffer) {
  if (buffer.byteLength < FILE_HEADER_SIZE) return false;
  const v = new DataView(buffer);
  for (let i = 0; i < 4; i++) {
    if (v.getUint8(i) !== STP_MAGIC[i]) return false;
  }
  const version = u16be(v, 4);
  const numOrders = u8(v, 6);
  const timerCount = u16be(v, 140);
  const midiCount = u16be(v, 148);
  if (version > 2) return false;
  if (numOrders > 128) return false;
  if (timerCount === 0) return false;
  if (midiCount !== 50) return false;
  return true;
}
async function parseSTPFile(buffer, filename) {
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  if (!isSTPFormat(buffer)) {
    throw new Error("STPParser: invalid STP3 file");
  }
  const version = u16be(v, 4);
  const numOrders = u8(v, 6);
  const defaultPatLen = u8(v, 7);
  const speed = u16be(v, 136);
  const timerCount = u16be(v, 140);
  const numSamples = u16be(v, 200);
  const sampleStructSize = u16be(v, 202);
  const orderList = [];
  for (let i = 0; i < 128; i++) {
    orderList.push(u8(v, 8 + i));
  }
  const songOrders = orderList.slice(0, Math.max(1, numOrders));
  const initialSpeed = Math.max(1, speed);
  const initialBPM = convertCIATempo(timerCount);
  const sampleInfos = /* @__PURE__ */ new Map();
  let cursor = FILE_HEADER_SIZE;
  let maxSampleIndex = 0;
  for (let s = 0; s < numSamples; s++) {
    if (cursor + 2 > buffer.byteLength) break;
    const actualSmp = u16be(v, cursor);
    cursor += 2;
    if (actualSmp === 0 || actualSmp >= 1024) break;
    let chunkSize;
    if (version === 2) {
      if (cursor + 4 > buffer.byteLength) break;
      chunkSize = u32be(v, cursor) - 2;
      cursor += 4;
    } else {
      chunkSize = sampleStructSize;
    }
    const chunkStart = cursor;
    const chunkEnd = Math.min(chunkStart + chunkSize, buffer.byteLength);
    let sampleName = "";
    let samplePath = "";
    let chunkCursor = chunkStart;
    if (version < 2) {
      samplePath = readStringFixed(v, chunkCursor, 31);
      chunkCursor += 31;
      chunkCursor += 1;
      sampleName = readStringFixed(v, chunkCursor, 30);
      chunkCursor += 30;
    } else {
      const pathResult = readStringNull(raw, chunkCursor, 257);
      samplePath = pathResult.str;
      chunkCursor = pathResult.end;
      chunkCursor += 1;
      const nameResult = readStringNull(raw, chunkCursor, 31);
      sampleName = nameResult.str;
      chunkCursor = nameResult.end;
      if ((chunkCursor - chunkStart) % 2 !== 0) chunkCursor++;
    }
    if (chunkCursor + 20 > chunkEnd) {
      cursor = chunkEnd;
      continue;
    }
    const length = u32be(v, chunkCursor);
    const volume = Math.min(u8(v, chunkCursor + 4), 64);
    const loopStart = u32be(v, chunkCursor + 6);
    const loopLength = u32be(v, chunkCursor + 10);
    let loopEnd = loopStart + loopLength;
    let hasLoop = false;
    let effectiveLoopStart = loopStart >= length ? length > 0 ? length - 1 : 0 : loopStart;
    if (loopEnd > length) loopEnd = length;
    if (effectiveLoopStart > loopEnd) {
      effectiveLoopStart = 0;
      loopEnd = 0;
    } else if (loopEnd > effectiveLoopStart) hasLoop = true;
    const finalName = sampleName || samplePath || `Sample ${actualSmp}`;
    sampleInfos.set(actualSmp, {
      index: actualSmp,
      name: finalName,
      length,
      volume,
      loopStart: effectiveLoopStart,
      loopEnd,
      hasLoop
    });
    if (actualSmp > maxSampleIndex) maxSampleIndex = actualSmp;
    cursor = chunkEnd;
    if (version >= 1) {
      if (cursor + 2 > buffer.byteLength) continue;
      const numLoops = u16be(v, cursor);
      cursor += 2;
      const loopListBytes = numLoops * 8;
      if (cursor + loopListBytes > buffer.byteLength) break;
      cursor += loopListBytes;
    }
  }
  const patternArray = [];
  const patIdxToArrayIdx = /* @__PURE__ */ new Map();
  const patternFileOffsets = [];
  const patternChCounts = [];
  let numChannels = 4;
  if (version === 0) {
    if (cursor + 2 > buffer.byteLength) {
      return buildMinimalSong(filename, initialSpeed, initialBPM, sampleInfos, maxSampleIndex);
    }
    const numPatterns = u16be(v, cursor);
    cursor += 2;
    const patLen = defaultPatLen > 0 ? defaultPatLen : 64;
    for (let pat = 0; pat < numPatterns; pat++) {
      const bytesNeeded = numChannels * patLen * 4;
      if (cursor + bytesNeeded > buffer.byteLength) break;
      patternFileOffsets.push(cursor);
      patternChCounts.push(numChannels);
      const channels = parsePatternChannels(v, cursor, numChannels, patLen);
      cursor += bytesNeeded;
      patIdxToArrayIdx.set(pat, patternArray.length);
      patternArray.push({
        id: `pattern-${pat}`,
        name: `Pattern ${pat}`,
        length: patLen,
        channels,
        importMetadata: {
          sourceFormat: "STP",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: numChannels,
          originalPatternCount: numPatterns,
          originalInstrumentCount: maxSampleIndex
        }
      });
    }
  } else {
    const scanStart = cursor;
    let scanPos = scanStart;
    let maxChannels = 4;
    while (scanPos + 6 <= buffer.byteLength) {
      const ap = u16be(v, scanPos);
      scanPos += 2;
      if (ap === 65535) break;
      const pLen = u16be(v, scanPos);
      scanPos += 2;
      const ch = u16be(v, scanPos);
      scanPos += 2;
      if (ch > maxChannels) maxChannels = ch;
      if (ch > 256 || pLen > 1024) break;
      scanPos += ch * pLen * 4;
    }
    numChannels = Math.min(maxChannels, 32);
    cursor = scanStart;
    let totalPatterns = 0;
    while (cursor + 6 <= buffer.byteLength) {
      const actualPat = u16be(v, cursor);
      cursor += 2;
      if (actualPat === 65535) break;
      const patLen = u16be(v, cursor);
      cursor += 2;
      const patCh = u16be(v, cursor);
      cursor += 2;
      if (patCh > 256 || patLen > 1024) break;
      const bytesNeeded = patCh * patLen * 4;
      if (cursor + bytesNeeded > buffer.byteLength) break;
      patternFileOffsets.push(cursor);
      patternChCounts.push(patCh);
      const channels = parsePatternChannels(v, cursor, patCh, patLen);
      cursor += bytesNeeded;
      totalPatterns++;
      patIdxToArrayIdx.set(actualPat, patternArray.length);
      patternArray.push({
        id: `pattern-${actualPat}`,
        name: `Pattern ${actualPat}`,
        length: patLen,
        channels,
        importMetadata: {
          sourceFormat: "STP",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: patCh,
          originalPatternCount: totalPatterns,
          originalInstrumentCount: maxSampleIndex
        }
      });
    }
    while (cursor + 4 <= buffer.byteLength) {
      const scriptNum = u16be(v, cursor);
      if (scriptNum === 65535) {
        cursor += 2;
        break;
      }
      cursor += 2;
      cursor += 2;
      if (cursor + 4 > buffer.byteLength) break;
      const scriptLen = u32be(v, cursor);
      cursor += 4;
      if (cursor + scriptLen > buffer.byteLength) break;
      cursor += scriptLen;
    }
    cursor += 34;
    if (cursor > buffer.byteLength) cursor = buffer.byteLength;
  }
  const songPositions = [];
  for (const patIdx of songOrders) {
    const arrIdx = patIdxToArrayIdx.get(patIdx);
    if (arrIdx !== void 0) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0 && patternArray.length > 0) songPositions.push(0);
  const instruments = [];
  for (let i = 1; i <= maxSampleIndex; i++) {
    const info = sampleInfos.get(i);
    const id = i;
    if (!info || info.length === 0) {
      instruments.push({
        id,
        name: (info == null ? void 0 : info.name) ?? `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    if (cursor + info.length > buffer.byteLength) {
      instruments.push({
        id,
        name: info.name,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      cursor += Math.min(info.length, buffer.byteLength - cursor);
      continue;
    }
    const pcm = raw.slice(cursor, cursor + info.length);
    cursor += info.length;
    instruments.push(
      createSamplerInstrument(
        id,
        info.name,
        pcm,
        info.volume,
        8287,
        // Amiga standard C-3 rate
        info.loopStart,
        info.hasLoop ? info.loopEnd : 0
      )
    );
  }
  const uadePatternLayout = {
    formatId: "stp",
    patternDataFileOffset: patternFileOffsets[0] ?? 0,
    bytesPerCell: 4,
    rowsPerPattern: defaultPatLen > 0 ? defaultPatLen : 64,
    // nominal; actual rows vary
    numChannels,
    numPatterns: patternArray.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSTPCell,
    getCellFileOffset: (pattern, row, channel) => {
      const base = patternFileOffsets[pattern] ?? 0;
      const ch = patternChCounts[pattern] ?? numChannels;
      return base + (row * ch + channel) * 4;
    }
  };
  return {
    name: filename.replace(/\.[^/.]+$/, ""),
    format: "MOD",
    patterns: patternArray.length > 0 ? patternArray : [makeEmptyPattern(filename, numChannels)],
    instruments,
    songPositions: songPositions.length > 0 ? songPositions : [0],
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadePatternLayout
  };
}
function parsePatternChannels(v, dataOff, numCh, numRows, _filename, _patIdx, _totalPats, _totalInstr) {
  const channels = [];
  for (let ch = 0; ch < numCh; ch++) {
    const rows = [];
    for (let row = 0; row < numRows; row++) {
      const cellBase = dataOff + (row * numCh + ch) * 4;
      if (cellBase + 4 > v.byteLength) {
        rows.push(emptyCell());
        continue;
      }
      const instr = u8(v, cellBase);
      const noteRaw = u8(v, cellBase + 1);
      const command = u8(v, cellBase + 2);
      const param = u8(v, cellBase + 3);
      const note = noteRaw > 0 ? STP_NOTE_OFFSET + noteRaw : 0;
      const { effTyp, eff } = convertSTPEffect(command, param);
      rows.push({
        note,
        instrument: instr,
        volume: 0,
        effTyp,
        eff,
        effTyp2: 0,
        eff2: 0
      });
    }
    channels.push({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch % 2 === 0 ? -50 : 50,
      // Amiga LRRL panning
      instrumentId: null,
      color: null,
      rows
    });
  }
  return channels;
}
function convertSTPEffect(command, param) {
  if ((command & 240) === 240) {
    const ciaTempo = (command & 15) << 8 | param;
    if (ciaTempo > 0) {
      const bpm = Math.min(255, Math.max(1, convertCIATempo(ciaTempo)));
      return { effTyp: 15, eff: bpm };
    }
    return { effTyp: 0, eff: 0 };
  }
  const slideDown = param >> 4 & 15;
  const slideUp = param & 15;
  const totalSlide = -slideDown + slideUp;
  const slideParam = totalSlide > 0 ? totalSlide << 4 & 255 : -totalSlide & 255;
  switch (command) {
    case 0:
      return param ? { effTyp: 0, eff: param } : { effTyp: 0, eff: 0 };
    case 1:
      return param ? { effTyp: 1, eff: param } : { effTyp: 0, eff: 0 };
    case 2:
      return param ? { effTyp: 2, eff: param } : { effTyp: 0, eff: 0 };
    case 3:
      return { effTyp: 1, eff: param };
    case 4:
      return { effTyp: 2, eff: param };
    case 5:
      return { effTyp: 1, eff: param };
    case 6:
      return { effTyp: 2, eff: param };
    case 7:
      return { effTyp: 16, eff: Math.min(param, 64) };
    case 8:
      if (totalSlide < 0)
        return { effTyp: 10, eff: -totalSlide & 15 };
      else if (totalSlide > 0)
        return { effTyp: 10, eff: totalSlide << 4 & 255 };
      return { effTyp: 0, eff: 0 };
    case 9:
      return { effTyp: 14, eff: 16 | Math.min(param, 15) };
    case 10:
      return { effTyp: 14, eff: 32 | Math.min(param, 15) };
    case 11:
      if (totalSlide < 0)
        return { effTyp: 10, eff: -totalSlide & 15 };
      else if (totalSlide > 0)
        return { effTyp: 10, eff: totalSlide << 4 & 255 };
      return { effTyp: 0, eff: 0 };
    case 12:
      return { effTyp: 12, eff: Math.min(param, 64) };
    case 13:
      if (totalSlide < 0)
        return { effTyp: 10, eff: slideParam & 15 };
      else if (totalSlide > 0)
        return { effTyp: 10, eff: slideParam & 240 };
      return { effTyp: 0, eff: 0 };
    case 14:
      return { effTyp: 14, eff: param ? 0 : 1 };
    case 15:
      return { effTyp: 15, eff: param >> 4 };
    case 16:
      return { effTyp: 4, eff: param };
    case 17:
      return { effTyp: 7, eff: param };
    case 18:
      return { effTyp: 13, eff: 0 };
    case 19:
      return { effTyp: 3, eff: param };
    case 20:
      return { effTyp: 11, eff: param };
    case 22:
      return { effTyp: 0, eff: 0 };
    case 23:
      return { effTyp: 0, eff: 0 };
    case 24:
      return { effTyp: 0, eff: 0 };
    case 25:
      return { effTyp: 0, eff: 0 };
    case 29:
      if (totalSlide < 0)
        return { effTyp: 14, eff: 176 | -totalSlide & 15 };
      else if (totalSlide > 0)
        return { effTyp: 14, eff: 160 | totalSlide & 15 };
      return { effTyp: 0, eff: 0 };
    case 32:
      if (param & 240)
        return { effTyp: 10, eff: param >> 4 };
      else
        return { effTyp: 14, eff: 192 | param & 15 };
    case 33:
      return { effTyp: 14, eff: 208 | Math.min(param, 15) };
    case 34:
      return { effTyp: 14, eff: 144 | Math.min(param, 15) };
    case 73:
      return { effTyp: 9, eff: param };
    case 78:
      if ((param & 240) === 96 || (param & 240) === 224)
        return { effTyp: 14, eff: param };
      return { effTyp: 0, eff: 0 };
    case 79:
      return { effTyp: 15, eff: param };
    default:
      return { effTyp: 0, eff: 0 };
  }
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeEmptyPattern(filename, numCh) {
  const channels = Array.from({ length: numCh }, (_, ch) => ({
    id: `channel-${ch}`,
    name: `Channel ${ch + 1}`,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: ch % 2 === 0 ? -50 : 50,
    instrumentId: null,
    color: null,
    rows: Array.from({ length: 64 }, () => emptyCell())
  }));
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: 64,
    channels,
    importMetadata: {
      sourceFormat: "STP",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numCh,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
}
function buildMinimalSong(filename, initialSpeed, initialBPM, sampleInfos, maxSampleIndex, _raw, _buffer) {
  const instruments = [];
  for (let i = 1; i <= maxSampleIndex; i++) {
    const info = sampleInfos.get(i);
    instruments.push({
      id: i,
      name: (info == null ? void 0 : info.name) ?? `Sample ${i}`,
      type: "sample",
      synthType: "Sampler",
      effects: [],
      volume: -60,
      pan: 0
    });
  }
  const pat = makeEmptyPattern(filename, 4);
  return {
    name: filename.replace(/\.[^/.]+$/, ""),
    format: "MOD",
    patterns: [pat],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed,
    initialBPM,
    linearPeriods: false
  };
}
export {
  isSTPFormat,
  parseSTPFile
};
