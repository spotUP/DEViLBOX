import { b$ as registerPatternEncoder, c2 as createSamplerInstrument, c7 as amigaNoteToXM, c3 as periodToNoteIndex } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeDeltaMusic1Cell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  out[0] = instr > 0 ? instr - 1 & 255 : 0;
  if (note > 0 && note > 36) {
    out[1] = Math.min(83, note - 36);
  } else {
    out[1] = 0;
  }
  out[2] = (cell.effTyp ?? 0) & 255;
  out[3] = (cell.eff ?? 0) & 255;
  return out;
}
registerPatternEncoder("deltaMusic1", () => encodeDeltaMusic1Cell);
const PAL_CLOCK = 3546895;
const DM1_PERIODS = [
  0,
  6848,
  6464,
  6096,
  5760,
  5424,
  5120,
  4832,
  4560,
  4304,
  4064,
  3840,
  3616,
  3424,
  3232,
  3048,
  2880,
  2712,
  2560,
  2416,
  2280,
  2152,
  2032,
  1920,
  1808,
  1712,
  1616,
  1524,
  1440,
  1356,
  1280,
  1208,
  1140,
  1076,
  960,
  904,
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
  452,
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
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113,
  113
];
const PCM_BASE_RATE = Math.round(PAL_CLOCK / (2 * 214));
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function s8(v) {
  return v < 128 ? v : v - 256;
}
function isDeltaMusic1Format(buffer) {
  if (buffer.byteLength < 104) return false;
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 65 || bytes[1] !== 76 || bytes[2] !== 76 || bytes[3] !== 32) {
    return false;
  }
  let totalLength = 104;
  for (let i = 0; i < 25; i++) {
    totalLength += u32BE(bytes, 4 + i * 4);
    if (totalLength > buffer.byteLength) return false;
  }
  return true;
}
function buildDM1Config(inst) {
  return {
    volume: inst.volume,
    attackStep: inst.attackStep,
    attackDelay: inst.attackDelay,
    decayStep: inst.decayStep,
    decayDelay: inst.decayDelay,
    sustain: inst.sustain,
    releaseStep: inst.releaseStep,
    releaseDelay: inst.releaseDelay,
    vibratoWait: inst.vibratoWait,
    vibratoStep: inst.vibratoStep,
    vibratoLength: inst.vibratoLength,
    bendRate: inst.bendRate,
    portamento: inst.portamento,
    tableDelay: inst.tableDelay,
    arpeggio: [...inst.arpeggio],
    isSample: inst.isSample,
    table: inst.table ? [...inst.table] : null,
    sampleData: inst.sampleData ? Array.from(inst.sampleData) : void 0
  };
}
function dm1NoteToXM(noteIndex) {
  if (noteIndex <= 0) return 0;
  const idx = Math.max(0, Math.min(83, noteIndex));
  const period = DM1_PERIODS[idx];
  if (period === 0) return 0;
  const amigaIdx = periodToNoteIndex(period);
  return amigaNoteToXM(amigaIdx);
}
async function parseDeltaMusic1File(buffer, filename) {
  if (!isDeltaMusic1Format(buffer)) {
    throw new Error(`[DeltaMusic1Parser] Not a Delta Music 1.0 file: ${filename}`);
  }
  const bytes = new Uint8Array(buffer);
  const trackLengths = [];
  for (let i = 0; i < 4; i++) {
    trackLengths.push(u32BE(bytes, 4 + i * 4));
  }
  const blockSectionLength = u32BE(bytes, 20);
  const instrumentLengths = [];
  for (let i = 0; i < 20; i++) {
    instrumentLengths.push(u32BE(bytes, 24 + i * 4));
  }
  let off = 104;
  const tracks = [];
  for (let ch = 0; ch < 4; ch++) {
    const entryCount = trackLengths[ch] / 2;
    const entries = [];
    for (let j = 0; j < entryCount; j++) {
      entries.push({
        blockNumber: bytes[off],
        transpose: s8(bytes[off + 1])
      });
      off += 2;
    }
    tracks.push(entries);
  }
  const blockDataFileOffset = off;
  const numBlocks = Math.floor(blockSectionLength / 64);
  const blocks = [];
  for (let b = 0; b < numBlocks; b++) {
    const rows = [];
    for (let row = 0; row < 16; row++) {
      rows.push({
        instrument: bytes[off],
        note: bytes[off + 1],
        effect: bytes[off + 2],
        effectArg: bytes[off + 3]
      });
      off += 4;
    }
    blocks.push(rows);
  }
  const instrumentTableOffset = off;
  const instruments = [];
  const instrumentFileOffsets = [];
  for (let i = 0; i < 20; i++) {
    const instLen = instrumentLengths[i];
    if (instLen === 0) {
      instrumentFileOffsets.push(-1);
      instruments.push({
        number: i,
        attackStep: 0,
        attackDelay: 0,
        decayStep: 0,
        decayDelay: 0,
        sustain: 0,
        releaseStep: 0,
        releaseDelay: 0,
        volume: 0,
        vibratoWait: 0,
        vibratoStep: 0,
        vibratoLength: 0,
        bendRate: 0,
        portamento: 0,
        isSample: false,
        tableDelay: 0,
        arpeggio: new Array(8).fill(0),
        sampleLength: 0,
        repeatStart: 0,
        repeatLength: 0,
        table: null,
        sampleData: null
      });
      continue;
    }
    instrumentFileOffsets.push(off);
    const base = off;
    const attackStep = bytes[base + 0];
    const attackDelay = bytes[base + 1];
    const decayStep = bytes[base + 2];
    const decayDelay = bytes[base + 3];
    const sustain = u16BE(bytes, base + 4);
    const releaseStep = bytes[base + 6];
    const releaseDelay = bytes[base + 7];
    const volume = bytes[base + 8];
    const vibratoWait = bytes[base + 9];
    const vibratoStep = bytes[base + 10];
    const vibratoLength = bytes[base + 11];
    const bendRate = s8(bytes[base + 12]);
    const portamento = bytes[base + 13];
    const isSample = bytes[base + 14] !== 0;
    const tableDelay = bytes[base + 15];
    const arpeggio = [];
    for (let a2 = 0; a2 < 8; a2++) {
      arpeggio.push(bytes[base + 16 + a2]);
    }
    const sampleLength = u16BE(bytes, base + 24);
    const repeatStart = u16BE(bytes, base + 26);
    const repeatLength = u16BE(bytes, base + 28);
    let table = null;
    let headerSize;
    if (!isSample) {
      table = [];
      for (let t = 0; t < 48; t++) {
        table.push(bytes[base + 30 + t]);
      }
      headerSize = 78;
    } else {
      headerSize = 30;
    }
    const sampleDataLength = instLen - headerSize;
    let sampleData = null;
    if (sampleDataLength > 0 && base + headerSize + sampleDataLength <= bytes.length) {
      sampleData = new Int8Array(
        bytes.buffer,
        bytes.byteOffset + base + headerSize,
        sampleDataLength
      );
    }
    instruments.push({
      number: i,
      attackStep,
      attackDelay,
      decayStep,
      decayDelay,
      sustain,
      releaseStep,
      releaseDelay,
      volume,
      vibratoWait,
      vibratoStep,
      vibratoLength,
      bendRate,
      portamento,
      isSample,
      tableDelay,
      arpeggio,
      sampleLength,
      repeatStart,
      repeatLength,
      table,
      sampleData
    });
    off += instLen;
  }
  const trackerInstruments = [];
  for (let i = 0; i < 20; i++) {
    const inst = instruments[i];
    const id = i + 1;
    const instrFileOffset = instrumentFileOffsets[i];
    const chipRam = instrFileOffset >= 0 ? {
      moduleBase: 0,
      moduleSize: buffer.byteLength,
      instrBase: instrFileOffset,
      // DM1 loads at address 0, so chip addr = file offset
      instrSize: instrumentLengths[i],
      sections: {
        instrumentTable: instrumentTableOffset
      }
    } : void 0;
    if (inst.sampleLength === 0 || inst.sampleData === null) {
      trackerInstruments.push({
        id,
        name: `Instrument ${id}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: -6,
        pan: 0
      });
      continue;
    }
    if (inst.isSample) {
      const pcmLen = inst.sampleData.length;
      const pcmUint8 = new Uint8Array(pcmLen);
      for (let j = 0; j < pcmLen; j++) {
        pcmUint8[j] = inst.sampleData[j] & 255;
      }
      const hasLoop = inst.repeatLength > 1;
      const loopStart = hasLoop ? inst.repeatStart * 2 : 0;
      const loopEnd = hasLoop ? (inst.repeatStart + inst.repeatLength) * 2 : 0;
      const samplerInst = createSamplerInstrument(id, `Sample ${i}`, pcmUint8, inst.volume, PCM_BASE_RATE, loopStart, loopEnd);
      if (chipRam) samplerInst.uadeChipRam = chipRam;
      trackerInstruments.push(samplerInst);
    } else if (inst.table !== null) {
      let waveOffset = 0;
      for (let t = 0; t < 48; t++) {
        const entry = inst.table[t];
        if (entry === 255) break;
        if (entry < 128) {
          waveOffset = entry * 32;
          break;
        }
      }
      const waveLen = Math.min(32, inst.sampleData.length - waveOffset);
      if (waveLen <= 0) {
        trackerInstruments.push({
          id,
          name: `Synth ${i}`,
          type: "synth",
          synthType: "DeltaMusic1Synth",
          effects: [],
          volume: -6,
          pan: 0,
          deltaMusic1: buildDM1Config(inst),
          ...chipRam ? { uadeChipRam: chipRam } : {}
        });
        continue;
      }
      const pcmUint8 = new Uint8Array(waveLen);
      for (let j = 0; j < waveLen; j++) {
        pcmUint8[j] = inst.sampleData[waveOffset + j] & 255;
      }
      const synthInst = {
        ...createSamplerInstrument(id, `Synth ${i}`, pcmUint8, inst.volume, PCM_BASE_RATE, 0, waveLen),
        type: "synth",
        synthType: "DeltaMusic1Synth"
      };
      synthInst.deltaMusic1 = buildDM1Config(inst);
      if (chipRam) synthInst.uadeChipRam = chipRam;
      trackerInstruments.push(synthInst);
    } else {
      trackerInstruments.push({
        id,
        name: `Instrument ${id}`,
        type: "synth",
        synthType: "DeltaMusic1Synth",
        effects: [],
        volume: -6,
        pan: 0,
        deltaMusic1: buildDM1Config(inst),
        ...chipRam ? { uadeChipRam: chipRam } : {}
      });
    }
  }
  const effectiveEntries = [];
  const loopPositions = [];
  for (let ch = 0; ch < 4; ch++) {
    const raw = tracks[ch];
    const resolved = [];
    let loopPos = 0;
    for (let j = 0; j < raw.length; j++) {
      const entry = raw[j];
      if (entry.blockNumber === 255 && entry.transpose === -1) {
        if (j + 1 < raw.length) {
          const next = raw[j + 1];
          const jumpTarget = (next.blockNumber << 8 | next.transpose & 255) & 2047;
          loopPos = Math.min(jumpTarget, resolved.length > 0 ? resolved.length - 1 : 0);
        }
        break;
      }
      resolved.push(entry);
    }
    effectiveEntries.push(resolved);
    loopPositions.push(loopPos);
  }
  const maxTrackLen = Math.max(...effectiveEntries.map((t) => t.length), 1);
  const trackerPatterns = [];
  for (let pos = 0; pos < maxTrackLen; pos++) {
    const channelRows = [[], [], [], []];
    for (let ch = 0; ch < 4; ch++) {
      const chEntries = effectiveEntries[ch];
      const tLen = chEntries.length;
      if (tLen === 0) {
        for (let row = 0; row < 16; row++) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
        continue;
      }
      let trackPos = pos;
      if (trackPos >= tLen) {
        const loopStart = loopPositions[ch] < tLen ? loopPositions[ch] : 0;
        const loopSpan = tLen - loopStart;
        trackPos = loopSpan > 0 ? loopStart + (pos - loopStart) % loopSpan : tLen - 1;
      }
      const entry = chEntries[trackPos];
      const blockIdx = entry.blockNumber;
      const chTranspose = entry.transpose;
      const block = blockIdx < blocks.length ? blocks[blockIdx] : null;
      for (let row = 0; row < 16; row++) {
        if (!block) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const line = block[row];
        let xmNote = 0;
        if (line.note !== 0) {
          xmNote = dm1NoteToXM(line.note + chTranspose);
          xmNote = Math.max(0, Math.min(96, xmNote));
        }
        const instrId = line.note !== 0 && line.instrument < 20 ? line.instrument + 1 : 0;
        let effTyp = 0;
        let eff = 0;
        const effTyp2 = 0;
        const eff2 = 0;
        switch (line.effect) {
          case 1:
            if (line.effectArg !== 0) {
              effTyp = 15;
              eff = line.effectArg;
            }
            break;
          case 2:
            effTyp = 1;
            eff = line.effectArg;
            break;
          case 3:
            effTyp = 2;
            eff = line.effectArg;
            break;
          case 9:
            effTyp = 3;
            eff = line.effectArg;
            break;
          case 10:
            effTyp = 12;
            eff = Math.min(64, line.effectArg);
            break;
        }
        channelRows[ch].push({
          note: xmNote,
          instrument: instrId,
          volume: 0,
          effTyp,
          eff,
          effTyp2,
          eff2
        });
      }
    }
    trackerPatterns.push({
      id: `pattern-${pos}`,
      name: `Position ${pos}`,
      length: 16,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        // Amiga hard stereo panning: LRRL
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "DM1",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numBlocks,
        originalInstrumentCount: instruments.filter((inst) => inst.sampleLength > 0).length
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
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
        rows: Array.from({ length: 16 }, () => ({
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
        sourceFormat: "DM1",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const moduleName = filename.replace(/.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "deltaMusic1",
    patternDataFileOffset: blockDataFileOffset,
    bytesPerCell: 4,
    rowsPerPattern: 16,
    numChannels: 4,
    numPatterns: numBlocks,
    moduleSize: buffer.byteLength,
    encodeCell: encodeDeltaMusic1Cell,
    getCellFileOffset: (pattern, row, channel) => {
      const chEntries = effectiveEntries[channel];
      if (!chEntries || chEntries.length === 0) return 0;
      let trackPos = pattern;
      const tLen = chEntries.length;
      if (trackPos >= tLen) {
        const loopStart = loopPositions[channel] < tLen ? loopPositions[channel] : 0;
        const loopSpan = tLen - loopStart;
        trackPos = loopSpan > 0 ? loopStart + (pattern - loopStart) % loopSpan : tLen - 1;
      }
      const entry = chEntries[trackPos];
      const blockIdx = entry.blockNumber;
      if (blockIdx >= numBlocks) return 0;
      return blockDataFileOffset + blockIdx * 64 + row * 4;
    }
  };
  return {
    name: moduleName,
    format: "MOD",
    patterns: trackerPatterns,
    instruments: trackerInstruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePatternLayout
  };
}
export {
  isDeltaMusic1Format,
  parseDeltaMusic1File
};
