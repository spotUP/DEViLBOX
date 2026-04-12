import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const XM_NOTE_OFF$1 = 97;
function reverseRTMEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };
  switch (effTyp) {
    case 10:
      return { cmd: 36, param: eff };
    // volume slide
    case 1:
      return { cmd: 37, param: eff };
    // portamento up
    case 2:
      return { cmd: 38, param: eff };
    // portamento down
    case 6:
      return { cmd: 39, param: eff };
  }
  if (effTyp === 8) {
    return { cmd: 8, param: Math.min(127, Math.round(eff / 2)) };
  }
  if (effTyp >= 1 && effTyp <= 33) {
    return { cmd: effTyp, param: eff };
  }
  if (effTyp === 15) {
    return { cmd: 40, param: eff };
  }
  return { cmd: 0, param: 0 };
}
function encodeRTMChannel(rows, channel) {
  const parts = [];
  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const e1 = reverseRTMEffect(cell.effTyp ?? 0, cell.eff ?? 0);
    const e2 = reverseRTMEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
    const hasNote = note !== 0;
    const hasInstr = instr !== 0;
    const hasCmd1 = e1.cmd !== 0;
    const hasParam1 = e1.param !== 0;
    const hasCmd2 = e2.cmd !== 0;
    const hasParam2 = e2.param !== 0;
    if (!hasNote && !hasInstr && !hasCmd1 && !hasParam1 && !hasCmd2 && !hasParam2) {
      parts.push(0);
      continue;
    }
    let flags = 1;
    if (hasNote) flags |= 2;
    if (hasInstr) flags |= 4;
    if (hasCmd1) flags |= 8;
    if (hasParam1) flags |= 16;
    if (hasCmd2) flags |= 32;
    if (hasParam2) flags |= 64;
    parts.push(flags);
    parts.push(channel);
    if (hasNote) {
      if (note === XM_NOTE_OFF$1) {
        parts.push(254);
      } else {
        parts.push(Math.max(0, note - 1));
      }
    }
    if (hasInstr) parts.push(instr);
    if (hasCmd1) parts.push(e1.cmd);
    if (hasParam1) parts.push(e1.param);
    if (hasCmd2) parts.push(e2.cmd);
    if (hasParam2) parts.push(e2.param);
    parts.push(0);
  }
  return new Uint8Array(parts);
}
const rtmEncoder = {
  formatId: "rtm",
  encodePattern(rows, channel) {
    return encodeRTMChannel(rows, channel);
  }
};
registerVariableEncoder(rtmEncoder);
function u8(v, off) {
  return v.getUint8(off);
}
function u16le(v, off) {
  return v.getUint16(off, true);
}
function u32le(v, off) {
  return v.getUint32(off, true);
}
function i8(v, off) {
  return v.getInt8(off);
}
function readNullTermString(v, offset, maxLen) {
  let s = "";
  for (let i = 0; i < maxLen; i++) {
    const c = v.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
const OBJ_HDR_SIZE = 42;
const RTMM_HDR_SIZE = 130;
const RTMM_MIN_OBJ = 98;
const XM_NOTE_OFF = 97;
const RTM_NOTE_OFFSET = 1;
const DEFAULT_C5_SPEED = 8363;
const SONG_LINEAR_SLIDES = 1;
const RTSM_SMP_16BIT = 2;
const RTSM_SMP_DELTA = 4;
function readObjectHeader(v, offset) {
  const id = String.fromCharCode(
    u8(v, offset),
    u8(v, offset + 1),
    u8(v, offset + 2),
    u8(v, offset + 3)
  );
  return {
    id,
    space: u8(v, offset + 4),
    name: readNullTermString(v, offset + 5, 32),
    eof: u8(v, offset + 37),
    version: u16le(v, offset + 38),
    objectSize: u16le(v, offset + 40)
  };
}
function isMainHeaderValid(hdr) {
  return hdr.id === "RTMM" && hdr.space === 32 && hdr.eof === 26 && hdr.version >= 256 && hdr.version <= 274 && hdr.objectSize >= RTMM_MIN_OBJ;
}
function isRTMFormat(buffer) {
  if (buffer.byteLength < OBJ_HDR_SIZE + 4) return false;
  const v = new DataView(buffer);
  try {
    return isMainHeaderValid(readObjectHeader(v, 0));
  } catch {
    return false;
  }
}
function readRTMMHeader(v, bodyStart, availableBytes) {
  const o = bodyStart;
  const has = (need) => availableBytes >= need;
  const software = readNullTermString(v, o + 0, 20);
  const composer = has(52) ? readNullTermString(v, o + 20, 32) : "";
  const flags = has(54) ? u16le(v, o + 52) : 0;
  const numChannels = has(55) ? u8(v, o + 54) : 0;
  const numInstruments = has(56) ? u8(v, o + 55) : 0;
  const numOrders = has(58) ? u16le(v, o + 56) : 0;
  const numPatterns = has(60) ? u16le(v, o + 58) : 0;
  const speed = has(61) ? u8(v, o + 60) : 6;
  const tempo = has(62) ? u8(v, o + 61) : 125;
  const panning = [];
  for (let i = 0; i < 32; i++) {
    panning.push(has(63 + i) ? i8(v, o + 62 + i) : 0);
  }
  const extraDataSize = has(98) ? u32le(v, o + 94) : 0;
  const originalName = has(130) ? readNullTermString(v, o + 98, 32) : "";
  return {
    software,
    composer,
    flags,
    numChannels,
    numInstruments,
    numOrders,
    numPatterns,
    speed,
    tempo,
    panning,
    extraDataSize,
    originalName
  };
}
function readPatternHeader(v, offset) {
  return {
    flags: u16le(v, offset + 0),
    numTracks: u8(v, offset + 2),
    numRows: u16le(v, offset + 3),
    packedSize: u32le(v, offset + 5)
  };
}
function readInstrumentHeader(v, offset, availableBytes) {
  return {
    numSamples: availableBytes > 0 ? u8(v, offset) : 0,
    flags: availableBytes > 2 ? u16le(v, offset + 1) : 0
  };
}
function readSampleHeader(v, offset) {
  return {
    flags: u16le(v, offset + 0),
    baseVolume: u8(v, offset + 2),
    defaultVolume: u8(v, offset + 3),
    length: u32le(v, offset + 4),
    loopType: u8(v, offset + 8),
    loopStart: u32le(v, offset + 12),
    loopEnd: u32le(v, offset + 16),
    sampleRate: u32le(v, offset + 20),
    baseNote: u8(v, offset + 24),
    panning: i8(v, offset + 25)
  };
}
function convertRTMEffect(cmd, param) {
  if (cmd === 0 && param === 0) return { effTyp: 0, eff: 0 };
  if (cmd === 8) {
    return { effTyp: 8, eff: Math.min(255, param * 2) };
  }
  const S_CMD = "S".charCodeAt(0) - 55;
  if (cmd === S_CMD && (param & 240) === 160) {
    return { effTyp: 19, eff: param };
  }
  const X_CMD = "X".charCodeAt(0) - 55;
  if (cmd >= 1 && cmd <= X_CMD) {
    return { effTyp: cmd, eff: param };
  }
  switch (cmd) {
    case 36:
      return { effTyp: 10, eff: param };
    // volume slide  (Dxx in XM)
    case 37:
      return { effTyp: 1, eff: param };
    // portamento up (1xx)
    case 38:
      return { effTyp: 2, eff: param };
    // portamento dn (2xx)
    case 39:
      return { effTyp: 6, eff: param };
    // vibrato+vol   (6xx)
    case 40:
      return { effTyp: 15, eff: param };
    // set speed     (Fxx)
    default:
      return { effTyp: 0, eff: 0 };
  }
}
function decodeDelta8(src) {
  const out = new Uint8Array(src.length);
  let acc = 0;
  for (let i = 0; i < src.length; i++) {
    const delta = src[i] < 128 ? src[i] : src[i] - 256;
    acc = acc + delta & 255;
    out[i] = acc;
  }
  return out;
}
function decodeDelta16(src) {
  const out = new Uint8Array(src.length);
  const outView = new DataView(out.buffer);
  let acc = 0;
  for (let i = 0; i + 1 < src.length; i += 2) {
    const raw16 = src[i + 1] << 8 | src[i];
    const delta = raw16 < 32768 ? raw16 : raw16 - 65536;
    acc = acc + delta & 65535;
    const signed = acc < 32768 ? acc : acc - 65536;
    outView.setInt16(i, signed, true);
  }
  return out;
}
function rtmPanToChannelPan(rtmPan) {
  const panValue = Math.min(255, (rtmPan + 64) * 2);
  return Math.round((panValue / 128 - 1) * 100);
}
function blankInstrument(id, name) {
  return {
    id,
    name,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: -60,
    pan: 0
  };
}
async function parseRTMFile(buffer, filename) {
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  if (buffer.byteLength < OBJ_HDR_SIZE) {
    throw new Error("RTMParser: file too small for RTMObjectHeader");
  }
  const fileHdr = readObjectHeader(v, 0);
  if (!isMainHeaderValid(fileHdr)) {
    throw new Error("RTMParser: invalid RTMM object header");
  }
  const songBodyStart = OBJ_HDR_SIZE;
  const songBodyLen = Math.min(fileHdr.objectSize, RTMM_HDR_SIZE);
  if (buffer.byteLength < songBodyStart + songBodyLen) {
    throw new Error("RTMParser: file truncated reading RTMMHeader");
  }
  const songHdr = readRTMMHeader(v, songBodyStart, songBodyLen);
  if (songHdr.numChannels === 0 || songHdr.numChannels > 32) {
    throw new Error(`RTMParser: invalid numChannels (${songHdr.numChannels})`);
  }
  if (songHdr.speed === 0) {
    throw new Error("RTMParser: invalid speed (0)");
  }
  let cursor = OBJ_HDR_SIZE + fileHdr.objectSize;
  const extraStart = cursor;
  const extraEnd = extraStart + songHdr.extraDataSize;
  const orderList = [];
  let extraCursor = extraStart;
  for (let i = 0; i < songHdr.numOrders && extraCursor + 2 <= extraEnd && extraCursor + 2 <= buffer.byteLength; i++) {
    orderList.push(u16le(v, extraCursor));
    extraCursor += 2;
  }
  cursor = extraEnd;
  let songName = fileHdr.name;
  if (!songName && fileHdr.version >= 274) {
    songName = songHdr.originalName;
  }
  if (!songName) {
    songName = filename.replace(/\.[^/.]+$/i, "");
  }
  const numChannels = songHdr.numChannels;
  const numPatterns = songHdr.numPatterns;
  const numInstruments = songHdr.numInstruments;
  const patterns = [];
  const patternFileAddrs = [];
  const patternFileSizes = [];
  const patternRowCounts = [];
  for (let pat = 0; pat < numPatterns; pat++) {
    if (cursor + OBJ_HDR_SIZE > buffer.byteLength) break;
    const patObjHdr = readObjectHeader(v, cursor);
    cursor += OBJ_HDR_SIZE;
    if (cursor + 9 > buffer.byteLength) break;
    const patHdr = readPatternHeader(v, cursor);
    cursor += patObjHdr.objectSize;
    const packedStart = cursor;
    cursor += patHdr.packedSize;
    const packedEnd = cursor;
    patternFileAddrs.push(packedStart);
    patternFileSizes.push(patHdr.packedSize);
    const numRows = Math.max(1, patHdr.numRows);
    patternRowCounts.push(numRows);
    const grid = Array.from(
      { length: numRows },
      () => Array.from({ length: numChannels }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }))
    );
    let pPos = packedStart;
    let row = 0;
    let chn = 0;
    while (row < numRows && pPos < packedEnd) {
      const b = u8(v, pPos++);
      if (b === 0) {
        row++;
        chn = 0;
        continue;
      }
      if (b & 1) {
        if (pPos >= packedEnd) break;
        chn = u8(v, pPos++);
      }
      if (chn >= numChannels) break;
      const cell = grid[row][chn];
      if (b & 2) {
        if (pPos >= packedEnd) break;
        const nr = u8(v, pPos++);
        if (nr === 254) {
          cell.note = XM_NOTE_OFF;
        } else if (nr < 120) {
          cell.note = nr + RTM_NOTE_OFFSET;
        }
      }
      if (b & 4) {
        if (pPos >= packedEnd) break;
        cell.instrument = u8(v, pPos++);
      }
      let cmd1 = 0, param1 = 0, cmd2 = 0, param2 = 0;
      if (b & 8) {
        if (pPos >= packedEnd) break;
        cmd1 = u8(v, pPos++);
      }
      if (b & 16) {
        if (pPos >= packedEnd) break;
        param1 = u8(v, pPos++);
      }
      if (b & 32) {
        if (pPos >= packedEnd) break;
        cmd2 = u8(v, pPos++);
      }
      if (b & 64) {
        if (pPos >= packedEnd) break;
        param2 = u8(v, pPos++);
      }
      if (cmd1 !== 0 || param1 !== 0) {
        const e1 = convertRTMEffect(cmd1, param1);
        cell.effTyp = e1.effTyp;
        cell.eff = e1.eff;
      }
      if (cmd2 !== 0 || param2 !== 0) {
        const e2 = convertRTMEffect(cmd2, param2);
        cell.effTyp2 = e2.effTyp;
        cell.eff2 = e2.eff;
      }
      chn++;
    }
    const channels = Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: rtmPanToChannelPan(songHdr.panning[ch] ?? 0),
      instrumentId: null,
      color: null,
      rows: grid.map((r) => r[ch])
    }));
    patterns.push({
      id: `pattern-${pat}`,
      name: patObjHdr.name || `Pattern ${pat}`,
      length: numRows,
      channels,
      importMetadata: {
        sourceFormat: "RTM",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numInstruments
      }
    });
  }
  const maxPatIdx = Math.max(0, patterns.length - 1);
  const songPositions = orderList.map((idx) => Math.min(idx, maxPatIdx));
  const instruments = [];
  let sampleSeq = 0;
  for (let instr = 0; instr < numInstruments; instr++) {
    if (cursor + OBJ_HDR_SIZE > buffer.byteLength) break;
    const insObjHdr = readObjectHeader(v, cursor);
    cursor += OBJ_HDR_SIZE;
    const insBodyLen = Math.min(insObjHdr.objectSize, 341);
    if (cursor + insBodyLen > buffer.byteLength) {
      instruments.push(blankInstrument(sampleSeq + 1, insObjHdr.name || `Instrument ${instr + 1}`));
      sampleSeq++;
      break;
    }
    const insHdr = readInstrumentHeader(v, cursor, insBodyLen);
    cursor += insObjHdr.objectSize;
    const instrName = insObjHdr.name || `Instrument ${instr + 1}`;
    const numSamples = insHdr.numSamples;
    if (numSamples === 0) {
      instruments.push(blankInstrument(sampleSeq + 1, instrName));
      sampleSeq++;
      continue;
    }
    for (let smp = 0; smp < numSamples; smp++) {
      const sampleId = sampleSeq + 1;
      sampleSeq++;
      if (cursor + OBJ_HDR_SIZE > buffer.byteLength) {
        instruments.push(blankInstrument(sampleId, instrName));
        continue;
      }
      const smpObjHdr = readObjectHeader(v, cursor);
      cursor += OBJ_HDR_SIZE;
      const smpBodyLen = Math.min(smpObjHdr.objectSize, 26);
      if (cursor + smpBodyLen > buffer.byteLength) {
        instruments.push(blankInstrument(sampleId, instrName));
        cursor += smpObjHdr.objectSize;
        continue;
      }
      const smpHdr = readSampleHeader(v, cursor);
      cursor += smpObjHdr.objectSize;
      const rawByteLen = smpHdr.length;
      const is16bit = (smpHdr.flags & RTSM_SMP_16BIT) !== 0;
      const isDelta = (smpHdr.flags & RTSM_SMP_DELTA) !== 0;
      if (rawByteLen === 0 || cursor + rawByteLen > buffer.byteLength) {
        instruments.push(blankInstrument(sampleId, instrName));
        cursor += rawByteLen;
        continue;
      }
      const sampleName = smpObjHdr.name || instrName;
      const sampleRate = smpHdr.sampleRate > 0 ? smpHdr.sampleRate : DEFAULT_C5_SPEED;
      let pcm8;
      let loopStartFrames;
      let loopEndFrames;
      if (is16bit) {
        let raw16 = new Uint8Array(raw.buffer, raw.byteOffset + cursor, rawByteLen);
        if (isDelta) raw16 = decodeDelta16(raw16);
        const numFrames = Math.floor(raw16.length / 2);
        pcm8 = new Uint8Array(numFrames);
        for (let f = 0; f < numFrames; f++) {
          const lo = raw16[f * 2];
          const hi = raw16[f * 2 + 1];
          const s16 = hi << 8 | lo;
          const signed16 = s16 < 32768 ? s16 : s16 - 65536;
          const signed8 = Math.round(signed16 / 256);
          pcm8[f] = signed8 < 0 ? signed8 + 256 : signed8;
        }
        loopStartFrames = Math.floor(smpHdr.loopStart / 2);
        loopEndFrames = Math.floor(smpHdr.loopEnd / 2);
      } else {
        let rawSmp = new Uint8Array(raw.buffer, raw.byteOffset + cursor, rawByteLen);
        if (isDelta) rawSmp = decodeDelta8(rawSmp);
        pcm8 = rawSmp;
        loopStartFrames = smpHdr.loopStart;
        loopEndFrames = smpHdr.loopEnd;
      }
      const hasLoop = smpHdr.loopType !== 0 && loopEndFrames > loopStartFrames;
      instruments.push(createSamplerInstrument(
        sampleId,
        sampleName,
        pcm8,
        smpHdr.defaultVolume,
        // 0–64, matches createSamplerInstrument's volume scale
        sampleRate,
        hasLoop ? loopStartFrames : 0,
        hasLoop ? loopEndFrames : 0
      ));
      cursor += rawByteLen;
    }
  }
  return {
    name: songName,
    format: "XM",
    // RTM effects are XM-compatible
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: songHdr.speed,
    initialBPM: songHdr.tempo,
    linearPeriods: (songHdr.flags & SONG_LINEAR_SLIDES) !== 0,
    uadeVariableLayout: {
      formatId: "rtm",
      numChannels,
      numFilePatterns: numPatterns,
      rowsPerPattern: patternRowCounts,
      moduleSize: buffer.byteLength,
      encoder: rtmEncoder,
      filePatternAddrs: patternFileAddrs,
      filePatternSizes: patternFileSizes,
      trackMap: Array.from(
        { length: numPatterns },
        (_, p) => Array.from({ length: numChannels }, (__, _ch) => p)
      )
    }
  };
}
export {
  isRTMFormat,
  parseRTMFile
};
