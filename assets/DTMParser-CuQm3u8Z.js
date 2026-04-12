import { b$ as registerPatternEncoder, c6 as encodeMODCell, c2 as createSamplerInstrument, c3 as periodToNoteIndex, c7 as amigaNoteToXM } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeDTM204Cell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note > 0 && note >= 37) {
    const raw = note - 36;
    const octave = Math.floor(raw / 12);
    const semi = raw % 12;
    out[0] = (octave & 15) << 4 | semi & 15;
  } else {
    out[0] = 0;
  }
  const vol = Math.min(62, cell.volume ?? 0);
  const instr = cell.instrument ?? 0;
  out[1] = vol + 1 << 2 | instr >> 4 & 3;
  out[2] = (instr & 15) << 4 | (cell.effTyp ?? 0) & 15;
  out[3] = (cell.eff ?? 0) & 255;
  return out;
}
registerPatternEncoder("dtm_pt", () => encodeMODCell);
registerPatternEncoder("dtm_204", () => encodeDTM204Cell);
function u8(v, off) {
  return v.getUint8(off);
}
function u16(v, off) {
  return v.getUint16(off, false);
}
function u32(v, off) {
  return v.getUint32(off, false);
}
function readString(v, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}
function magic(s) {
  return (s.charCodeAt(0) << 24 | s.charCodeAt(1) << 16 | s.charCodeAt(2) << 8 | s.charCodeAt(3)) >>> 0;
}
const CHUNK_SQ = magic("S.Q.");
const CHUNK_PATT = magic("PATT");
const CHUNK_INST = magic("INST");
const CHUNK_DAPT = magic("DAPT");
const CHUNK_DAIT = magic("DAIT");
const DTM_PT_FORMAT = 0;
const DTM_204_FORMAT = magic("2.04");
const DTM_206_FORMAT = magic("2.06");
const MAX_CHANNELS = 32;
const MAX_INSTRUMENTS = 256;
const LRRL_PAN = [-50, 50, 50, -50];
function readChunks(v, startOffset) {
  const chunks = [];
  let pos = startOffset;
  while (pos + 8 <= v.byteLength) {
    const id = u32(v, pos);
    const length = u32(v, pos + 4);
    chunks.push({ id, offset: pos + 8, length });
    pos += 8 + length;
    if (length & 1) pos++;
  }
  return chunks;
}
function convertModEffect(cmd, param) {
  let effTyp = cmd & 15;
  let eff = param;
  switch (effTyp) {
    // Portamento up/down: zero param means "no effect" in DTM
    case 1:
    case 2:
      if (eff === 0) {
        effTyp = 0;
      }
      break;
    // Volume slide / tone porta+vol / vibrato+vol:
    // upper nibble takes precedence; zero means no effect
    case 10:
    case 5:
    case 6:
      if (eff & 240) {
        eff &= 240;
      } else if (eff === 0) {
        effTyp = 0;
      }
      break;
  }
  return { effTyp, eff };
}
function decodePTCell(d0, d1, d2, d3) {
  const period = (d0 & 15) << 8 | d1;
  const instrument = d0 & 240 | d2 >> 4 | (d0 & 48) << 4;
  const cmd = d2 & 15;
  const param = d3;
  let note = 0;
  if (period > 0) {
    const amigaIdx = periodToNoteIndex(period);
    note = amigaNoteToXM(amigaIdx);
  }
  const { effTyp, eff } = convertModEffect(cmd, param);
  return { note, instrument, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 };
}
function decode204Cell(d0, d1, d2, d3) {
  let note = 0;
  if (d0 > 0 && d0 < 128) {
    note = (d0 >> 4) * 12 + (d0 & 15) + 12;
  }
  const volField = d1 >> 2;
  const volume = volField > 0 ? volField - 1 : 0;
  const instrument = (d1 & 3) << 4 | d2 >> 4;
  const cmd = d2 & 15;
  const param = d3;
  const { effTyp, eff } = convertModEffect(cmd, param);
  return { note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0 };
}
function isDTMFormat(buffer) {
  if (buffer.byteLength < 22) return false;
  const v = new DataView(buffer);
  if (u8(v, 0) !== 68 || u8(v, 1) !== 46 || u8(v, 2) !== 84 || u8(v, 3) !== 46) {
    return false;
  }
  const headerSize = u32(v, 4);
  if (headerSize < 14) return false;
  const type = u16(v, 8);
  if (type !== 0) return false;
  return true;
}
function parseSampleHeader(v, off) {
  const length = u32(v, off + 4);
  const finetune = u8(v, off + 8);
  const volume = Math.min(u8(v, off + 9), 64);
  const loopStart = u32(v, off + 10);
  const loopLength = u32(v, off + 14);
  const name = readString(v, off + 18, 22);
  const stereo = (u8(v, off + 40) & 1) !== 0;
  const is16bit = u8(v, off + 41) > 8;
  const sampleRate = u32(v, off + 46);
  return { length, finetune, volume, loopStart, loopLength, name, stereo, is16bit, sampleRate };
}
function pcm16BETo8(raw) {
  const frames = Math.floor(raw.length / 2);
  const out = new Uint8Array(frames);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let i = 0; i < frames; i++) {
    const s16 = dv.getInt16(i * 2, false);
    out[i] = (s16 >> 8) + 128 & 255;
  }
  return out;
}
function stereoToMono(pcm) {
  const frames = Math.floor(pcm.length / 2);
  const out = new Uint8Array(frames);
  for (let i = 0; i < frames; i++) {
    out[i] = pcm[i * 2];
  }
  return out;
}
function mod2xmFinetuneCents(rawFinetune) {
  const signed = rawFinetune > 7 ? rawFinetune - 16 : rawFinetune;
  return signed * (100 / 8);
}
async function parseDTMFile(buffer, filename) {
  if (!isDTMFormat(buffer)) {
    throw new Error("DTMParser: file does not pass DTM format validation");
  }
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const headerSize = u32(v, 4);
  const stereoMode = u8(v, 10);
  const rawSpeed = u16(v, 14);
  const rawTempo = u16(v, 16);
  const forcedSampleRate = u32(v, 18);
  const initialSpeed = rawSpeed > 0 ? rawSpeed : 6;
  const initialBPM = rawTempo > 0 ? rawTempo : 125;
  const songNameLen = Math.max(0, headerSize - 14);
  const songName = readString(v, 22, songNameLen) || filename.replace(/\.[^/.]+$/, "");
  const chunksStart = 22 + songNameLen;
  const chunks = readChunks(v, chunksStart);
  const findChunk = (id) => chunks.find((c) => c.id === id);
  const findAllChunks = (id) => chunks.filter((c) => c.id === id);
  const pattChunk = findChunk(CHUNK_PATT);
  if (!pattChunk) {
    throw new Error("DTMParser: missing PATT chunk");
  }
  const numChannels = u16(v, pattChunk.offset);
  const numStoredPatterns = u16(v, pattChunk.offset + 2);
  const patternFormat = u32(v, pattChunk.offset + 4);
  if (numChannels < 1 || numChannels > MAX_CHANNELS) {
    throw new Error(`DTMParser: invalid channel count ${numChannels}`);
  }
  if (patternFormat !== DTM_PT_FORMAT && patternFormat !== DTM_204_FORMAT && patternFormat !== DTM_206_FORMAT) {
    throw new Error(`DTMParser: unknown pattern format 0x${patternFormat.toString(16)}`);
  }
  const sqChunk = findChunk(CHUNK_SQ);
  if (!sqChunk) {
    throw new Error("DTMParser: missing S.Q. chunk");
  }
  const ordLen = u16(v, sqChunk.offset);
  const restartPos = u16(v, sqChunk.offset + 2);
  const orderList = [];
  for (let i = 0; i < ordLen; i++) {
    orderList.push(u8(v, sqChunk.offset + 8 + i));
  }
  const sampleSlots = [];
  let maxSampleIndex = 0;
  const instChunk = findChunk(CHUNK_INST);
  if (instChunk) {
    let rawNumSamples = u16(v, instChunk.offset);
    const newSamples = (rawNumSamples & 32768) !== 0;
    rawNumSamples &= 32767;
    if (rawNumSamples < MAX_INSTRUMENTS) {
      let pos = instChunk.offset + 2;
      for (let i = 0; i < rawNumSamples; i++) {
        let realSample;
        if (newSamples) {
          realSample = u16(v, pos) + 1;
          pos += 2;
        } else {
          realSample = i + 1;
        }
        if (pos + 50 > instChunk.offset + instChunk.length) break;
        const hdr = parseSampleHeader(v, pos);
        pos += 50;
        if (realSample >= 1 && realSample < MAX_INSTRUMENTS) {
          sampleSlots.push({ realIndex: realSample, header: hdr });
          if (realSample > maxSampleIndex) maxSampleIndex = realSample;
        }
      }
    }
  }
  const samplePCMMap = /* @__PURE__ */ new Map();
  for (const chunk of findAllChunks(CHUNK_DAIT)) {
    if (chunk.length < 2) continue;
    const smpIdx = u16(v, chunk.offset);
    const dataStart = chunk.offset + 2;
    const dataLen = chunk.length - 2;
    if (dataLen > 0) {
      samplePCMMap.set(smpIdx, raw.slice(dataStart, dataStart + dataLen));
    }
  }
  const instruments = [];
  const slotMap = /* @__PURE__ */ new Map();
  for (const slot of sampleSlots) {
    slotMap.set(slot.realIndex, slot);
  }
  for (let id = 1; id <= maxSampleIndex; id++) {
    const slot = slotMap.get(id);
    if (!slot) {
      instruments.push({
        id,
        name: `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    const hdr = slot.header;
    const rawPCM = samplePCMMap.get(id - 1);
    if (!rawPCM || rawPCM.length === 0) {
      instruments.push({
        id,
        name: hdr.name || `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: hdr.volume > 0 ? 20 * Math.log10(hdr.volume / 64) : -60,
        pan: 0
      });
      continue;
    }
    let pcm8 = rawPCM;
    if (hdr.is16bit) {
      pcm8 = pcm16BETo8(pcm8);
    }
    if (hdr.stereo) {
      pcm8 = stereoToMono(pcm8);
    }
    const sampleRate = patternFormat === DTM_PT_FORMAT && forcedSampleRate > 0 ? forcedSampleRate : hdr.sampleRate > 0 ? hdr.sampleRate : 8363;
    let loopStart = 0;
    let loopEnd = 0;
    if (hdr.loopLength > 1) {
      let ls = hdr.loopStart;
      let ll = hdr.loopLength;
      if (hdr.is16bit) {
        ls = Math.floor(ls / 2);
        ll = Math.floor(ll / 2);
      }
      if (hdr.stereo) {
        ls = Math.floor(ls / 2);
        ll = Math.floor(ll / 2);
      }
      loopStart = ls;
      loopEnd = Math.min(ls + ll, pcm8.length);
    }
    const finetuneCents = mod2xmFinetuneCents(hdr.finetune);
    const inst = createSamplerInstrument(
      id,
      hdr.name || `Sample ${id}`,
      pcm8,
      hdr.volume,
      sampleRate,
      loopStart,
      loopEnd
    );
    if (finetuneCents !== 0 && inst.sample) {
      inst.sample.detune = finetuneCents;
    }
    instruments.push(inst);
  }
  const patternMap = /* @__PURE__ */ new Map();
  const patternDataOffsets = /* @__PURE__ */ new Map();
  for (const chunk of findAllChunks(CHUNK_DAPT)) {
    if (chunk.length < 8) continue;
    let pos = chunk.offset + 4;
    const patNum = u16(v, pos);
    pos += 2;
    let numRows = u16(v, pos);
    pos += 2;
    if (patternFormat === DTM_206_FORMAT) {
      numRows = Math.max(1, Math.floor(numRows / initialSpeed));
    }
    if (patNum > 255 || numRows === 0) continue;
    patternDataOffsets.set(patNum, { dataStart: pos, numRows });
    const channels = Array.from(
      { length: numChannels },
      (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: stereoMode === 0 ? LRRL_PAN[ch % 4] ?? 0 : 0,
        // panoramic → centre
        instrumentId: null,
        color: null,
        rows: []
      })
    );
    if (patternFormat === DTM_206_FORMAT) {
      for (let row = 0; row < numRows; row++) {
        for (let ch = 0; ch < numChannels; ch++) {
          channels[ch].rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
      }
    } else if (patternFormat === DTM_PT_FORMAT) {
      for (let row = 0; row < numRows; row++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const cellOff = pos + (row * numChannels + ch) * 4;
          if (cellOff + 4 > chunk.offset + chunk.length) {
            channels[ch].rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          } else {
            const d0 = u8(v, cellOff);
            const d1 = u8(v, cellOff + 1);
            const d2 = u8(v, cellOff + 2);
            const d3 = u8(v, cellOff + 3);
            channels[ch].rows.push(decodePTCell(d0, d1, d2, d3));
          }
        }
      }
    } else {
      for (let row = 0; row < numRows; row++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const cellOff = pos + (row * numChannels + ch) * 4;
          if (cellOff + 4 > chunk.offset + chunk.length) {
            channels[ch].rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          } else {
            const d0 = u8(v, cellOff);
            const d1 = u8(v, cellOff + 1);
            const d2 = u8(v, cellOff + 2);
            const d3 = u8(v, cellOff + 3);
            channels[ch].rows.push(decode204Cell(d0, d1, d2, d3));
          }
        }
      }
    }
    patternMap.set(patNum, {
      id: `pattern-${patNum}`,
      name: `Pattern ${patNum}`,
      length: numRows,
      channels,
      importMetadata: {
        sourceFormat: "DTM",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numStoredPatterns,
        originalInstrumentCount: maxSampleIndex
      }
    });
  }
  const highestPatNum = Math.max(
    0,
    ...orderList,
    ...[...patternMap.keys()]
  );
  const patterns = [];
  for (let i = 0; i <= highestPatNum; i++) {
    const existing = patternMap.get(i);
    if (existing) {
      patterns.push(existing);
    } else {
      const emptyChannels = Array.from(
        { length: numChannels },
        (_, ch) => ({
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: stereoMode === 0 ? LRRL_PAN[ch % 4] ?? 0 : 0,
          instrumentId: null,
          color: null,
          rows: Array.from({ length: 64 }, () => ({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          }))
        })
      );
      patterns.push({
        id: `pattern-${i}`,
        name: `Pattern ${i}`,
        length: 64,
        channels: emptyChannels,
        importMetadata: {
          sourceFormat: "DTM",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: numChannels,
          originalPatternCount: numStoredPatterns,
          originalInstrumentCount: maxSampleIndex
        }
      });
    }
  }
  const isPT = patternFormat === DTM_PT_FORMAT;
  const uadePatternLayout = {
    formatId: isPT ? "dtm_pt" : "dtm_204",
    patternDataFileOffset: 0,
    // overridden by getCellFileOffset
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels,
    numPatterns: patterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: isPT ? encodeMODCell : encodeDTM204Cell,
    getCellFileOffset: (pattern, row, channel) => {
      const info = patternDataOffsets.get(pattern);
      if (!info) return 0;
      return info.dataStart + (row * numChannels + channel) * 4;
    }
  };
  return {
    name: songName,
    format: "MOD",
    patterns,
    instruments,
    songPositions: orderList,
    songLength: orderList.length,
    restartPosition: restartPos,
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadePatternLayout
  };
}
export {
  isDTMFormat,
  parseDTMFile
};
