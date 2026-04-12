import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const XM_TO_GDM = /* @__PURE__ */ new Map([
  // [0x00, 0x10],  // Arpeggio → GDM 0x10 (NOT 0x00 which is "none")
  [1, 1],
  // Porta up
  [2, 2],
  // Porta down
  [3, 3],
  // Tone porta
  [4, 4],
  // Vibrato
  [5, 5],
  // Tone porta + vol slide
  [6, 6],
  // Vibrato + vol slide
  [7, 7],
  // Tremolo
  [9, 9],
  // Sample offset
  [10, 10],
  // Volume slide
  [11, 11],
  // Position jump
  [12, 12],
  // Set volume
  [13, 13],
  // Pattern break
  [14, 14],
  // Mod cmd extended
  [15, 15],
  // Set speed
  [16, 19],
  // Global volume
  [21, 20],
  // Fine vibrato
  [27, 18],
  // Retrig
  [29, 8],
  // Tremor
  [30, 30],
  // S3M cmd extended
  [31, 31]
  // Tempo
]);
function xmNoteToGDM(xmNote) {
  if (xmNote <= 0) return 0;
  const semi = xmNote - 13;
  if (semi < 0 || semi >= 120) return 0;
  const octave = Math.floor(semi / 12);
  const noteInOctave = semi % 12;
  return (octave << 4 | noteInOctave) + 1;
}
function reverseGDMEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { gdmCmd: 0, param: 0 };
  if (effTyp === 0 && eff !== 0) return { gdmCmd: 16, param: eff };
  const gdmCmd = XM_TO_GDM.get(effTyp);
  if (gdmCmd === void 0) return { gdmCmd: 0, param: 0 };
  let param = eff;
  return { gdmCmd, param };
}
const gdmEncoder = {
  formatId: "gdm",
  encodePattern(rows, channel) {
    const buf = [];
    const ch = channel & 31;
    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const effTyp2 = cell.effTyp2 ?? 0;
      const eff2 = cell.eff2 ?? 0;
      const vol = cell.volume ?? 0;
      const hasNote = note !== 0 || instr !== 0;
      const fx1 = reverseGDMEffect(effTyp, eff);
      const hasFx1 = fx1.gdmCmd !== 0 || fx1.param !== 0;
      const hasVol = vol > 0;
      const fx2 = reverseGDMEffect(effTyp2, eff2);
      const hasFx2 = fx2.gdmCmd !== 0 || fx2.param !== 0;
      const hasAnyEffect = hasFx1 || hasVol || hasFx2;
      if (!hasNote && !hasAnyEffect) {
        buf.push(0);
        continue;
      }
      let channelByte = ch;
      if (hasNote) channelByte |= 32;
      if (hasAnyEffect) channelByte |= 64;
      buf.push(channelByte);
      if (hasNote) {
        buf.push(xmNoteToGDM(note));
        buf.push(instr & 255);
      }
      if (hasAnyEffect) {
        const effects = [];
        if (hasFx1) effects.push({ cmd: fx1.gdmCmd, param: fx1.param });
        if (hasVol) effects.push({ cmd: 12, param: Math.min(vol, 64) });
        if (hasFx2) effects.push({ cmd: fx2.gdmCmd, param: fx2.param });
        for (let i = 0; i < effects.length; i++) {
          const isLast = i === effects.length - 1;
          let effByte = effects[i].cmd & 31;
          if (!isLast) effByte |= 32;
          buf.push(effByte);
          buf.push(effects[i].param & 255);
        }
      }
      buf.push(0);
    }
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(gdmEncoder);
function u8(v, off) {
  return v.getUint8(off);
}
function u16le(v, off) {
  return v.getUint16(off, true);
}
function u32le(v, off) {
  return v.getUint32(off, true);
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
const FILE_HEADER_SIZE = 157;
const SAMPLE_HEADER_SIZE = 62;
const ROWS_PER_PATTERN = 64;
const SMP_LOOP = 1;
const SMP_16BIT = 2;
const SMP_VOLUME = 4;
const ROW_DONE = 0;
const CHANNEL_MASK = 31;
const NOTE_FLAG = 32;
const EFFECT_FLAG = 64;
const EFFECT_MASK = 31;
const EFFECT_MORE = 32;
const GDM_EFF_TRANS = [
  /* 0x00 none */
  0,
  /* 0x01 portaUp */
  1,
  /* 0x02 portaDn */
  2,
  /* 0x03 tonePorta */
  3,
  /* 0x04 vibrato */
  4,
  /* 0x05 tonePortaVol */
  5,
  /* 0x06 vibratoVol */
  6,
  /* 0x07 tremolo */
  7,
  /* 0x08 tremor */
  29,
  // CMD_TREMOR — using 0x1D (XM Ixy slot)
  /* 0x09 offset */
  9,
  /* 0x0A volSlide */
  10,
  /* 0x0B posJump */
  11,
  /* 0x0C volume */
  12,
  /* 0x0D patBreak */
  13,
  /* 0x0E modCmdEx */
  14,
  /* 0x0F speed */
  15,
  /* 0x10 arpeggio */
  0,
  /* 0x11 none(internal) */
  0,
  /* 0x12 retrig */
  27,
  /* 0x13 globalVol */
  16,
  /* 0x14 fineVibrato */
  21,
  // XM fine vibrato
  /* 0x15 none */
  0,
  /* 0x16 none */
  0,
  /* 0x17 none */
  0,
  /* 0x18 none */
  0,
  /* 0x19 none */
  0,
  /* 0x1A none */
  0,
  /* 0x1B none */
  0,
  /* 0x1C none */
  0,
  /* 0x1D none */
  0,
  /* 0x1E S3MCmdEx */
  30,
  /* 0x1F tempo */
  31
];
function isGDMFormat(buffer) {
  if (buffer.byteLength < FILE_HEADER_SIZE) return false;
  const v = new DataView(buffer);
  if (u8(v, 0) !== 71 || u8(v, 1) !== 68 || u8(v, 2) !== 77 || u8(v, 3) !== 254) {
    return false;
  }
  if (u8(v, 68) !== 13 || u8(v, 69) !== 10 || u8(v, 70) !== 26) return false;
  if (u8(v, 71) !== 71 || u8(v, 72) !== 77 || u8(v, 73) !== 70 || u8(v, 74) !== 83) {
    return false;
  }
  if (u8(v, 75) !== 1 || u8(v, 76) !== 0) return false;
  const originalFormat = u16le(v, 116);
  if (originalFormat < 1 || originalFormat > 9) return false;
  let numChannels = 0;
  for (let i = 0; i < 32; i++) {
    if (u8(v, 81 + i) === 255) {
      numChannels = i;
      break;
    }
    if (i === 31) numChannels = 32;
  }
  if (numChannels === 0) return false;
  return true;
}
class ChunkReader {
  pos = 0;
  data;
  constructor(data) {
    this.data = data;
  }
  canRead(n) {
    return this.pos + n <= this.data.length;
  }
  readU8() {
    if (this.pos >= this.data.length) return 0;
    return this.data[this.pos++];
  }
}
function gdmPanToTrackerPan(gdmPan) {
  if (gdmPan > 15) return 0;
  const p255 = Math.min(gdmPan * 16 + 8, 255);
  return Math.round((p255 - 128) * 100 / 128);
}
function translateGDMEffect(rawCmd, param) {
  const gdmCmd = rawCmd & EFFECT_MASK;
  const effTyp = gdmCmd < GDM_EFF_TRANS.length ? GDM_EFF_TRANS[gdmCmd] : 0;
  let eff = param;
  let volcmd = 0;
  let vol = 0;
  let outEffTyp = effTyp;
  switch (gdmCmd) {
    // 0x01 portaUp / 0x02 portaDn: clamp param to 0xDF to avoid fine-slide territory
    case 1:
    case 2:
      if (eff >= 224) eff = 223;
      break;
    // 0x05 tonePortaVol / 0x06 vibratoVol: keep only the non-zero nibble
    case 5:
    case 6:
      if (eff & 240) eff &= 240;
      break;
    // 0x0C volume: clamp to 64, move to volume column
    case 12:
      eff = Math.min(eff, 64);
      volcmd = 1;
      vol = eff;
      outEffTyp = 0;
      eff = 0;
      break;
    // 0x0E modCmdEx: fix portamento fine-slide sub-commands
    case 14:
      switch (param >> 4) {
        case 8:
          outEffTyp = 1;
          eff = 224 | param & 15;
          break;
        case 9:
          outEffTyp = 2;
          eff = 224 | param & 15;
          break;
      }
      break;
    // 0x12 retrig: convert to MOD-style CMD_MODCMDEX (E9x)
    case 18:
      outEffTyp = 14;
      eff = 144 | param & 15;
      break;
    // 0x1E S3MCmdEx: only surround (0x01→0x91) and 4-bit panning (0x8x) survive
    case 30:
      if (param === 1) {
        eff = 145;
      } else if ((param & 240) === 128) ;
      else {
        outEffTyp = 0;
        eff = 0;
      }
      break;
  }
  return { effTyp: outEffTyp, eff, volcmd, vol };
}
async function parseGDMFile(buffer, filename) {
  if (!isGDMFormat(buffer)) {
    throw new Error("GDMParser: file does not pass GDM format validation");
  }
  const v = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const songTitle = readString(v, 4, 32) || filename.replace(/\.[^/.]+$/, "");
  readString(v, 36, 32);
  u8(v, 79);
  u8(v, 80);
  u8(v, 113);
  const tempo = u8(v, 114);
  const bpm = u8(v, 115);
  const originalFormat = u16le(v, 116);
  const orderOffset = u32le(v, 118);
  const lastOrder = u8(v, 122);
  const patternOffset = u32le(v, 123);
  const lastPattern = u8(v, 127);
  const sampleHeaderOffset = u32le(v, 128);
  const sampleDataOffset = u32le(v, 132);
  const lastSample = u8(v, 136);
  const numOrders = lastOrder + 1;
  const numPatterns = lastPattern + 1;
  const numSamples = lastSample + 1;
  let numChannels = 32;
  for (let i = 0; i < 32; i++) {
    if (u8(v, 81 + i) === 255) {
      numChannels = i;
      break;
    }
  }
  const channelPans = [];
  for (let i = 0; i < numChannels; i++) {
    channelPans.push(gdmPanToTrackerPan(u8(v, 81 + i)));
  }
  u16le(v, 77);
  const orderList = [];
  if (orderOffset + numOrders <= buffer.byteLength) {
    for (let i = 0; i < numOrders; i++) {
      const o = u8(v, orderOffset + i);
      if (o === 255) break;
      orderList.push(o === 254 ? 254 : o);
    }
  }
  const songPositions = orderList.filter((o) => o !== 254);
  const sampleInfos = [];
  let sampleHeaderCursor = sampleHeaderOffset;
  for (let s = 0; s < numSamples; s++) {
    if (sampleHeaderCursor + SAMPLE_HEADER_SIZE > buffer.byteLength) break;
    sampleInfos.push({
      name: readString(v, sampleHeaderCursor + 0, 32) || `Sample ${s + 1}`,
      fileName: readString(v, sampleHeaderCursor + 32, 12),
      length: u32le(v, sampleHeaderCursor + 45),
      loopBegin: u32le(v, sampleHeaderCursor + 49),
      loopEnd: u32le(v, sampleHeaderCursor + 53),
      flags: u8(v, sampleHeaderCursor + 57),
      c4Hertz: u16le(v, sampleHeaderCursor + 58),
      volume: u8(v, sampleHeaderCursor + 60),
      panning: u8(v, sampleHeaderCursor + 61)
    });
    sampleHeaderCursor += SAMPLE_HEADER_SIZE;
  }
  let pcmCursor = sampleDataOffset;
  const samplePCM = [];
  for (let s = 0; s < sampleInfos.length; s++) {
    const info = sampleInfos[s];
    const byteLen = info.length;
    if (byteLen === 0 || pcmCursor + byteLen > buffer.byteLength) {
      samplePCM.push(null);
      pcmCursor += byteLen;
      continue;
    }
    const raw = bytes.subarray(pcmCursor, pcmCursor + byteLen);
    if (info.flags & SMP_16BIT) {
      const numSamples16 = Math.floor(byteLen / 2);
      const pcm8 = new Uint8Array(numSamples16);
      for (let i = 0; i < numSamples16; i++) {
        const highByte = raw[i * 2 + 1];
        pcm8[i] = highByte ^ 128;
      }
      samplePCM.push(pcm8);
    } else {
      const pcm8 = new Uint8Array(byteLen);
      for (let i = 0; i < byteLen; i++) {
        pcm8[i] = raw[i] ^ 128;
      }
      samplePCM.push(pcm8);
    }
    pcmCursor += byteLen;
  }
  const instruments = [];
  for (let s = 0; s < sampleInfos.length; s++) {
    const info = sampleInfos[s];
    const id = s + 1;
    const pcm = samplePCM[s];
    if (!pcm || pcm.length === 0) {
      instruments.push({
        id,
        name: info.name,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    const hasLoop = (info.flags & SMP_LOOP) !== 0 && info.loopEnd > info.loopBegin;
    const is16bit = (info.flags & SMP_16BIT) !== 0;
    let loopStart = is16bit ? Math.floor(info.loopBegin / 2) : info.loopBegin;
    let loopEnd = is16bit ? Math.floor((info.loopEnd - 1) / 2) : info.loopEnd - 1;
    loopEnd = Math.min(loopEnd, pcm.length);
    const defaultVol = info.flags & SMP_VOLUME ? Math.min(info.volume, 64) : 64;
    const sampleRate = info.c4Hertz > 0 ? info.c4Hertz : 8363;
    instruments.push(
      createSamplerInstrument(
        id,
        info.name,
        pcm,
        defaultVol,
        sampleRate,
        hasLoop ? loopStart : 0,
        hasLoop ? loopEnd : 0
      )
    );
  }
  const patterns = [];
  const filePatternAddrs = [];
  const filePatternSizes = [];
  let patCursor = patternOffset;
  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    if (patCursor + 2 > buffer.byteLength) break;
    const patternLength = u16le(v, patCursor);
    patCursor += 2;
    const chunkLen = patternLength > 2 ? patternLength - 2 : 0;
    if (chunkLen === 0 || patCursor + chunkLen > buffer.byteLength) {
      filePatternAddrs.push(patCursor);
      filePatternSizes.push(chunkLen);
      patCursor += chunkLen;
      patterns.push(buildEmptyPattern(pIdx, numChannels, filename, numPatterns, sampleInfos.length));
      continue;
    }
    filePatternAddrs.push(patCursor);
    filePatternSizes.push(chunkLen);
    const chunkData = bytes.subarray(patCursor, patCursor + chunkLen);
    patCursor += chunkLen;
    const chunk = new ChunkReader(chunkData);
    const channelRows = Array.from({ length: numChannels }, () => []);
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      const rowCells = /* @__PURE__ */ new Map();
      while (chunk.canRead(1)) {
        const channelByte = chunk.readU8();
        if (channelByte === ROW_DONE) break;
        const channel = channelByte & CHANNEL_MASK;
        if (channel >= numChannels) {
          if (channelByte & NOTE_FLAG) {
            chunk.readU8();
            chunk.readU8();
          }
          if (channelByte & EFFECT_FLAG) {
            let more = true;
            while (more && chunk.canRead(2)) {
              const eb = chunk.readU8();
              chunk.readU8();
              more = (eb & EFFECT_MORE) !== 0;
            }
          }
          continue;
        }
        let cell = rowCells.get(channel) ?? {
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        };
        if (channelByte & NOTE_FLAG) {
          const rawNote = chunk.readU8();
          const instr = chunk.readU8();
          if (rawNote !== 0) {
            const noteByte = (rawNote & 127) - 1;
            const octave = noteByte >> 4;
            const semitone = noteByte & 15;
            const xmNote = octave * 12 + semitone + 13;
            cell = { ...cell, note: xmNote };
          }
          if (instr !== 0) {
            cell = { ...cell, instrument: instr };
          }
        }
        if (channelByte & EFFECT_FLAG) {
          let effectMore = true;
          let firstEffect = true;
          while (effectMore && chunk.canRead(2)) {
            const effByte = chunk.readU8();
            const param = chunk.readU8();
            effectMore = (effByte & EFFECT_MORE) !== 0;
            const { effTyp, eff, volcmd, vol } = translateGDMEffect(effByte, param);
            if (firstEffect) {
              if (volcmd !== 0) {
                cell = { ...cell, volume: vol };
              } else {
                cell = { ...cell, effTyp, eff };
              }
              firstEffect = false;
            } else {
              if (volcmd !== 0) {
                cell = { ...cell, volume: vol };
              } else if (cell.effTyp2 === 0) {
                cell = { ...cell, effTyp2: effTyp, eff2: eff };
              }
            }
          }
        }
        rowCells.set(channel, cell);
      }
      for (let ch = 0; ch < numChannels; ch++) {
        channelRows[ch].push(rowCells.get(ch) ?? {
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        });
      }
    }
    const channels = channelRows.map((rows, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: channelPans[ch] ?? 0,
      instrumentId: null,
      color: null,
      rows
    }));
    patterns.push({
      id: `pattern-${pIdx}`,
      name: `Pattern ${pIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "GDM",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: sampleInfos.length
      }
    });
  }
  const formatMap = {
    1: "MOD",
    2: "MOD",
    // MTM → treat as MOD
    3: "S3M",
    4: "MOD",
    // 669 → no dedicated TrackerFormat, nearest is MOD
    5: "MOD",
    // FAR
    6: "MOD",
    // ULT
    7: "MOD",
    // STM
    8: "MED",
    9: "MOD"
    // PSM
  };
  const trackerFormat = formatMap[originalFormat] ?? "MOD";
  const linearPeriods = trackerFormat === "S3M" || trackerFormat === "IT";
  const noteExportOffset = originalFormat === 3 ? -60 : void 0;
  const trackMap = patterns.map(
    (_, patIdx) => Array.from({ length: numChannels }, () => patIdx)
  );
  const uadeVariableLayout = {
    formatId: "gdm",
    numChannels,
    numFilePatterns: patterns.length,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: buffer.byteLength,
    encoder: gdmEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: songTitle,
    format: trackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: tempo > 0 ? tempo : 6,
    initialBPM: bpm > 0 ? bpm : 125,
    linearPeriods,
    uadeVariableLayout,
    ...noteExportOffset !== void 0 ? { noteExportOffset } : {}
  };
}
function buildEmptyPattern(pIdx, numChannels, filename, numPatterns, numInstruments) {
  const emptyRow = {
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  };
  const channels = Array.from({ length: numChannels }, (_, ch) => ({
    id: `channel-${ch}`,
    name: `Channel ${ch + 1}`,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: null,
    color: null,
    rows: Array.from({ length: ROWS_PER_PATTERN }, () => ({ ...emptyRow }))
  }));
  return {
    id: `pattern-${pIdx}`,
    name: `Pattern ${pIdx}`,
    length: ROWS_PER_PATTERN,
    channels,
    importMetadata: {
      sourceFormat: "GDM",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: numPatterns,
      originalInstrumentCount: numInstruments
    }
  };
}
export {
  isGDMFormat,
  parseGDMFile
};
