import { b$ as registerPatternEncoder, c2 as createSamplerInstrument, c7 as amigaNoteToXM } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function xmNoteToJC(xmNote) {
  if (xmNote === 0) return 0;
  const jcNote = xmNote - 12;
  if (jcNote < 1 || jcNote > 36) return 0;
  return jcNote;
}
function encodeJCCell(cell) {
  const out = new Uint8Array(8);
  out[0] = xmNoteToJC(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  out[1] = instr & 255;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  if (effTyp === 15 && eff > 0) {
    out[2] = eff;
  } else if (effTyp === 0 && eff > 0) {
    out[3] = eff;
  } else if (effTyp === 4 && eff > 0) {
    out[4] = eff;
  } else if (effTyp === 3 && eff > 0) {
    out[7] = eff;
  }
  const volCol = cell.volume ?? 0;
  if (volCol >= 16 && volCol <= 80) {
    out[6] = volCol - 16 + 1;
  }
  return out;
}
registerPatternEncoder("jamCracker", () => encodeJCCell);
function u8(view, off) {
  return view.getUint8(off);
}
function i8(view, off) {
  return view.getInt8(off);
}
function u16(view, off) {
  return view.getUint16(off, false);
}
function u32(view, off) {
  return view.getUint32(off, false);
}
function readString(view, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const ch = view.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
}
function isJamCrackerFormat(buffer) {
  if (buffer.byteLength < 10) return false;
  const view = new DataView(buffer);
  return readString(view, 0, 4) === "BeEp";
}
async function parseJamCrackerFile(buffer, filename) {
  var _a;
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (buffer.byteLength < 10) throw new Error("JamCracker: file too small");
  const magic = readString(view, 0, 4);
  if (magic !== "BeEp") throw new Error(`JamCracker: bad magic "${magic}"`);
  const noi = u16(view, 4);
  const INST_STRIDE = 40;
  const INST_START = 6;
  if (INST_START + noi * INST_STRIDE > buffer.byteLength) {
    throw new Error("JamCracker: truncated instrument table");
  }
  const jcInstruments = [];
  for (let i = 0; i < noi; i++) {
    const base = INST_START + i * INST_STRIDE;
    const name = readString(view, base, 31).trim();
    const flags = u8(view, base + 31);
    const size = u32(view, base + 32);
    jcInstruments.push({ name, flags, size });
  }
  let pos = INST_START + noi * INST_STRIDE;
  if (pos + 2 > buffer.byteLength) throw new Error("JamCracker: truncated pattern count");
  const nop = u16(view, pos);
  pos += 2;
  const PATT_STRIDE = 6;
  if (pos + nop * PATT_STRIDE > buffer.byteLength) {
    throw new Error("JamCracker: truncated pattern table");
  }
  const jcPatterns = [];
  for (let i = 0; i < nop; i++) {
    const rows = u16(view, pos);
    jcPatterns.push({ rows: rows > 0 ? rows : 64 });
    pos += PATT_STRIDE;
  }
  if (pos + 2 > buffer.byteLength) throw new Error("JamCracker: truncated song length");
  const songLen = u16(view, pos);
  pos += 2;
  const songTable = [];
  for (let i = 0; i < songLen; i++) {
    if (pos + 2 > buffer.byteLength) break;
    songTable.push(u16(view, pos));
    pos += 2;
  }
  const patternDataFileOffset = pos;
  const patternData = [];
  for (let p = 0; p < nop; p++) {
    const rowCount = jcPatterns[p].rows;
    const pattRows = [];
    for (let row = 0; row < rowCount; row++) {
      const rowNotes = [];
      for (let ch = 0; ch < 4; ch++) {
        if (pos + 8 > buffer.byteLength) {
          rowNotes.push({ period: 0, instr: 0, speed: 0, arpeggio: 0, vibrato: 0, phase: 0, volume: 0, porta: 0 });
          continue;
        }
        rowNotes.push({
          period: u8(view, pos),
          instr: i8(view, pos + 1),
          speed: u8(view, pos + 2),
          arpeggio: u8(view, pos + 3),
          vibrato: u8(view, pos + 4),
          phase: u8(view, pos + 5),
          volume: u8(view, pos + 6),
          porta: u8(view, pos + 7)
        });
        pos += 8;
      }
      pattRows.push(rowNotes);
    }
    patternData.push(pattRows);
  }
  const sampleBuffers = [];
  const amSampleBuffers = [];
  for (let i = 0; i < noi; i++) {
    const size = jcInstruments[i].size;
    const isAM = (jcInstruments[i].flags & 2) !== 0;
    if (size === 0) {
      sampleBuffers.push(null);
      amSampleBuffers.push(null);
    } else if (isAM) {
      const avail = Math.min(size, Math.max(0, buffer.byteLength - pos));
      amSampleBuffers.push(avail > 0 ? bytes.slice(pos, pos + avail) : null);
      sampleBuffers.push(null);
      pos += size;
    } else {
      const avail = Math.min(size, Math.max(0, buffer.byteLength - pos));
      sampleBuffers.push(avail > 0 ? bytes.slice(pos, pos + avail) : null);
      amSampleBuffers.push(null);
      pos += size;
    }
  }
  const instruments = [];
  for (let i = 0; i < noi; i++) {
    const inst = jcInstruments[i];
    const isAM = (inst.flags & 2) !== 0;
    const hasLoop = (inst.flags & 1) !== 0;
    const pcm = sampleBuffers[i];
    const name = inst.name || `Sample ${i + 1}`;
    const jcConfig = {
      name,
      flags: inst.flags,
      phaseDelta: 0,
      volume: 64,
      sampleSize: inst.size,
      isAM,
      hasLoop
    };
    if (isAM && amSampleBuffers[i]) {
      jcConfig.waveformData = amSampleBuffers[i];
    }
    if (isAM || pcm === null) {
      instruments.push({
        id: i + 1,
        name,
        type: "synth",
        synthType: "JamCrackerSynth",
        effects: [],
        volume: -60,
        pan: 0,
        jamCracker: jcConfig
      });
    } else {
      const loopStart = 0;
      const loopEnd = hasLoop ? pcm.length : 0;
      const samplerInst = createSamplerInstrument(i + 1, name, pcm, 64, 8287, loopStart, loopEnd);
      samplerInst.jamCracker = jcConfig;
      instruments.push(samplerInst);
    }
  }
  const PANNING = [-50, 50, 50, -50];
  const patterns = patternData.map((pRows, pIdx) => {
    const channels = Array.from({ length: 4 }, (_, ch) => {
      const rows = pRows.map((rowNotes) => {
        const n = rowNotes[ch];
        const xmNote = n.period > 0 ? amigaNoteToXM(n.period) : 0;
        const instrNum = n.instr > 0 ? n.instr : 0;
        const volCol = n.volume > 0 ? 16 + Math.min(n.volume - 1, 64) : 0;
        let effTyp = 0, eff = 0;
        if (n.speed > 0) {
          effTyp = 15;
          eff = n.speed;
        } else if (n.arpeggio > 0) {
          effTyp = 0;
          eff = n.arpeggio;
        } else if (n.vibrato > 0) {
          effTyp = 4;
          eff = n.vibrato;
        } else if (n.porta > 0) {
          effTyp = 3;
          eff = n.porta;
        }
        return {
          note: xmNote,
          instrument: instrNum,
          volume: volCol,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        };
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
      id: `pattern-${pIdx}`,
      name: `Pattern ${pIdx}`,
      length: pRows.length,
      channels,
      importMetadata: {
        sourceFormat: "JamCracker",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: nop,
        originalInstrumentCount: noi
      }
    };
  });
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
        sourceFormat: "JamCracker",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const songPositions = songTable.filter((idx) => idx < nop).map((idx) => idx);
  if (songPositions.length === 0) songPositions.push(0);
  let initialSpeed = 6;
  if (songPositions.length > 0) {
    const firstPatt = patternData[songPositions[0]];
    if ((firstPatt == null ? void 0 : firstPatt.length) > 0) {
      for (const cell of firstPatt[0]) {
        if (cell.speed > 0) {
          initialSpeed = cell.speed;
          break;
        }
      }
    }
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const BYTES_PER_CELL = 8;
  const NUM_CHANNELS = 4;
  const patternFileOffsets = [];
  let accumOffset = patternDataFileOffset;
  for (let p = 0; p < nop; p++) {
    patternFileOffsets.push(accumOffset);
    accumOffset += jcPatterns[p].rows * NUM_CHANNELS * BYTES_PER_CELL;
  }
  const uadePatternLayout = {
    formatId: "jamCracker",
    patternDataFileOffset,
    bytesPerCell: BYTES_PER_CELL,
    rowsPerPattern: ((_a = jcPatterns[0]) == null ? void 0 : _a.rows) ?? 64,
    numChannels: NUM_CHANNELS,
    numPatterns: nop,
    moduleSize: buffer.byteLength,
    encodeCell: encodeJCCell,
    getCellFileOffset(pattern, row, channel) {
      if (pattern < 0 || pattern >= nop) return -1;
      if (row < 0 || row >= jcPatterns[pattern].rows) return -1;
      if (channel < 0 || channel >= NUM_CHANNELS) return -1;
      return patternFileOffsets[pattern] + (row * NUM_CHANNELS + channel) * BYTES_PER_CELL;
    }
  };
  return {
    name: moduleName,
    format: "JamCracker",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    jamCrackerFileData: buffer.slice(0),
    uadePatternLayout
  };
}
export {
  isJamCrackerFormat,
  parseJamCrackerFile
};
