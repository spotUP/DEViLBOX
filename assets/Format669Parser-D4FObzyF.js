import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import { e as encode669Cell } from "./Composer667Encoder-o8O1EiUD.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u8(v, off) {
  return v.getUint8(off);
}
function u32le(v, off) {
  return v.getUint32(off, true);
}
function readString(v, off, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    const b = v.getUint8(off + i);
    if (b === 0) break;
    bytes.push(b);
  }
  return String.fromCharCode(...bytes).replace(/[\x00-\x1F]/g, " ").trim();
}
const HEADER_SIZE = 497;
const SAMPLE_HDR_SIZE = 25;
const NUM_CHANNELS = 8;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_CELL = 3;
const PATTERN_SIZE = ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
const SAMPLE_RATE = 8363;
const OFFSET_SONG_MSG = 2;
const OFFSET_SAMPLES = 110;
const OFFSET_PATTERNS = 111;
const OFFSET_RESTART = 112;
const OFFSET_ORDERS = 113;
const OFFSET_TEMPO_LIST = 241;
const OFFSET_BREAKS = 369;
const ORDER_END = 255;
const ORDER_RESTART = 254;
const CHANNEL_PAN = [-60, 60, -60, 60, -60, 60, -60, 60];
const EFF_PORTA_UP = 1;
const EFF_PORTA_DOWN = 2;
const EFF_TONE_PORTA = 3;
const EFF_VIBRATO = 4;
const EFF_SPEED = 15;
const EFF_PATTERN_BREAK = 13;
const EFF_NONE = 0;
function is669Format(buffer) {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const v = new DataView(buffer);
  const m0 = u8(v, 0);
  const m1 = u8(v, 1);
  const isComposer = m0 === 105 && m1 === 102;
  const isUNIS = m0 === 74 && m1 === 78;
  if (!isComposer && !isUNIS) return false;
  const numSamples = u8(v, OFFSET_SAMPLES);
  const numPatterns = u8(v, OFFSET_PATTERNS);
  const restartPos = u8(v, OFFSET_RESTART);
  if (numSamples > 64) return false;
  if (numPatterns > 128) return false;
  if (restartPos >= 128) return false;
  let invalidCount = 0;
  for (let i = 0; i < 108; i++) {
    const c = u8(v, OFFSET_SONG_MSG + i);
    if (c > 0 && c <= 31 && ++invalidCount > 40) return false;
  }
  for (let i = 0; i < 128; i++) {
    const order = u8(v, OFFSET_ORDERS + i);
    const tempo = u8(v, OFFSET_TEMPO_LIST + i);
    const brk = u8(v, OFFSET_BREAKS + i);
    if (order >= 128 && order < 254) return false;
    if (order < 128 && tempo === 0) return false;
    if (tempo > 15) return false;
    if (brk >= 64) return false;
  }
  const minSize = HEADER_SIZE + numSamples * SAMPLE_HDR_SIZE + numPatterns * PATTERN_SIZE;
  if (buffer.byteLength < minSize) return false;
  return true;
}
function map669Effect(command, param) {
  switch (command) {
    case 0:
      return { effTyp: EFF_PORTA_UP, eff: param };
    case 1:
      return { effTyp: EFF_PORTA_DOWN, eff: param };
    case 2:
      return { effTyp: EFF_TONE_PORTA, eff: param };
    case 3:
      return { effTyp: EFF_PORTA_UP, eff: 240 | param };
    case 4:
      return { effTyp: EFF_VIBRATO, eff: param << 4 | param };
    case 5:
      return { effTyp: EFF_SPEED, eff: param };
    case 6:
      switch (param) {
        case 0:
          return { effTyp: 14, eff: 4 };
        case 1:
          return { effTyp: 14, eff: 20 };
        default:
          return { effTyp: EFF_NONE, eff: 0 };
      }
    case 7:
      return { effTyp: 14, eff: 144 | param };
    default:
      return { effTyp: EFF_NONE, eff: 0 };
  }
}
async function parse669File(buffer, filename) {
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const numSamples = u8(v, OFFSET_SAMPLES);
  const numPatterns = u8(v, OFFSET_PATTERNS);
  const restartPos = u8(v, OFFSET_RESTART);
  const songName = readString(v, OFFSET_SONG_MSG, 36);
  const sampleHeaders = [];
  let sampleHdrBase = HEADER_SIZE;
  for (let i = 0; i < numSamples; i++) {
    sampleHeaders.push({
      filename: readString(v, sampleHdrBase, 13),
      length: u32le(v, sampleHdrBase + 13),
      loopStart: u32le(v, sampleHdrBase + 17),
      loopEnd: u32le(v, sampleHdrBase + 21)
    });
    sampleHdrBase += SAMPLE_HDR_SIZE;
  }
  const rawOrders = [];
  for (let i = 0; i < 128; i++) {
    const ord = u8(v, OFFSET_ORDERS + i);
    if (ord === ORDER_END || ord === ORDER_RESTART) break;
    rawOrders.push(ord);
  }
  if (rawOrders.length === 0) rawOrders.push(0);
  const tempoList = [];
  const breakList = [];
  for (let i = 0; i < rawOrders.length; i++) {
    tempoList.push(u8(v, OFFSET_TEMPO_LIST + i));
    breakList.push(u8(v, OFFSET_BREAKS + i));
  }
  const patternDataBase = HEADER_SIZE + numSamples * SAMPLE_HDR_SIZE;
  function buildPattern(patIdx, orderPos, speed, breakRow) {
    const patBase = patternDataBase + patIdx * PATTERN_SIZE;
    const channelEffect = new Uint8Array(NUM_CHANNELS).fill(255);
    const channelRows = Array.from({ length: NUM_CHANNELS }, () => []);
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellBase = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        const noteInstr = cellBase < buffer.byteLength ? u8(v, cellBase) : 255;
        const instrVol = cellBase + 1 < buffer.byteLength ? u8(v, cellBase + 1) : 0;
        const effParam = cellBase + 2 < buffer.byteLength ? u8(v, cellBase + 2) : 255;
        let note = 0;
        let instrument = 0;
        let volume = 0;
        if (noteInstr < 254) {
          const rawNote = noteInstr >> 2;
          instrument = (noteInstr & 3) << 4 | instrVol >> 4;
          note = rawNote + 37;
          if (note < 1) note = 1;
          if (note > 96) note = 96;
          channelEffect[ch] = 255;
        }
        if (noteInstr <= 254) {
          const rawVol = instrVol & 15;
          volume = Math.round((rawVol * 64 + 8) / 15);
        }
        if (effParam !== 255) {
          channelEffect[ch] = effParam;
        }
        let effTyp = EFF_NONE;
        let eff = 0;
        if (channelEffect[ch] !== 255) {
          const command = channelEffect[ch] >> 4;
          const param = channelEffect[ch] & 15;
          const mapped = map669Effect(command, param);
          effTyp = mapped.effTyp;
          eff = mapped.eff;
          if (command !== 6) {
            channelEffect[ch] = 255;
          }
        }
        if (row === 0 && ch === 0 && speed > 0 && effTyp !== EFF_SPEED) {
          effTyp = EFF_SPEED;
          eff = speed;
        }
        if (breakRow < 63 && row === breakRow && ch === 0 && effTyp === EFF_NONE) {
          effTyp = EFF_PATTERN_BREAK;
          eff = 0;
        }
        channelRows[ch].push({
          note,
          instrument: noteInstr < 254 ? instrument + 1 : 0,
          volume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
    }
    const channels = channelRows.map((rows, ch) => ({
      id: `c${orderPos}-p${patIdx}-ch${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: CHANNEL_PAN[ch],
      instrumentId: null,
      color: null,
      rows
    }));
    return {
      id: `pattern-${orderPos}-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "669",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numSamples
      }
    };
  }
  const patterns = [];
  const songPositions = [];
  for (let i = 0; i < rawOrders.length; i++) {
    const patIdx = rawOrders[i];
    const speed = tempoList[i] > 0 ? tempoList[i] : 4;
    const breakRow = breakList[i];
    patterns.push(buildPattern(patIdx, i, speed, breakRow));
    songPositions.push(i);
  }
  const sampleDataBase = patternDataBase + numPatterns * PATTERN_SIZE;
  const instruments = sampleHeaders.map((hdr, i) => {
    const id = i + 1;
    const name = hdr.filename || `Sample ${id}`;
    if (hdr.length === 0 || hdr.length >= 67108864) {
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
    let startOff = sampleDataBase;
    for (let j = 0; j < i; j++) startOff += sampleHeaders[j].length;
    const endOff = startOff + hdr.length;
    if (endOff > buffer.byteLength) {
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
    let loopStart = 0;
    let loopEnd = 0;
    if (!(hdr.loopEnd > hdr.length && hdr.loopStart === 0) && hdr.loopEnd !== 0) {
      loopStart = hdr.loopStart;
      loopEnd = Math.min(hdr.loopEnd, hdr.length);
    }
    const unsigned = raw.subarray(startOff, endOff);
    const pcm = new Uint8Array(unsigned.length);
    for (let j = 0; j < unsigned.length; j++) pcm[j] = unsigned[j] ^ 128;
    return createSamplerInstrument(id, name, pcm, 64, SAMPLE_RATE, loopStart, loopEnd);
  });
  const effectiveRestart = restartPos < rawOrders.length ? restartPos : 0;
  const uadePatternLayout = {
    formatId: "format669",
    patternDataFileOffset: patternDataBase,
    bytesPerCell: BYTES_PER_CELL,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: NUM_CHANNELS,
    numPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: encode669Cell
  };
  return {
    name: songName || filename.replace(/\.[^/.]+$/, ""),
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: effectiveRestart,
    numChannels: NUM_CHANNELS,
    initialSpeed: 4,
    initialBPM: 78,
    // OpenMPT Load_669.cpp: Order().SetDefaultTempoInt(78)
    linearPeriods: false,
    uadePatternLayout
  };
}
export {
  is669Format,
  parse669File
};
