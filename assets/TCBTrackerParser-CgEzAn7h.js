import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeTCBTrackerCell(cell) {
  const out = new Uint8Array(2);
  const xmNote = cell.note ?? 0;
  if (xmNote > 0 && xmNote <= 96) {
    const octave = Math.floor((xmNote - 1) / 12);
    const semitone = (xmNote - 1) % 12;
    if (octave >= 1 && octave <= 3) {
      out[0] = octave << 4 | semitone;
    } else {
      out[0] = 0;
    }
  } else {
    out[0] = 0;
  }
  const instr = Math.max(0, (cell.instrument ?? 0) - 1) & 15;
  let effect = 0;
  const effTyp = cell.effTyp ?? 0;
  if (effTyp === 13) {
    effect = 13;
  }
  out[1] = instr << 4 | effect & 15;
  return out;
}
registerPatternEncoder("tcbTracker", () => encodeTCBTrackerCell);
const MIN_FILE_SIZE = 306;
const NUM_SAMPLES = 16;
const AMIGA_SAMPLE_RATE = 8363;
function u8(buf, off) {
  return buf[off];
}
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function readStr(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
function isTCBTrackerFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    const base = (filename.split("/").pop() ?? filename).toLowerCase();
    if (!base.startsWith("tcb.") && !base.endsWith(".tcb")) return false;
  }
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== 1095639107) return false;
  const sig4 = u32BE(buf, 4);
  let fmt;
  if (sig4 === 1330596897) {
    fmt = 1;
  } else if (sig4 === 1330596910) {
    fmt = 2;
  } else {
    return false;
  }
  const nbPatt = u32BE(buf, 8);
  if (nbPatt > 127) return false;
  if (buf[12] > 15) return false;
  if (buf[13] !== 0) return false;
  const seqLen = buf[142];
  if (seqLen === 0 || seqLen > 127) return false;
  const pattBase = fmt === 1 ? 272 : 306;
  const a1 = pattBase + nbPatt * 512;
  const a3 = a1 + 212;
  if (a3 >= buf.length) return false;
  if (a3 - 144 < 0) return false;
  if (a3 - 144 + 3 >= buf.length) return false;
  if (u32BE(buf, a3 - 8) !== 4294967295) return false;
  if (u32BE(buf, a3 - 4) !== 0) return false;
  if (u32BE(buf, a3 - 144) !== 212) return false;
  return true;
}
async function parseTCBTrackerFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isTCBTrackerFormat(buffer, filename)) {
    throw new Error("Not a TCB Tracker module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^tcb\./i, "") || baseName;
  const isNewFmt = buf[7] === 46;
  const numPatterns = u32BE(buf, 8);
  const tempo = u8(buf, 12);
  const numOrders = u8(buf, 142);
  const amigaFreqs = isNewFmt ? u16BE(buf, 144) : 0;
  const noteOffset = isNewFmt && amigaFreqs !== 0 ? 0 : 3;
  const instrNamesOff = isNewFmt ? 146 : 144;
  const instrNames = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    instrNames.push(readStr(buf, instrNamesOff + i * 8, 8));
  }
  const pattBase = isNewFmt ? 306 : 272;
  const sampleStart = pattBase + numPatterns * 512;
  const h1Start = sampleStart + 4;
  const h2Start = h1Start + NUM_SAMPLES * 4;
  const instruments = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const h1 = h1Start + i * 4;
    const h2 = h2Start + i * 8;
    const volume = Math.min(u8(buf, h1), 127);
    const rawLoopEnd = u16BE(buf, h1 + 2);
    const offset = u32BE(buf, h2);
    const length = u32BE(buf, h2 + 4);
    if (length === 0 || length > 2097152) continue;
    const pcmStart = sampleStart + offset;
    const pcmEnd = pcmStart + length;
    if (pcmEnd > buf.length) continue;
    const unsigned = buf.slice(pcmStart, pcmEnd);
    const pcm = new Uint8Array(length);
    for (let j = 0; j < length; j++) {
      pcm[j] = (unsigned[j] ^ 128) & 255;
    }
    let loopStart = 0;
    let loopEnd = 0;
    if (rawLoopEnd !== 0 && rawLoopEnd < length) {
      loopStart = length - rawLoopEnd;
      loopEnd = length;
    }
    const name = instrNames[i] || `Sample ${i + 1}`;
    const instr = createSamplerInstrument(i + 1, name, pcm, volume, AMIGA_SAMPLE_RATE, loopStart, loopEnd);
    const chipRam = {
      moduleBase: 0,
      moduleSize: buf.length,
      instrBase: h1Start + i * 4,
      // file offset of this sample's h1 header entry (4 bytes)
      instrSize: 12,
      // h1 entry (4 bytes) + h2 entry (8 bytes) per sample slot
      sections: {}
    };
    instr.uadeChipRam = chipRam;
    instruments.push(instr);
  }
  const PANNING = [-50, 50, 50, -50];
  const patterns = [];
  for (let pat = 0; pat < numPatterns; pat++) {
    const patOffset = pattBase + pat * 512;
    const channelRows = [[], [], [], []];
    for (let row = 0; row < 64; row++) {
      for (let ch = 0; ch < 4; ch++) {
        const cellOff = patOffset + row * 8 + ch * 2;
        if (cellOff + 2 > buf.length) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const noteByte = u8(buf, cellOff);
        const instrEffect = u8(buf, cellOff + 1);
        const rawInstr = (instrEffect >> 4) + 1;
        const effectType = instrEffect & 15;
        let xmNote = 0;
        if (noteByte >= 16 && noteByte <= 59) {
          const octave = noteByte >> 4;
          const semitone = noteByte & 15;
          if (semitone < 12) {
            xmNote = octave * 12 + semitone + 37 + noteOffset;
          }
        }
        let effTyp = 0;
        let eff = 0;
        if (effectType === 13) {
          effTyp = 13;
          eff = 0;
        }
        channelRows[ch].push({
          note: xmNote,
          instrument: xmNote > 0 || effectType > 0 ? rawInstr : 0,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
    }
    patterns.push({
      id: `pattern-${pat}`,
      name: `Pattern ${pat}`,
      length: 64,
      channels: channelRows.map((rows, ch) => ({
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
      })),
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instruments.length
      }
    });
  }
  if (patterns.length === 0) {
    patterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: 64,
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
        rows: Array.from({ length: 64 }, () => ({
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
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const orderCount = Math.max(1, numOrders);
  const songPositions = Array.from({ length: orderCount }, (_, i) => {
    const patIdx = buf[14 + i] || 0;
    return Math.min(patIdx, patterns.length - 1);
  });
  const uadePatternLayout = {
    formatId: "tcbTracker",
    patternDataFileOffset: pattBase,
    bytesPerCell: 2,
    rowsPerPattern: 64,
    numChannels: 4,
    numPatterns,
    moduleSize: buf.length,
    encodeCell: encodeTCBTrackerCell
  };
  return {
    name: `${moduleName} [TCB Tracker]`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: orderCount,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 16 - tempo,
    // OpenMPT: Order().SetDefaultSpeed(16 - fileHeader.tempo)
    initialBPM: 125,
    linearPeriods: false,
    uadePatternLayout,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isTCBTrackerFormat,
  parseTCBTrackerFile
};
