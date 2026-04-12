import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import { e as encodeGameMusicCreatorCell } from "./GameMusicCreatorEncoder-BgzDEazu.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u8(view, off) {
  return view.getUint8(off);
}
function u16be(view, off) {
  return view.getUint16(off, false);
}
function u32be(view, off) {
  return view.getUint32(off, false);
}
const NUM_SAMPLES = 15;
const NUM_CHANNELS = 4;
const NUM_ROWS = 64;
const SAMPLE_HDR_SIZE = 16;
const HEADER_SIZE = NUM_SAMPLES * SAMPLE_HDR_SIZE + 3 + 1 + 100 * 2;
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
  // C-1 to B-1
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
  // C-2 to B-2
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
  // C-3 to B-3
];
function periodToNote(period) {
  if (period === 0) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < MOD_PERIODS.length; i++) {
    const d = Math.abs(MOD_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best + 13;
}
function isGameMusicCreatorFormat(bytes) {
  if (bytes.byteLength < HEADER_SIZE) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base = s * SAMPLE_HDR_SIZE;
    const offset = u32be(view, base);
    const length = u16be(view, base + 4);
    const zero = u8(view, base + 6);
    const volume = u8(view, base + 7);
    const address = u32be(view, base + 8);
    const loopLength = u16be(view, base + 12);
    const dataStart = u16be(view, base + 14);
    if (offset > 2097151 || offset & 1) return false;
    if (address > 2097151 || address & 1) return false;
    if (length > 32767) return false;
    if (dataStart > 32767 || dataStart & 1) return false;
    if (loopLength > 2 && loopLength > length) return false;
    if (volume > 64) return false;
    if (zero !== 0) return false;
  }
  const zeroBase = NUM_SAMPLES * SAMPLE_HDR_SIZE;
  if (u8(view, zeroBase) !== 0 || u8(view, zeroBase + 1) !== 0 || u8(view, zeroBase + 2) !== 0) {
    return false;
  }
  const numOrders = u8(view, zeroBase + 3);
  if (!numOrders || numOrders > 100) return false;
  const ordersBase = zeroBase + 4;
  for (let i = 0; i < 100; i++) {
    const ord = u16be(view, ordersBase + i * 2);
    if (ord % 1024 !== 0) return false;
  }
  return true;
}
function parseGameMusicCreatorFile(bytes, filename) {
  if (!isGameMusicCreatorFormat(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleHeaders = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base = s * SAMPLE_HDR_SIZE;
    const length = u16be(view, base + 4);
    const volume = u8(view, base + 7);
    const offset = u32be(view, base);
    const loopLength = u16be(view, base + 12);
    sampleHeaders.push({
      offset,
      lengthBytes: length * 2,
      volume,
      loopLengthBytes: loopLength * 2
    });
  }
  const zeroBase = NUM_SAMPLES * SAMPLE_HDR_SIZE;
  const numOrders = u8(view, zeroBase + 3);
  const ordersBase = zeroBase + 4;
  const orderList = [];
  let numPatterns = 0;
  for (let i = 0; i < numOrders; i++) {
    const raw = u16be(view, ordersBase + i * 2);
    const patIdx = raw / 1024;
    orderList.push(patIdx);
    if (patIdx !== 63) {
      numPatterns = Math.max(numPatterns, patIdx + 1);
    }
  }
  let pos = HEADER_SIZE;
  const patternCells = [];
  for (let pat = 0; pat < numPatterns; pat++) {
    const rows = [];
    for (let row = 0; row < NUM_ROWS; row++) {
      const cells = [];
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        if (pos + 4 > bytes.byteLength) {
          cells.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const b0 = u8(view, pos);
        const b1 = u8(view, pos + 1);
        const cmd = u8(view, pos + 2) & 15;
        const prm = u8(view, pos + 3);
        pos += 4;
        const noteCut = b0 === 255 && b1 === 254;
        if (!noteCut && (b0 & 240) !== 0) {
          cells.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const sampleHi = (noteCut ? 0 : b0) & 240;
        const periodHi = (noteCut ? 0 : b0) & 15;
        const periodRaw = periodHi << 8 | b1;
        const sampleNum = sampleHi >> 4;
        let note = 0;
        if (noteCut) {
          note = 97;
        } else if (periodRaw > 0) {
          note = periodToNote(periodRaw);
        }
        let effTyp = 0;
        let eff = prm;
        switch (cmd) {
          case 0:
            effTyp = 0;
            eff = 0;
            break;
          case 1:
            effTyp = 1;
            break;
          case 2:
            effTyp = 2;
            break;
          case 3:
            effTyp = 12;
            eff = prm & 127;
            break;
          case 4:
            effTyp = 13;
            break;
          case 5:
            effTyp = 11;
            break;
          case 6:
            effTyp = 14;
            eff = 0;
            break;
          case 7:
            effTyp = 14;
            eff = 1;
            break;
          case 8:
            effTyp = 15;
            break;
          default:
            effTyp = 0;
            eff = 0;
            break;
        }
        cells.push({
          note,
          instrument: sampleNum,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
      rows.push(cells);
    }
    patternCells.push(rows);
  }
  const instruments = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const hdr = sampleHeaders[s];
    const id = s + 1;
    const name2 = `Sample ${id}`;
    if (hdr.lengthBytes === 0 || hdr.offset === 0 || hdr.offset >= bytes.byteLength) {
      const emptyChipRam = {
        moduleBase: 0,
        moduleSize: bytes.byteLength,
        instrBase: s * SAMPLE_HDR_SIZE,
        instrSize: SAMPLE_HDR_SIZE,
        sections: { sampleHeaders: 0 }
      };
      instruments.push({
        id,
        name: name2,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: 0,
        pan: 0,
        uadeChipRam: emptyChipRam
      });
      continue;
    }
    const available = Math.min(hdr.lengthBytes, bytes.byteLength - hdr.offset);
    const pcm = bytes.slice(hdr.offset, hdr.offset + available);
    let loopStart = 0;
    let loopEnd = 0;
    if (hdr.loopLengthBytes > 4) {
      loopStart = Math.max(0, hdr.lengthBytes - hdr.loopLengthBytes);
      loopEnd = hdr.lengthBytes;
    }
    const chipRam = {
      moduleBase: 0,
      moduleSize: bytes.byteLength,
      instrBase: s * SAMPLE_HDR_SIZE,
      instrSize: SAMPLE_HDR_SIZE,
      sections: { sampleHeaders: 0 }
    };
    const instr = createSamplerInstrument(
      id,
      name2,
      pcm,
      hdr.volume,
      // volume 0-64
      8287,
      // Amiga C-3 sample rate
      loopStart,
      loopEnd
    );
    instr.uadeChipRam = chipRam;
    instruments.push(instr);
  }
  const PANNING = [-50, 50, 50, -50];
  const builtPatterns = /* @__PURE__ */ new Map();
  for (const patIdx of orderList) {
    if (builtPatterns.has(patIdx)) continue;
    if (patIdx >= patternCells.length) continue;
    const rawRows = patternCells[patIdx];
    const channels = Array.from({ length: NUM_CHANNELS }, (_, ch) => {
      const rows = rawRows.map((rowCells) => rowCells[ch]);
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
    builtPatterns.set(patIdx, {
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: NUM_ROWS,
      channels,
      importMetadata: {
        sourceFormat: "GameMusicCreator",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: NUM_SAMPLES
      }
    });
  }
  const orderedPatternIndices = [];
  const patternArray = [];
  const patternIdxToArrayIdx = /* @__PURE__ */ new Map();
  for (const patIdx of orderList) {
    if (!patternIdxToArrayIdx.has(patIdx) && builtPatterns.has(patIdx)) {
      patternIdxToArrayIdx.set(patIdx, patternArray.length);
      patternArray.push(builtPatterns.get(patIdx));
    }
    const arrIdx = patternIdxToArrayIdx.get(patIdx);
    if (arrIdx !== void 0) {
      orderedPatternIndices.push(arrIdx);
    }
  }
  if (patternArray.length === 0) {
    const emptyPattern = {
      id: "pattern-0",
      name: "Pattern 0",
      length: NUM_ROWS,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
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
        sourceFormat: "GameMusicCreator",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: 0,
        originalInstrumentCount: NUM_SAMPLES
      }
    };
    patternArray.push(emptyPattern);
    orderedPatternIndices.push(0);
  }
  const name = filename.replace(/\.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "gameMusicCreator",
    patternDataFileOffset: HEADER_SIZE,
    bytesPerCell: 4,
    rowsPerPattern: NUM_ROWS,
    numChannels: NUM_CHANNELS,
    numPatterns,
    moduleSize: bytes.byteLength,
    encodeCell: encodeGameMusicCreatorCell
  };
  return {
    name,
    format: "MOD",
    patterns: patternArray,
    instruments,
    songPositions: orderedPatternIndices,
    songLength: orderedPatternIndices.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePatternLayout
  };
}
export {
  isGameMusicCreatorFormat,
  parseGameMusicCreatorFile
};
