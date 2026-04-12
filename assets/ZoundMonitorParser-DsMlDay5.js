import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeZoundMonitorCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  let zmNote = 0;
  if (note === 97) {
    zmNote = 63;
  } else if (note > 36 && note <= 72) {
    zmNote = note - 36;
  }
  let control = 0;
  let effectParam = 0;
  switch (effTyp) {
    case 0:
      if (eff !== 0) {
        control = 1;
        effectParam = eff;
      }
      break;
    case 1:
      control = 2;
      effectParam = 256 - Math.min(eff, 255) & 255;
      break;
    case 2:
      control = 2;
      effectParam = Math.min(eff, 255);
      break;
    case 3:
      control = 3;
      effectParam = eff;
      break;
  }
  let volAdd = 0;
  const vol = cell.volume ?? 0;
  if (vol >= 16 && vol <= 80) {
    volAdd = vol - 16 - 64;
  }
  const volAddByte = volAdd < 0 ? 256 + volAdd & 255 : volAdd & 255;
  const word = (zmNote & 63) << 24 | (instr & 15) << 20 | (control & 15) << 16 | (volAddByte & 255) << 8 | effectParam & 255;
  out[0] = word >>> 24 & 255;
  out[1] = word >>> 16 & 255;
  out[2] = word >>> 8 & 255;
  out[3] = word & 255;
  return out;
}
registerPatternEncoder("zoundMonitor", () => encodeZoundMonitorCell);
const NUM_SAMPLE_SLOTS = 16;
const ROWS_PER_PART = 32;
const SAMPLE_DESC_SIZE = 54;
const PANNING = [-50, 50, 50, -50];
function u8(buf, off) {
  return buf[off];
}
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function i8(buf, off) {
  const v = buf[off];
  return v < 128 ? v : v - 256;
}
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const ch = buf[off + i];
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}
function zmNoteToXM(zmNote) {
  if (zmNote === 0) return 0;
  if (zmNote === 63) return 97;
  if (zmNote < 1 || zmNote > 36) return 0;
  return zmNote + 12;
}
function zmEffectToXM(control, param) {
  const bit0 = (control & 1) !== 0;
  const bit1 = (control & 2) !== 0;
  if (bit0 && !bit1) {
    if (param !== 0) return { effTyp: 0, eff: param };
  } else if (!bit0 && bit1) {
    const signed = param < 128 ? param : param - 256;
    if (signed < 0) {
      return { effTyp: 1, eff: Math.min(Math.abs(signed), 255) };
    } else if (signed > 0) {
      return { effTyp: 2, eff: Math.min(signed, 255) };
    }
  } else if (bit0 && bit1) {
    return { effTyp: 3, eff: param };
  }
  return { effTyp: 0, eff: 0 };
}
function isZoundMonitorFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    const base = (filename.split("/").pop() ?? filename).toLowerCase();
    if (!base.endsWith(".sng") && !base.startsWith("sng.")) return false;
  }
  if (buf.length < 870) return false;
  const offset = (buf[0] + 1) * 16 + (buf[1] + 1) * 128 + 869;
  if (offset >= buf.length) return false;
  if (offset + 3 >= buf.length) return false;
  const b0 = buf[offset];
  const b1 = buf[offset + 1];
  const b2 = buf[offset + 2];
  const b3 = buf[offset + 3];
  if (b0 === 100) {
    return b1 === 102 && b3 === 58;
  } else {
    return b1 === 97 && b2 === 109 && b3 === 112;
  }
}
async function parseZoundMonitorFile(buffer, filename, companionFiles) {
  if (!isZoundMonitorFormat(buffer, filename)) {
    throw new Error("Not a ZoundMonitor module");
  }
  const buf = new Uint8Array(buffer);
  const header = {
    maxTable: u8(buf, 0),
    maxPart: u8(buf, 1),
    startTab: u8(buf, 2),
    endTab: u8(buf, 3),
    speed: u8(buf, 4)
  };
  const speed = Math.max(1, header.speed);
  const sampleDescs = [];
  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const off = 5 + i * SAMPLE_DESC_SIZE;
    const name = readString(buf, off + 4, 40);
    const vol = u8(buf, off + 44);
    const length = u16BE(buf, off + 46);
    const replen = u16BE(buf, off + 48);
    const restart = u16BE(buf, off + 50);
    const preset = u8(buf, off + 52);
    sampleDescs.push({ name, volume: Math.min(vol, 64), length, replen, restart, preset });
  }
  const tableDataStart = 5 + NUM_SAMPLE_SLOTS * SAMPLE_DESC_SIZE;
  const numTableEntries = header.maxTable + 1;
  const table = [];
  for (let t = 0; t < numTableEntries; t++) {
    const row = [];
    for (let v = 0; v < 4; v++) {
      const off = tableDataStart + t * 16 + v * 4;
      row.push({
        partno: u8(buf, off),
        volume: i8(buf, off + 1),
        instradd: u8(buf, off + 2),
        noteadd: u8(buf, off + 3)
      });
    }
    table.push(row);
  }
  const partDataStart = tableDataStart + numTableEntries * 16;
  const numParts = header.maxPart + 1;
  const parts = [];
  for (let p = 0; p < numParts; p++) {
    const rows = [];
    for (let r = 0; r < ROWS_PER_PART; r++) {
      const off = partDataStart + p * 128 + r * 4;
      const data = u32BE(buf, off);
      rows.push({
        dmaFlag: (data & 2147483648) !== 0,
        note: data >>> 24 & 63,
        sample: data >>> 20 & 15,
        control: data >>> 16 & 15,
        volAdd: (data >>> 8 & 255) < 128 ? data >>> 8 & 255 : (data >>> 8 & 255) - 256,
        effectParam: data & 255
      });
    }
    parts.push(rows);
  }
  const samplePCM = new Array(NUM_SAMPLE_SLOTS).fill(null);
  if (companionFiles && companionFiles.size > 0) {
    const lowerMap = /* @__PURE__ */ new Map();
    for (const [name, data] of companionFiles) {
      const baseName2 = (name.split("/").pop() ?? name).toLowerCase();
      lowerMap.set(baseName2, data);
    }
    for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
      const desc = sampleDescs[i];
      if (!desc.name) continue;
      const sampleBaseName = (desc.name.split("/").pop() ?? desc.name).split(":").pop().split("!").pop().toLowerCase().replace(/\.smp$/i, "");
      let pcmBuf = lowerMap.get(sampleBaseName) ?? lowerMap.get(sampleBaseName + ".smp") ?? lowerMap.get(desc.name.toLowerCase());
      if (pcmBuf) {
        const pcmBytes = new Uint8Array(pcmBuf);
        const cleaned = new Uint8Array(pcmBytes.length);
        cleaned.set(pcmBytes);
        if (cleaned.length >= 2) {
          cleaned[0] = 0;
          cleaned[1] = 0;
        }
        samplePCM[i] = cleaned;
      }
    }
  }
  const instruments = [];
  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const desc = sampleDescs[i];
    const id = i + 1;
    const displayName = desc.name ? (desc.name.split("/").pop() ?? desc.name).split(":").pop().split("!").pop().replace(/\.smp$/i, "").trim() || `Sample ${id}` : `Sample ${id}`;
    const pcm = samplePCM[i];
    if (pcm && pcm.length > 0) {
      const byteLenFromFile = desc.length * 2;
      const actualLen = Math.min(pcm.length, byteLenFromFile > 0 ? byteLenFromFile : pcm.length);
      const sampleData = pcm.subarray(0, actualLen);
      let loopStart = 0;
      let loopEnd = 0;
      if (desc.replen > 1) {
        loopStart = desc.restart * 2;
        loopEnd = loopStart + desc.replen * 2;
        loopEnd = Math.min(loopEnd, sampleData.length);
      }
      instruments.push(
        createSamplerInstrument(id, displayName, sampleData, desc.volume, 8287, loopStart, loopEnd)
      );
    } else {
      instruments.push({
        id,
        name: displayName,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: desc.volume > 0 ? 20 * Math.log10(desc.volume / 64) : -60,
        pan: 0,
        metadata: {
          modPlayback: {
            usePeriodPlayback: true,
            periodMultiplier: 3546895,
            finetune: 0,
            defaultVolume: desc.volume
          }
        }
      });
    }
  }
  const builtPatterns = [];
  const usedSampleCount = sampleDescs.filter((s) => s.name && s.length > 0).length;
  for (let tabIdx = 0; tabIdx < numTableEntries; tabIdx++) {
    const tabRow = table[tabIdx];
    const channels = Array.from({ length: 4 }, (_, ch) => {
      const tabEntry = tabRow[ch];
      const partIdx = Math.min(tabEntry.partno, numParts - 1);
      const part = parts[partIdx];
      if (!part) {
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
          rows: Array.from({ length: ROWS_PER_PART }, () => ({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          }))
        };
      }
      const rows = [];
      for (let row = 0; row < ROWS_PER_PART; row++) {
        const pr = part[row];
        if (pr.note === 0 && pr.sample === 0 && pr.control === 0 && pr.volAdd === 0 && pr.effectParam === 0) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        let noteNum = pr.note;
        if (noteNum > 0 && noteNum !== 63 && noteNum <= 36) {
          if ((pr.control & 4) === 0 && tabEntry.noteadd > 0) {
            noteNum = Math.min(noteNum + tabEntry.noteadd, 36);
          }
        }
        const xmNote = zmNoteToXM(noteNum);
        let sampleNum = pr.sample;
        if (sampleNum > 0 && (pr.control & 8) === 0 && tabEntry.instradd > 0) {
          sampleNum = Math.min(sampleNum + tabEntry.instradd, 15);
        }
        const instrNum = sampleNum;
        const { effTyp, eff } = zmEffectToXM(pr.control, pr.effectParam);
        let volCol = 0;
        if (pr.volAdd !== 0 || tabEntry.volume !== 0) {
          const effectiveVol = Math.max(0, Math.min(64, 64 + pr.volAdd + tabEntry.volume));
          volCol = 16 + effectiveVol;
        }
        rows.push({
          note: xmNote,
          instrument: instrNum,
          volume: volCol,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
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
    builtPatterns.push({
      id: `pattern-${tabIdx}`,
      name: `Pattern ${tabIdx}`,
      length: ROWS_PER_PART,
      channels,
      importMetadata: {
        sourceFormat: "ZoundMonitor",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numParts,
        originalInstrumentCount: usedSampleCount
      }
    });
  }
  if (builtPatterns.length === 0) {
    builtPatterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: ROWS_PER_PART,
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
        rows: Array.from({ length: ROWS_PER_PART }, () => ({
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
        sourceFormat: "ZoundMonitor",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const startTab = Math.min(header.startTab, builtPatterns.length - 1);
  const endTab = Math.min(header.endTab, builtPatterns.length);
  const songPositions = [];
  for (let p = startTab; p < endTab; p++) songPositions.push(p);
  if (songPositions.length === 0) {
    for (let p = 0; p < builtPatterns.length; p++) songPositions.push(p);
  }
  const initialBPM = 125;
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^sng\./i, "").replace(/\.sng$/i, "") || baseName;
  const uadePatternLayout = {
    formatId: "zoundMonitor",
    patternDataFileOffset: partDataStart,
    bytesPerCell: 4,
    rowsPerPattern: ROWS_PER_PART,
    numChannels: 4,
    numPatterns: builtPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeZoundMonitorCell,
    getCellFileOffset: (pattern, row, channel) => {
      if (pattern >= table.length) return 0;
      const tabRow = table[pattern];
      const tabEntry = tabRow[channel];
      if (!tabEntry) return 0;
      const partIdx = Math.min(tabEntry.partno, numParts - 1);
      return partDataStart + partIdx * 128 + row * 4;
    }
  };
  return {
    name: moduleName,
    format: "MOD",
    patterns: builtPatterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: speed,
    initialBPM,
    linearPeriods: false,
    uadePatternLayout
  };
}
export {
  isZoundMonitorFormat,
  parseZoundMonitorFile
};
