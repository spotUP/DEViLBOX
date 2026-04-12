import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeSoundMonCell(cell) {
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;
  if (note > 0 && note > 36) {
    out[0] = note - 36 & 255;
  } else {
    out[0] = 0;
  }
  const instr = cell.instrument ?? 0;
  out[1] = (instr & 15) << 4 | (cell.effTyp ?? 0) & 15;
  out[2] = (cell.eff ?? 0) & 255;
  return out;
}
registerPatternEncoder("soundMon", () => encodeSoundMonCell);
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
function u8(buf, off) {
  return buf[off];
}
function s8(buf, off) {
  const v = buf[off];
  return v < 128 ? v : v - 256;
}
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
const PERIODS = [
  6848,
  6464,
  6080,
  5760,
  5440,
  5120,
  4832,
  4576,
  4320,
  4064,
  3840,
  3616,
  3424,
  3232,
  3040,
  2880,
  2720,
  2560,
  2416,
  2288,
  2160,
  2032,
  1920,
  1808,
  1712,
  1616,
  1520,
  1440,
  1360,
  1280,
  1208,
  1144,
  1080,
  1016,
  960,
  904,
  856,
  808,
  760,
  720,
  680,
  640,
  604,
  572,
  540,
  508,
  480,
  452,
  428,
  404,
  380,
  360,
  340,
  320,
  302,
  286,
  270,
  254,
  240,
  226,
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
  113,
  107,
  101,
  95,
  90,
  85,
  80,
  76,
  72,
  68,
  64,
  60,
  57
];
const PT_PERIODS = [
  // Octave 1 (C-1 to B-1)
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
  // Octave 2 (C-2 to B-2)
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
  // Octave 3 (C-3 to B-3)
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
  113,
  // Octave 4 (C-4 to B-4)
  107,
  101,
  95,
  90,
  85,
  80,
  76,
  72,
  68,
  64,
  60,
  57
];
function bpNoteToXM(note, transpose) {
  if (note === 0) return 0;
  const periodsIdx = note + transpose + 35;
  if (periodsIdx < 0 || periodsIdx >= PERIODS.length) return 0;
  const period = PERIODS[periodsIdx];
  if (period <= 0) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  const xmNote = bestIdx + 13;
  return Math.max(1, Math.min(96, xmNote));
}
const BPSOUNDMON_V1 = 1;
const BPSOUNDMON_V2 = 2;
const BPSOUNDMON_V3 = 3;
async function parseSoundMonFile(buffer, filename, moduleBase = 0) {
  const buf = new Uint8Array(buffer);
  if (buf.length < 32) throw new Error("File too small to be a SoundMon module");
  const title = readString(buf, 0, 26);
  const id = readString(buf, 26, 4);
  let version;
  let tables = 0;
  if (id === "BPSM") {
    version = BPSOUNDMON_V1;
  } else {
    const id3 = id.substring(0, 3);
    if (id3 === "V.2") version = BPSOUNDMON_V2;
    else if (id3 === "V.3") version = BPSOUNDMON_V3;
    else throw new Error(`Not a SoundMon file: id="${id}"`);
    tables = u8(buf, 29);
  }
  let pos = 30;
  const songLength = u16BE(buf, pos);
  pos += 2;
  const instruments = [];
  const instrTableOffset = pos;
  const instrFileOffsets = [];
  for (let i = 0; i < 15; i++) {
    const instrStartPos = pos;
    const firstByte = u8(buf, pos);
    if (firstByte === 255) {
      pos++;
      const table = u8(buf, pos);
      pos++;
      const length = u16BE(buf, pos) << 1;
      pos += 2;
      const adsrControl = u8(buf, pos);
      pos++;
      const adsrTable = u8(buf, pos) << 6;
      pos++;
      const adsrLen = u16BE(buf, pos);
      pos += 2;
      const adsrSpeed = u8(buf, pos);
      pos++;
      const lfoControl = u8(buf, pos);
      pos++;
      const lfoTable = u8(buf, pos) << 6;
      pos++;
      const lfoDepth = u8(buf, pos);
      pos++;
      const lfoLen = u16BE(buf, pos);
      pos += 2;
      let lfoDelay;
      let lfoSpeed;
      let egControl;
      let egTable;
      let egLen;
      let egDelay;
      let egSpeed;
      let fxControl = 0;
      let fxSpeed = 1;
      let fxDelay = 0;
      let modControl = 0;
      let modTable = 0;
      let modSpeed = 1;
      let modDelay = 0;
      let volume;
      let modLen = 0;
      if (version < BPSOUNDMON_V3) {
        pos++;
        lfoDelay = u8(buf, pos);
        pos++;
        lfoSpeed = u8(buf, pos);
        pos++;
        egControl = u8(buf, pos);
        pos++;
        egTable = u8(buf, pos) << 6;
        pos++;
        pos++;
        egLen = u16BE(buf, pos);
        pos += 2;
        pos++;
        egDelay = u8(buf, pos);
        pos++;
        egSpeed = u8(buf, pos);
        pos++;
        fxSpeed = 1;
        modSpeed = 1;
        volume = u8(buf, pos);
        pos++;
        pos += 6;
      } else {
        lfoDelay = u8(buf, pos);
        pos++;
        lfoSpeed = u8(buf, pos);
        pos++;
        egControl = u8(buf, pos);
        pos++;
        egTable = u8(buf, pos) << 6;
        pos++;
        egLen = u16BE(buf, pos);
        pos += 2;
        egDelay = u8(buf, pos);
        pos++;
        egSpeed = u8(buf, pos);
        pos++;
        fxControl = u8(buf, pos);
        pos++;
        fxSpeed = u8(buf, pos);
        pos++;
        fxDelay = u8(buf, pos);
        pos++;
        modControl = u8(buf, pos);
        pos++;
        modTable = u8(buf, pos) << 6;
        pos++;
        modSpeed = u8(buf, pos);
        pos++;
        modDelay = u8(buf, pos);
        pos++;
        volume = u8(buf, pos);
        pos++;
        modLen = u16BE(buf, pos);
        pos += 2;
      }
      instruments.push({
        synth: true,
        table,
        length,
        volume,
        adsrControl,
        adsrTable,
        adsrLen,
        adsrSpeed,
        lfoControl,
        lfoTable,
        lfoDepth,
        lfoLen,
        lfoDelay,
        lfoSpeed,
        egControl,
        egTable,
        egLen,
        egDelay,
        egSpeed,
        fxControl,
        fxSpeed,
        fxDelay,
        modControl,
        modTable,
        modLen,
        modDelay,
        modSpeed
      });
      instrFileOffsets.push({ base: instrStartPos, size: pos - instrStartPos });
    } else {
      const name = readString(buf, pos, 24);
      pos += 24;
      const length = u16BE(buf, pos) << 1;
      pos += 2;
      let loop = 0;
      let repeat = 2;
      let volume = 0;
      if (length > 0) {
        loop = u16BE(buf, pos) << 1;
        pos += 2;
        repeat = u16BE(buf, pos) << 1;
        pos += 2;
        volume = u16BE(buf, pos);
        pos += 2;
        if (loop + repeat >= length) {
          repeat = length - loop;
        }
      } else {
        repeat = 2;
        pos += 6;
      }
      instruments.push({
        synth: false,
        name,
        length,
        loop,
        repeat,
        volume,
        pointer: -1
      });
      instrFileOffsets.push({ base: instrStartPos, size: pos - instrStartPos });
    }
  }
  const trackLen = songLength * 4;
  const tracks = [];
  let higherPattern = 0;
  const trackDataOffset = pos;
  for (let i = 0; i < trackLen; i++) {
    const pattern = u16BE(buf, pos);
    pos += 2;
    const soundTranspose = s8(buf, pos);
    pos++;
    const transpose = s8(buf, pos);
    pos++;
    if (pattern > higherPattern) higherPattern = pattern;
    tracks.push({ pattern, soundTranspose, transpose });
  }
  const patternDataLen = higherPattern * 16;
  const patternRows = [];
  const patternDataOffset = pos;
  for (let i = 0; i < patternDataLen; i++) {
    const note = s8(buf, pos);
    pos++;
    const sampleByte = u8(buf, pos);
    pos++;
    const effect = sampleByte & 15;
    const sample = (sampleByte & 240) >> 4;
    const param = s8(buf, pos);
    pos++;
    patternRows.push({ note, sample, effect, param });
  }
  const synthTableData = new Uint8Array(tables * 64);
  const synthTablesOffset = pos;
  if (tables > 0) {
    const end = Math.min(pos + tables * 64, buf.length);
    synthTableData.set(buf.subarray(pos, end));
    pos = end;
  }
  const sampleDataOffset = pos;
  for (let i = 0; i < 15; i++) {
    const inst = instruments[i];
    if (inst.synth || inst.length === 0) continue;
    const sampleInst = inst;
    sampleInst.pointer = pos;
    pos += sampleInst.length;
  }
  const instrConfigs = [];
  for (let i = 0; i < 15; i++) {
    const inst = instruments[i];
    const id2 = i + 1;
    const instrOff = instrFileOffsets[i] ?? { base: instrTableOffset, size: 0 };
    const chipRam = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + instrOff.base,
      instrSize: instrOff.size,
      sections: {
        instrTable: moduleBase + instrTableOffset,
        trackData: moduleBase + trackDataOffset,
        patternData: moduleBase + patternDataOffset,
        synthTables: moduleBase + synthTablesOffset,
        sampleData: moduleBase + sampleDataOffset
      }
    };
    if (inst.synth) {
      const synthInst = inst;
      const tableOffset = synthInst.table << 6;
      const waveLen = 64;
      let waveData;
      if (tableOffset + waveLen <= synthTableData.length) {
        waveData = synthTableData.slice(tableOffset, tableOffset + waveLen);
      } else if (tableOffset < synthTableData.length) {
        waveData = new Uint8Array(waveLen);
        waveData.set(synthTableData.subarray(tableOffset));
      }
      const adsrTableOff = synthInst.adsrTable;
      const attackVol = adsrTableOff < synthTableData.length ? Math.abs(synthTableData[adsrTableOff] < 128 ? synthTableData[adsrTableOff] : synthTableData[adsrTableOff] - 256) : synthInst.volume;
      const sustainVol = Math.max(0, Math.min(64, synthInst.volume));
      const hasLfo = synthInst.lfoControl > 0 && synthInst.lfoDepth > 0;
      const smConfig = {
        type: "synth",
        waveType: synthInst.table & 15,
        // lower nibble as wave type index
        waveSpeed: 0,
        arpTable: new Array(16).fill(0),
        // SoundMon MOD table could populate this
        arpSpeed: 0,
        attackVolume: Math.min(64, Math.max(0, attackVol)),
        decayVolume: Math.min(64, sustainVol),
        sustainVolume: sustainVol,
        releaseVolume: 0,
        attackSpeed: Math.min(63, synthInst.adsrSpeed > 0 ? synthInst.adsrSpeed : 4),
        decaySpeed: 4,
        sustainLength: 0,
        // hold until note-off
        releaseSpeed: 4,
        vibratoDelay: hasLfo ? synthInst.lfoDelay : 0,
        vibratoSpeed: hasLfo ? Math.min(63, synthInst.lfoSpeed) : 0,
        vibratoDepth: hasLfo ? Math.min(63, synthInst.lfoDepth) : 0,
        portamentoSpeed: 0
      };
      instrConfigs.push({
        id: id2,
        name: `Synth ${i + 1}`,
        type: "synth",
        synthType: "SoundMonSynth",
        soundMon: smConfig,
        effects: [],
        volume: -6,
        pan: 0,
        uadeChipRam: chipRam
      });
    } else {
      const sampleInst = inst;
      if (sampleInst.length > 0 && sampleInst.pointer >= 0 && sampleInst.pointer + sampleInst.length <= buf.length) {
        const pcm = buf.slice(sampleInst.pointer, sampleInst.pointer + sampleInst.length);
        const hasLoop = sampleInst.repeat > 2;
        const loopStart = hasLoop ? sampleInst.loop : 0;
        const loopEnd = hasLoop ? sampleInst.loop + sampleInst.repeat : 0;
        const instr = createSamplerInstrument(
          id2,
          sampleInst.name || `Sample ${i + 1}`,
          pcm,
          sampleInst.volume,
          8287,
          loopStart,
          loopEnd
        );
        instr.uadeChipRam = chipRam;
        instrConfigs.push(instr);
      } else {
        const placeholder = makePlaceholder(id2, sampleInst.name || `Sample ${i + 1}`);
        placeholder.uadeChipRam = chipRam;
        instrConfigs.push(placeholder);
      }
    }
  }
  const trackerPatterns = [];
  for (let seqIdx = 0; seqIdx < songLength; seqIdx++) {
    const channelRows = [[], [], [], []];
    for (let row = 0; row < 16; row++) {
      for (let ch = 0; ch < 4; ch++) {
        const step = tracks[seqIdx * 4 + ch];
        if (!step || step.pattern === 0) {
          channelRows[ch].push(emptyCell());
          continue;
        }
        const rowIdx = (step.pattern - 1) * 16 + row;
        if (rowIdx < 0 || rowIdx >= patternRows.length) {
          channelRows[ch].push(emptyCell());
          continue;
        }
        const bpRow = patternRows[rowIdx];
        const note = bpRow.note;
        const option = bpRow.effect;
        const data = bpRow.param;
        let xmNote = 0;
        let xmInstrument = 0;
        if (note !== 0) {
          xmNote = bpNoteToXM(note, step.transpose);
          let instr = bpRow.sample;
          if (instr > 0) {
            instr += step.soundTranspose;
            if (instr >= 1 && instr <= 15) {
              xmInstrument = instr;
            }
          }
        }
        let effTyp = 0;
        let eff = 0;
        const absData = data < 0 ? -data : data;
        switch (option) {
          case 0:
            if (data !== 0) {
              effTyp = 0;
              eff = data & 255;
            }
            break;
          case 1:
            break;
          case 2:
            effTyp = 15;
            eff = absData & 255;
            break;
          case 3:
            effTyp = 14;
            eff = data ? 1 : 0;
            break;
          case 4:
            effTyp = 1;
            eff = absData & 255;
            break;
          case 5:
            effTyp = 2;
            eff = absData & 255;
            break;
          case 6:
            if (version === BPSOUNDMON_V3) {
              effTyp = 4;
              const vSpeed = Math.min(absData >> 4 & 15, 15);
              const vDepth = Math.min(absData & 15, 15);
              eff = vSpeed << 4 | vDepth;
            }
            break;
          case 7:
            if (version === BPSOUNDMON_V3) {
              effTyp = 11;
              eff = absData & 255;
            }
            break;
          case 8:
            if (data > 0) {
              effTyp = 2;
              eff = absData & 255;
            } else if (data < 0) {
              effTyp = 1;
              eff = absData & 255;
            }
            break;
          case 9:
            if (data !== 0) {
              effTyp = 0;
              eff = data & 255;
            }
            break;
        }
        let xmVolume = 0;
        if (option === 1) {
          const vol = Math.max(0, Math.min(64, absData));
          xmVolume = 16 + vol;
        } else if (note !== 0 && xmInstrument > 0 && xmInstrument <= instruments.length) {
          const inst = instruments[xmInstrument - 1];
          const instVol = Math.max(0, Math.min(64, inst.volume));
          xmVolume = 16 + instVol;
        }
        channelRows[ch].push({
          note: xmNote,
          instrument: xmInstrument,
          volume: xmVolume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
    }
    trackerPatterns.push({
      id: `pattern-${seqIdx}`,
      name: `Pattern ${seqIdx}`,
      length: 16,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        // Amiga LRRL panning
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: higherPattern,
        originalInstrumentCount: 15
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(createEmptyPattern(filename));
  }
  const moduleName = title.trim() || filename.replace(/\.[^/.]+$/, "");
  const versionStr = version === BPSOUNDMON_V1 ? "V1" : version === BPSOUNDMON_V2 ? "V2" : "V3";
  const uadePatternLayout = {
    formatId: "soundMon",
    patternDataFileOffset: patternDataOffset,
    bytesPerCell: 3,
    rowsPerPattern: 16,
    numChannels: 4,
    numPatterns: trackerPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSoundMonCell,
    getCellFileOffset: (pattern, row, channel) => {
      const step = tracks[pattern * 4 + channel];
      if (!step || step.pattern === 0) return 0;
      const rowIdx = (step.pattern - 1) * 16 + row;
      return patternDataOffset + rowIdx * 3;
    }
  };
  return {
    name: `${moduleName} [SoundMon ${versionStr}]`,
    format: "MOD",
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makePlaceholder(id, name) {
  return {
    id,
    name: name.replace(/\0/g, "").trim() || `Sample ${id}`,
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: -6,
    pan: 0
  };
}
function createEmptyPattern(filename) {
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: 16,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 16 }, () => emptyCell())
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
}
export {
  parseSoundMonFile
};
