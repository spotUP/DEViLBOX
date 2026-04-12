import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function reverseEffect(effTyp, eff, isGTK) {
  switch (effTyp) {
    case 0:
      return eff ? [16, eff] : [0, 0];
    case 1:
      return [1, eff];
    case 2:
      return [2, eff];
    case 3:
      return [3, eff];
    case 4:
      return [4, eff];
    case 7:
      return [7, eff];
    case 8:
      if (!isGTK) {
        const pan12 = Math.min(eff * 16, 4095);
        return [64 | pan12 >> 8 & 15, pan12 & 255];
      }
      return [0, 0];
    case 10:
      if ((eff & 240) > 0) return [20, eff >> 4 & 15];
      if ((eff & 15) > 0) return [21, eff & 15];
      return [0, 0];
    case 11:
      return [11, eff];
    case 12: {
      const vol12 = Math.min(eff * 4, 4095);
      return [32 | vol12 >> 8 & 15, vol12 & 255];
    }
    case 13:
      return [13, eff];
    case 14: {
      const subCmd = eff >> 4 & 15;
      const subParam = eff & 15;
      if (subCmd === 13) return [9, subParam];
      if (subCmd === 11 && !isGTK) return [177, subParam];
      if (subCmd === 14 && !isGTK) return [170, subParam];
      return [0, 0];
    }
    case 15:
      return [15, eff];
    case 20:
      return [10, 0];
    case 27:
      return [112 | eff & 15, 0];
    default:
      return [0, 0];
  }
}
function encodeGTK4Cell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note > 0 && note <= 96) {
    const raw = note - 37;
    if (raw >= 24 && raw < 84) out[0] = raw;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  const [eff, param] = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0, true);
  out[2] = eff & 255;
  out[3] = param & 255;
  return out;
}
function encodeGTK5Cell(cell) {
  const out = new Uint8Array(5);
  const note = cell.note ?? 0;
  if (note > 0 && note <= 96) {
    const raw = note - 37;
    if (raw >= 24 && raw < 84) out[0] = raw;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  const [eff, param] = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0, true);
  out[2] = eff & 255;
  out[3] = param & 255;
  const vol = cell.volume ?? 0;
  if (vol > 0) {
    out[4] = Math.max(1, Math.min(255, vol * 4 - 1));
  }
  return out;
}
function encodeGT2Cell(cell) {
  const out = new Uint8Array(5);
  const note = cell.note ?? 0;
  if (note > 0 && note <= 120) {
    out[0] = note - 1;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  const [eff, param] = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0, false);
  out[2] = eff & 255;
  out[3] = param & 255;
  const vol = cell.volume ?? 0;
  if (vol > 0) {
    out[4] = Math.min(255, vol + 16);
  }
  return out;
}
registerPatternEncoder("graoumfTracker2_gtk4", () => encodeGTK4Cell);
registerPatternEncoder("graoumfTracker2_gtk5", () => encodeGTK5Cell);
registerPatternEncoder("graoumfTracker2_gt2", () => encodeGT2Cell);
function u8(buf, off) {
  return buf[off] ?? 0;
}
function u16be(buf, off) {
  return (buf[off] ?? 0) << 8 | (buf[off + 1] ?? 0);
}
function u32be(buf, off) {
  return ((buf[off] ?? 0) << 24 | (buf[off + 1] ?? 0) << 16 | (buf[off + 2] ?? 0) << 8 | (buf[off + 3] ?? 0)) >>> 0;
}
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i] ?? 0;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
const GTK_HEADER_SIZE = 206;
function readGTKHeader(buf) {
  if (buf.length < GTK_HEADER_SIZE) return null;
  if (buf[0] !== 71 || buf[1] !== 84 || buf[2] !== 75) return null;
  const fileVersion = u8(buf, 3);
  if (fileVersion < 1 || fileVersion > 4) return null;
  const songName = readString(buf, 4, 32);
  const numSamples = u16be(buf, 196);
  const numRows = u16be(buf, 198);
  const numChannels = u16be(buf, 200);
  const numOrders = u16be(buf, 202);
  const restartPos = u16be(buf, 204);
  if (numSamples > 255) return null;
  if (numRows === 0 || numRows > 256) return null;
  if (numChannels === 0 || numChannels > 32) return null;
  if (numOrders > 256) return null;
  if (numOrders > 0 && restartPos >= numOrders) return null;
  return { fileVersion, songName, numSamples, numRows, numChannels, numOrders, restartPos };
}
const GT2_HEADER_SIZE = 236;
function readGT2Header(buf) {
  if (buf.length < GT2_HEADER_SIZE) return null;
  if (buf[0] !== 71 || buf[1] !== 84 || buf[2] !== 50) return null;
  const fileVersion = u8(buf, 3);
  if (fileVersion > 9) return null;
  const headerSize = u32be(buf, 4);
  const songName = readString(buf, 8, 32);
  const year = u16be(buf, 202);
  if (year < 1980 || year > 9999) return null;
  const speed = fileVersion <= 5 ? u16be(buf, 228) : 6;
  const tempo = fileVersion <= 5 ? u16be(buf, 230) : 125;
  const masterVol = fileVersion <= 5 ? u16be(buf, 232) : 4095;
  const numPannedTracks = fileVersion <= 5 ? u16be(buf, 234) : 0;
  if (fileVersion <= 5) {
    if (speed === 0 || tempo === 0) return null;
    if (masterVol > 4095) return null;
    if (numPannedTracks > 99) return null;
  }
  return { fileVersion, headerSize, songName, speed, tempo, masterVol, numPannedTracks };
}
function isGraoumfTracker2Format(bytes) {
  if (bytes.length < 10) return false;
  if (bytes[0] === 71 && bytes[1] === 84 && bytes[2] === 50) {
    return readGT2Header(bytes) !== null;
  }
  if (bytes[0] === 71 && bytes[1] === 84 && bytes[2] === 75) {
    return readGTKHeader(bytes) !== null;
  }
  return false;
}
function translateEffect(effect, param, isGTK) {
  if (!effect) return { effTyp: 0, eff: 0 };
  if (effect >= 176 && isGTK) return { effTyp: 0, eff: 0 };
  const param12bit = (effect & 15) << 8 | param;
  const param4bitSlide = Math.min(param, 14);
  switch (effect >> 4) {
    case 2:
      return { effTyp: 12, eff: Math.min(Math.trunc(param12bit / 4), 64) };
    case 4:
      return { effTyp: 8, eff: Math.min(Math.trunc(param12bit / 16), 255) };
    case 7:
      return { effTyp: 27, eff: effect & 15 };
  }
  switch (effect) {
    case 1:
      return { effTyp: 1, eff: param };
    case 2:
      return { effTyp: 2, eff: param };
    case 3:
      return { effTyp: 3, eff: param };
    case 4:
      return { effTyp: 4, eff: param };
    case 7:
      return { effTyp: 7, eff: param };
    case 11:
      return { effTyp: 11, eff: param };
    case 13:
      return { effTyp: 13, eff: param };
    case 15:
      return { effTyp: 15, eff: param };
    case 9:
      return { effTyp: 14, eff: 208 | Math.min(param, 15) };
    case 10:
      return { effTyp: 20, eff: 0 };
    case 16:
      return { effTyp: 0, eff: param };
    case 20:
      return { effTyp: 10, eff: param4bitSlide << 4 };
    case 21:
      return { effTyp: 10, eff: param4bitSlide };
    case 170:
      return { effTyp: 14, eff: 224 | Math.min(param, 15) };
    case 168:
      if (param > 0) return { effTyp: 15, eff: param };
      return { effTyp: 0, eff: 0 };
    case 177:
      return { effTyp: 14, eff: 176 | Math.min(param, 15) };
    default:
      return { effTyp: 0, eff: 0 };
  }
}
function parseGTKFile(buf, filename) {
  const hdr = readGTKHeader(buf);
  if (!hdr) return null;
  const { fileVersion, songName, numSamples, numRows, numChannels, numOrders, restartPos } = hdr;
  const sampleHeaderSize = fileVersion < 3 ? 48 : 64;
  const minAdditional = sampleHeaderSize * numSamples + 512 + (fileVersion < 4 ? 4 : 5) * numRows * numChannels;
  if (buf.length < GTK_HEADER_SIZE + minAdditional) return null;
  let pos = GTK_HEADER_SIZE;
  const sampleMetas = [];
  for (let s = 0; s < numSamples; s++) {
    const sampleBase = pos;
    const nameLen = fileVersion === 1 ? 32 : 28;
    const name = readString(buf, sampleBase, nameLen);
    let defaultPan = -1;
    let bytesPerSample = 1;
    let sampleRate = 8363;
    let ptr = sampleBase + nameLen;
    if (fileVersion >= 3) {
      ptr += 14;
      const pan = u8(buf, ptr) << 8 | u8(buf, ptr + 1);
      defaultPan = pan >= 32768 ? pan - 65536 : pan;
      ptr += 2;
    }
    if (fileVersion >= 2) {
      bytesPerSample = u16be(buf, ptr);
      ptr += 2;
      sampleRate = u16be(buf, ptr) * 2;
      ptr += 2;
    }
    const length = u32be(buf, ptr);
    ptr += 4;
    const loopStart = u32be(buf, ptr);
    ptr += 4;
    const loopLen = u32be(buf, ptr);
    ptr += 4;
    const volume = u16be(buf, ptr);
    ptr += 2;
    const finetune = u16be(buf, ptr) >= 32768 ? u16be(buf, ptr) - 65536 : u16be(buf, ptr);
    ptr += 2;
    let numLength = length;
    let numLoopStart = loopStart;
    let numLoopEnd = loopStart + loopLen;
    const has16bit = bytesPerSample === 2;
    if (has16bit) {
      numLength /= 2;
      numLoopStart /= 2;
      numLoopEnd /= 2;
    }
    const hasLoop = loopStart > 0 || loopLen > 2;
    sampleMetas.push({
      name,
      length: numLength,
      loopStart: numLoopStart,
      loopEnd: numLoopEnd,
      hasLoop,
      volume,
      finetune,
      bits: has16bit ? 16 : 8,
      sampleRate,
      defaultPan
    });
    pos += sampleHeaderSize;
  }
  const orderBuf = buf.slice(pos, pos + 512);
  pos += 512;
  const orders = [];
  for (let i = 0; i < numOrders; i++) {
    orders.push(u16be(orderBuf, i * 2));
  }
  const numPatterns = orders.length > 0 ? Math.max(...orders) + 1 : 0;
  const eventSize = fileVersion < 4 ? 4 : 5;
  const isGTK = true;
  const patternDataFileOffset = pos;
  const rawPatterns = [];
  for (let pat = 0; pat < numPatterns; pat++) {
    const cells = [];
    for (let row = 0; row < numRows; row++) {
      const rowCells = [];
      for (let chn = 0; chn < numChannels; chn++) {
        const off = pos + (row * numChannels + chn) * eventSize;
        if (off + eventSize > buf.length) {
          rowCells.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const data0 = u8(buf, off);
        const data1 = u8(buf, off + 1);
        const data2 = u8(buf, off + 2);
        const data3 = u8(buf, off + 3);
        const data4 = eventSize >= 5 ? u8(buf, off + 4) : 0;
        let note = 0;
        if (data0 >= 24 && data0 < 84) {
          note = data0 + 13;
        }
        const instr = data1;
        const { effTyp, eff } = translateEffect(data2, data3, isGTK);
        let volCmdTyp = 0;
        let volCmdVal = 0;
        if (data4 > 0) {
          volCmdTyp = 12;
          volCmdVal = Math.min(Math.trunc((data4 + 1) / 4), 64);
        }
        rowCells.push({
          note,
          instrument: instr,
          volume: volCmdTyp === 12 ? volCmdVal : 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
      cells.push(rowCells);
    }
    rawPatterns.push(cells);
    pos += numRows * numChannels * eventSize;
  }
  const sampleData = [];
  for (const meta of sampleMetas) {
    if (meta.length === 0 || pos >= buf.length) {
      sampleData.push(new Uint8Array(0));
      continue;
    }
    const byteLen = meta.bits === 16 ? meta.length * 2 : meta.length;
    const avail = Math.min(byteLen, buf.length - pos);
    sampleData.push(buf.slice(pos, pos + avail));
    pos += byteLen;
  }
  const instruments = [];
  for (let i = 0; i < numSamples; i++) {
    const meta = sampleMetas[i];
    const pcm = sampleData[i];
    const id = i + 1;
    if (!pcm || pcm.length === 0) {
      instruments.push({
        id,
        name: meta.name || `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: 0,
        pan: 0,
        uadeChipRam: { moduleBase: 0, moduleSize: buf.length, instrBase: GTK_HEADER_SIZE + i * sampleHeaderSize, instrSize: sampleHeaderSize }
      });
      continue;
    }
    let mono8;
    if (meta.bits === 16) {
      mono8 = new Uint8Array(pcm.length / 2);
      for (let j = 0; j < mono8.length; j++) {
        mono8[j] = pcm[j * 2] ?? 0;
      }
    } else {
      mono8 = pcm;
    }
    const vol = meta.volume > 0 ? Math.min(meta.volume, 64) : 64;
    const loopStart = meta.hasLoop ? meta.loopStart : 0;
    const loopEnd = meta.hasLoop ? meta.loopEnd : 0;
    const rate = meta.sampleRate > 0 ? meta.sampleRate : 8363;
    const _gtkChipRam = { moduleBase: 0, moduleSize: buf.length, instrBase: GTK_HEADER_SIZE + i * sampleHeaderSize, instrSize: sampleHeaderSize, sections: {} };
    const _gtkInst = createSamplerInstrument(id, meta.name || "Sample " + id, mono8, vol, rate, loopStart, loopEnd);
    instruments.push({ ..._gtkInst, uadeChipRam: _gtkChipRam });
  }
  const defaultPanning = [];
  for (let c = 0; c < numChannels; c++) {
    const mod4 = c % 4;
    defaultPanning.push(mod4 === 0 || mod4 === 3 ? -64 : 64);
  }
  const patterns = orders.map((patIdx, ordIdx) => {
    const rawPat = patIdx < rawPatterns.length ? rawPatterns[patIdx] : null;
    const channels = Array.from({ length: numChannels }, (_, ch) => {
      const rows = Array.from({ length: numRows }, (_2, row) => {
        if (!rawPat || !rawPat[row] || !rawPat[row][ch]) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }
        return rawPat[row][ch];
      });
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: defaultPanning[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows
      };
    });
    return {
      id: `pattern-${ordIdx}`,
      name: `Pattern ${ordIdx}`,
      length: numRows,
      channels,
      importMetadata: {
        sourceFormat: "GraoumfTracker",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numSamples
      }
    };
  });
  if (patterns.length === 0) {
    patterns.push(makeEmptyPattern(numChannels, numRows, filename, 0, 0));
  }
  const uadePatternLayout = {
    formatId: eventSize === 4 ? "graoumfTracker2_gtk4" : "graoumfTracker2_gtk5",
    patternDataFileOffset,
    bytesPerCell: eventSize,
    rowsPerPattern: numRows,
    numChannels,
    numPatterns,
    moduleSize: buf.length,
    encodeCell: eventSize === 4 ? encodeGTK4Cell : encodeGTK5Cell,
    getCellFileOffset: (pattern, row, channel) => {
      const patIdx = orders[pattern] ?? 0;
      return patternDataFileOffset + patIdx * numRows * numChannels * eventSize + row * numChannels * eventSize + channel * eventSize;
    }
  };
  return {
    name: songName || filename.replace(/\.[^/.]+$/, ""),
    format: "MOD",
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: restartPos,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePatternLayout
  };
}
const CHUNK_TCN2 = 1413697074;
const CHUNK_TVOL = 1414942540;
const CHUNK_MIXP = 1296652368;
const CHUNK_SONG = 1397706311;
const CHUNK_PATS = 1346458707;
const CHUNK_PATD = 1346458692;
const CHUNK_TNAM = 1414414669;
const CHUNK_INST = 1229869908;
const CHUNK_SAMP = 1396788560;
const CHUNK_SAM2 = 1396788530;
const CHUNK_ENDC = 1162757187;
function readGT2Chunks(buf, startOff) {
  const chunks = [];
  let pos = startOff;
  while (pos + 8 <= buf.length) {
    const id = u32be(buf, pos);
    const rawLen = u32be(buf, pos + 4);
    const payLen = Math.max(rawLen, 8) - 8;
    chunks.push({ id, length: payLen, offset: pos + 8 });
    pos += 8 + payLen;
    if (id === CHUNK_ENDC) break;
  }
  return chunks;
}
function findChunk(chunks, id) {
  return chunks.find((c) => c.id === id);
}
function findAllChunks(chunks, id) {
  return chunks.filter((c) => c.id === id);
}
function parseGT2File(buf, filename) {
  const hdr = readGT2Header(buf);
  if (!hdr) return null;
  const { fileVersion, headerSize, songName, speed, tempo, numPannedTracks } = hdr;
  const pannedTracksOff = GT2_HEADER_SIZE;
  const pannedTracks = [];
  if (fileVersion <= 5) {
    for (let i = 0; i < numPannedTracks; i++) {
      pannedTracks.push(u16be(buf, pannedTracksOff + i * 2));
    }
  }
  const chunkStart = Math.max(headerSize, GT2_HEADER_SIZE);
  const chunks = readGT2Chunks(buf, chunkStart);
  const patsChunk = findChunk(chunks, CHUNK_PATS);
  if (!patsChunk || patsChunk.length < 2) return null;
  const numChannels = u16be(buf, patsChunk.offset);
  if (numChannels < 1 || numChannels > 32) return null;
  const songChunk = findChunk(chunks, CHUNK_SONG);
  if (!songChunk || songChunk.length < 2) return null;
  let soff = songChunk.offset;
  const numOrders = u16be(buf, soff);
  soff += 2;
  const restartPos = u16be(buf, soff);
  soff += 2;
  const orders = [];
  const maxOrders = Math.min(numOrders, Math.trunc((songChunk.length - 4) / 2));
  for (let i = 0; i < maxOrders; i++) {
    orders.push(u16be(buf, soff + i * 2));
  }
  let initialBPM = Math.max(tempo, 1);
  let initialSpeed = Math.max(speed, 1);
  const tcn2Chunk = findChunk(chunks, CHUNK_TCN2);
  if (tcn2Chunk && tcn2Chunk.length >= 12) {
    const t = tcn2Chunk.offset;
    const bpmInt = u16be(buf, t + 2);
    const spd = u16be(buf, t + 6);
    if (bpmInt >= 32 && bpmInt <= 999) initialBPM = bpmInt;
    if (spd >= 1 && spd <= 255) initialSpeed = spd;
  }
  const channelPan = [];
  for (let c = 0; c < numChannels; c++) {
    if (fileVersion <= 5 && c < pannedTracks.length) {
      const pan256 = Math.min(Math.trunc(pannedTracks[c] * 256 / 4095), 256);
      channelPan.push(pan256 - 128);
    } else {
      const mod4 = c % 4;
      channelPan.push(mod4 === 0 || mod4 === 3 ? -64 : 64);
    }
  }
  const tvolChunk = findChunk(chunks, CHUNK_TVOL);
  const channelVol = new Array(numChannels).fill(100);
  if (tvolChunk && tvolChunk.length >= 2) {
    const cnt = Math.min(u16be(buf, tvolChunk.offset), numChannels);
    for (let c = 0; c < cnt; c++) {
      if (tvolChunk.offset + 2 + c * 2 + 1 < buf.length) {
        const raw = u16be(buf, tvolChunk.offset + 2 + c * 2);
        channelVol[c] = Math.min(Math.trunc(raw / 4096 * 100), 100);
      }
    }
  }
  const mixpChunk = findChunk(chunks, CHUNK_MIXP);
  if (mixpChunk && mixpChunk.length >= 56) {
    const m = mixpChunk.offset;
    const trackType = u16be(buf, m + 34);
    const version = u16be(buf, m + 50);
    if (trackType === 4 && version === 257) {
      const numTracks = u16be(buf, m + 38);
      for (let i = 0; i < numTracks; i++) {
        const trackOff = m + 56 + i * 8;
        if (trackOff + 7 >= buf.length) break;
        const ttype = u8(buf, trackOff);
        const tidx = u16be(buf, trackOff + 2);
        const tvol = u16be(buf, trackOff + 4);
        const tbal = u16be(buf, trackOff + 6);
        if (ttype === 0 && tidx < numChannels) {
          const pan256 = Math.min(Math.trunc(tbal * 256 / 4095), 256);
          channelPan[tidx] = pan256 - 128;
          channelVol[tidx] = Math.min(Math.trunc(tvol * 64 / 4096), 64);
        }
      }
    }
  }
  const sampleMap = /* @__PURE__ */ new Map();
  for (const smpChunk of findAllChunks(chunks, CHUNK_SAM2)) {
    if (smpChunk.length < 78) continue;
    const b = smpChunk.offset;
    const smpNum = u16be(buf, b);
    if (!smpNum || smpNum >= 1e3) continue;
    const name = readString(buf, b + 2, 28);
    const type = u16be(buf, b + 30);
    const bits = u16be(buf, b + 32);
    const numChan = u16be(buf, b + 36);
    const volume = u16be(buf, b + 40);
    const loopType = u16be(buf, b + 44);
    const sampleCoding = u16be(buf, b + 48);
    const sampleFreq = u32be(buf, b + 54) * 2;
    const length = u32be(buf, b + 58);
    const loopStart = u32be(buf, b + 62);
    const loopLen = u32be(buf, b + 66);
    const dataOffset = u32be(buf, b + 74);
    if (sampleCoding > 1 || type > 1) continue;
    if (type !== 0) continue;
    const loopEnd = loopStart + loopLen;
    const hasLoop = loopType !== 0;
    const pcmOff = smpChunk.offset - 8 + (dataOffset - 8);
    let pcmLen = 0;
    if (bits === 8) {
      pcmLen = length;
    } else {
      pcmLen = length * 2;
    }
    if (numChan === 2) pcmLen *= 2;
    let pcm = new Uint8Array(0);
    if (pcmOff >= 0 && pcmOff < buf.length && pcmLen > 0) {
      const avail = Math.min(pcmLen, buf.length - pcmOff);
      pcm = buf.slice(pcmOff, pcmOff + avail);
    }
    const isStereo = numChan === 2;
    const isPingpong = (loopType & 2) !== 0;
    sampleMap.set(smpNum, {
      smpNum,
      name,
      bits: bits === 16 ? 16 : 8,
      sampleFreq,
      length,
      loopStart,
      loopEnd,
      hasLoop,
      volume: Math.min(volume, 255),
      stereo: isStereo,
      pingpong: isPingpong,
      instrBase: b,
      instrSize: 78,
      pcm
    });
  }
  for (const smpChunk of findAllChunks(chunks, CHUNK_SAMP)) {
    if (smpChunk.length < 56) continue;
    const b = smpChunk.offset;
    const smpNum = u16be(buf, b);
    if (!smpNum || smpNum >= 1e3 || sampleMap.has(smpNum)) continue;
    const name = readString(buf, b + 2, 28);
    const flags = u16be(buf, b + 30);
    const bits = u16be(buf, b + 34);
    const sampleFreq = u16be(buf, b + 36) * 2;
    const length = u32be(buf, b + 38);
    const loopStart = u32be(buf, b + 42);
    const loopLen = u32be(buf, b + 46);
    const volume = u16be(buf, b + 50);
    const sampleCoding = u16be(buf, b + 54);
    if (sampleCoding !== 0) continue;
    const isStereo = (flags & 1) !== 0;
    const isPingpong = (flags & 2) !== 0;
    let numLength = length;
    let numLoopStart = loopStart;
    let numLoopEnd = loopStart + loopLen;
    if (bits === 16) {
      numLength /= 2;
      numLoopStart /= 2;
      numLoopEnd /= 2;
    }
    const hasLoop = loopStart > 0 || loopLen > 2;
    const pcmOff = b + 56;
    let pcmLen = bits === 16 ? length : length;
    if (bits !== 16) pcmLen = length;
    else pcmLen = length;
    if (isStereo) pcmLen *= 2;
    let pcm = new Uint8Array(0);
    if (pcmOff < buf.length && pcmLen > 0) {
      const avail = Math.min(pcmLen, buf.length - pcmOff);
      pcm = buf.slice(pcmOff, pcmOff + avail);
    }
    sampleMap.set(smpNum, {
      smpNum,
      name,
      bits: bits === 16 ? 16 : 8,
      sampleFreq,
      length: numLength,
      loopStart: numLoopStart,
      loopEnd: numLoopEnd,
      hasLoop,
      volume: Math.min(Math.abs(volume), 255),
      stereo: isStereo,
      pingpong: isPingpong,
      instrBase: b,
      instrSize: 56,
      pcm
    });
  }
  const instrMap = /* @__PURE__ */ new Map();
  for (const insChunk of findAllChunks(chunks, CHUNK_INST)) {
    if (insChunk.length < 308) continue;
    const b = insChunk.offset;
    const insNum = u16be(buf, b);
    if (!insNum) continue;
    const name = readString(buf, b + 2, 28);
    const type = u16be(buf, b + 30);
    if (type !== 0) continue;
    const samples = [];
    for (let n = 0; n < 128; n++) {
      samples.push(u8(buf, b + 52 + n * 2));
    }
    instrMap.set(insNum, { insNum, name, samples, instrBase: b });
  }
  const instruments = [];
  if (instrMap.size > 0) {
    const sortedInstrNums = Array.from(instrMap.keys()).sort((a, b) => a - b);
    for (const insNum of sortedInstrNums) {
      const instr = instrMap.get(insNum);
      let smpNum = instr.samples[60] || instr.samples[48] || instr.samples.find((s) => s !== 0) || 0;
      const smpData = smpNum > 0 ? sampleMap.get(smpNum) : void 0;
      if (!smpData || smpData.pcm.length === 0) {
        instruments.push({
          id: insNum,
          name: instr.name || `Instrument ${insNum}`,
          type: "sample",
          synthType: "Sampler",
          effects: [],
          volume: 0,
          pan: 0,
          uadeChipRam: { moduleBase: 0, moduleSize: buf.length, instrBase: instr.instrBase, instrSize: 308 }
        });
        continue;
      }
      const mono8 = toMono8(smpData);
      const vol = smpData.volume > 0 ? Math.min(smpData.volume / 4, 64) : 64;
      const rate = smpData.sampleFreq > 0 ? smpData.sampleFreq : 8363;
      const _gt2iInst = createSamplerInstrument(insNum, instr.name || "Instrument " + insNum, mono8, vol, rate, smpData.hasLoop ? smpData.loopStart : 0, smpData.hasLoop ? smpData.loopEnd : 0);
      instruments.push({ ..._gt2iInst, uadeChipRam: { moduleBase: 0, moduleSize: buf.length, instrBase: instr.instrBase, instrSize: 308 } });
    }
  } else {
    const sortedSmpNums = Array.from(sampleMap.keys()).sort((a, b) => a - b);
    for (const smpNum of sortedSmpNums) {
      const smpData = sampleMap.get(smpNum);
      if (smpData.pcm.length === 0) {
        instruments.push({
          id: smpNum,
          name: smpData.name || `Sample ${smpNum}`,
          type: "sample",
          synthType: "Sampler",
          effects: [],
          volume: 0,
          pan: 0,
          uadeChipRam: { moduleBase: 0, moduleSize: buf.length, instrBase: smpData.instrBase, instrSize: smpData.instrSize }
        });
        continue;
      }
      const mono8 = toMono8(smpData);
      const vol = smpData.volume > 0 ? Math.min(smpData.volume / 4, 64) : 64;
      const rate = smpData.sampleFreq > 0 ? smpData.sampleFreq : 8363;
      const _gt2sInst = createSamplerInstrument(smpNum, smpData.name || "Sample " + smpNum, mono8, vol, rate, smpData.hasLoop ? smpData.loopStart : 0, smpData.hasLoop ? smpData.loopEnd : 0);
      instruments.push({ ..._gt2sInst, uadeChipRam: { moduleBase: 0, moduleSize: buf.length, instrBase: smpData.instrBase, instrSize: smpData.instrSize } });
    }
  }
  const numOrderPatterns = orders.length > 0 ? Math.max(...orders) + 1 : 0;
  const rawPatterns = /* @__PURE__ */ new Map();
  const patdOffsets = /* @__PURE__ */ new Map();
  for (const patChunk of findAllChunks(chunks, CHUNK_PATD)) {
    if (patChunk.length < 24) continue;
    const b = patChunk.offset;
    const patNum = u16be(buf, b);
    const codingVersion = u16be(buf, b + 18);
    const numRows = u16be(buf, b + 20);
    const numTracks = u16be(buf, b + 22);
    if (codingVersion > 1) continue;
    if (numRows === 0 || numTracks === 0) continue;
    const cellsNeeded = numRows * numTracks * 5;
    if (patChunk.length < 24 + cellsNeeded) continue;
    patdOffsets.set(patNum, { cellsFileOffset: b + 24, numTracks, numRows });
    const cells = [];
    for (let row = 0; row < numRows; row++) {
      const rowCells = [];
      for (let chn = 0; chn < numTracks; chn++) {
        const off = b + 24 + (row * numTracks + chn) * 5;
        const data0 = u8(buf, off);
        const data1 = u8(buf, off + 1);
        const data2 = u8(buf, off + 2);
        const data3 = u8(buf, off + 3);
        const data4 = u8(buf, off + 4);
        let note = 0;
        if (data0 > 0 && data0 <= 120) {
          note = data0 + 1;
        }
        const instr = data1;
        const { effTyp, eff } = translateEffect(data2, data3, false);
        let volVal = 0;
        if (data4 > 0) {
          if (codingVersion === 0) {
            volVal = Math.min(Math.trunc(data4 / 4), 64);
          } else {
            volVal = Math.max(data4 - 16, 0);
          }
        }
        rowCells.push({
          note,
          instrument: instr,
          volume: data4 > 0 ? volVal : 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
      cells.push(rowCells);
    }
    rawPatterns.set(patNum, cells);
  }
  const firstPat = rawPatterns.values().next().value;
  const defaultRows = firstPat ? firstPat.length : 64;
  const channelNames = new Array(numChannels).fill("");
  const tnamChunk = findChunk(chunks, CHUNK_TNAM);
  if (tnamChunk && tnamChunk.length >= 2) {
    const numNames = u16be(buf, tnamChunk.offset);
    for (let i = 0; i < numNames; i++) {
      const base = tnamChunk.offset + 2 + i * 36;
      if (base + 35 >= buf.length) break;
      const ttype = u16be(buf, base);
      const tnum = u16be(buf, base + 2);
      if (ttype === 0 && tnum < numChannels) {
        channelNames[tnum] = readString(buf, base + 4, 32);
      }
    }
  }
  const patterns = orders.map((patIdx, ordIdx) => {
    const rawPat = rawPatterns.get(patIdx);
    const numRows = rawPat ? rawPat.length : defaultRows;
    const channels = Array.from({ length: numChannels }, (_, ch) => {
      const rows = Array.from({ length: numRows }, (_2, row) => {
        if (!rawPat || !rawPat[row]) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }
        return rawPat[row][ch] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
      });
      return {
        id: `channel-${ch}`,
        name: channelNames[ch] || `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: channelVol[ch] ?? 100,
        pan: channelPan[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows
      };
    });
    return {
      id: `pattern-${ordIdx}`,
      name: `Pattern ${ordIdx}`,
      length: numRows,
      channels,
      importMetadata: {
        sourceFormat: "GraoumfTracker2",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numOrderPatterns,
        originalInstrumentCount: instrMap.size > 0 ? instrMap.size : sampleMap.size
      }
    };
  });
  if (patterns.length === 0) {
    patterns.push(makeEmptyPattern(numChannels, defaultRows, filename, 0, 0));
  }
  const gt2PatternLayout = {
    formatId: "graoumfTracker2_gt2",
    patternDataFileOffset: 0,
    // GT2 uses IFF chunks; getCellFileOffset handles offsets
    bytesPerCell: 5,
    rowsPerPattern: defaultRows,
    numChannels,
    numPatterns: numOrderPatterns,
    moduleSize: buf.length,
    encodeCell: encodeGT2Cell,
    getCellFileOffset: (pattern, row, channel) => {
      const patIdx = orders[pattern] ?? 0;
      const patInfo = patdOffsets.get(patIdx);
      if (!patInfo) return 0;
      return patInfo.cellsFileOffset + (row * patInfo.numTracks + channel) * 5;
    }
  };
  return {
    name: songName || filename.replace(/\.[^/.]+$/, ""),
    format: "MOD",
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: Math.min(restartPos, Math.max(patterns.length - 1, 0)),
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadePatternLayout: gt2PatternLayout
  };
}
function toMono8(smp) {
  const { pcm, bits, stereo } = smp;
  if (bits === 8 && !stereo) return pcm;
  let samples;
  if (bits === 16) {
    const count = Math.trunc(pcm.length / 2);
    samples = [];
    for (let i = 0; i < count; i++) {
      const hi = pcm[i * 2] ?? 0;
      const lo = pcm[i * 2 + 1] ?? 0;
      const s16 = (hi < 128 ? hi : hi - 256) * 256 + lo;
      samples.push(Math.round(s16 / 256) + 128);
    }
  } else {
    samples = Array.from(pcm);
  }
  if (stereo) {
    const mono = [];
    for (let i = 0; i < samples.length - 1; i += 2) {
      const l = (samples[i] ?? 128) - 128;
      const r = (samples[i + 1] ?? 128) - 128;
      mono.push(Math.round((l + r) / 2) + 128);
    }
    return new Uint8Array(mono);
  }
  return new Uint8Array(samples);
}
function makeEmptyPattern(numChannels, numRows, filename, channelCount, patternCount) {
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: numRows,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: numRows }, () => ({
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
      sourceFormat: "GraoumfTracker2",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: channelCount,
      originalPatternCount: patternCount,
      originalInstrumentCount: 0
    }
  };
}
function parseGraoumfTracker2File(bytes, filename) {
  try {
    if (!bytes || bytes.length < 10) return null;
    if (bytes[0] === 71 && bytes[1] === 84 && bytes[2] === 50) {
      return parseGT2File(bytes, filename);
    }
    if (bytes[0] === 71 && bytes[1] === 84 && bytes[2] === 75) {
      return parseGTKFile(bytes, filename);
    }
    return null;
  } catch {
    return null;
  }
}
export {
  isGraoumfTracker2Format,
  parseGraoumfTracker2File
};
