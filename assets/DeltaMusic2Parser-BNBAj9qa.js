import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeDeltaMusic2Cell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note > 0 && note <= 96) {
    out[0] = note;
  } else {
    out[0] = 0;
  }
  const instr = cell.instrument ?? 0;
  out[1] = instr > 0 ? instr - 1 & 255 : 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  const vol = cell.volume ?? 0;
  let dm2Effect = 0;
  let dm2Param = 0;
  if (vol >= 16 && vol <= 80) {
    const xmVol = vol - 16;
    dm2Effect = 6;
    dm2Param = Math.round(xmVol / 64 * 63) & 63;
    out[2] = dm2Effect & 255;
    out[3] = dm2Param & 255;
    return out;
  }
  switch (effTyp) {
    case 15:
      dm2Effect = 1;
      dm2Param = eff & 15;
      break;
    case 1:
      dm2Effect = 3;
      dm2Param = eff;
      break;
    case 2:
      dm2Effect = 4;
      dm2Param = eff;
      break;
    case 3:
      dm2Effect = 5;
      dm2Param = eff;
      break;
    case 16:
      dm2Effect = 7;
      dm2Param = Math.round(Math.min(64, eff) / 64 * 63) & 63;
      break;
    case 0:
      if (eff !== 0) {
        dm2Effect = 8;
        dm2Param = eff & 63;
      }
      break;
  }
  out[2] = dm2Effect & 255;
  out[3] = dm2Param & 255;
  return out;
}
registerPatternEncoder("deltaMusic2", () => encodeDeltaMusic2Cell);
const PAL_CLOCK = 3546895;
const REFERENCE_NOTE = 37;
const SYNTH_BASE_RATE = Math.round(PAL_CLOCK / (2 * 856));
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
function isDeltaMusic2Format(bytes) {
  if (bytes.length < 4058) return false;
  return bytes[3014] === 46 && // '.'
  bytes[3015] === 70 && // 'F'
  bytes[3016] === 78 && // 'N'
  bytes[3017] === 76;
}
function parseDeltaMusic2File(bytes, filename) {
  if (!isDeltaMusic2Format(bytes)) return null;
  const periods = [];
  for (let i = 0; i < 85; i++) {
    periods.push(u16BE(bytes, 2786 + i * 2));
  }
  if (periods[REFERENCE_NOTE] !== 856) {
    console.warn(`[DeltaMusic2Parser] Unexpected reference period: ${periods[REFERENCE_NOTE]} (expected 856)`);
  }
  const startSpeed = s8(bytes[3003]);
  const speed = Math.max(1, Math.min(15, startSpeed > 0 ? startSpeed : 3));
  const arpeggios = [];
  for (let i = 0; i < 64; i++) {
    const arr = new Int8Array(16);
    for (let j = 0; j < 16; j++) {
      arr[j] = s8(bytes[3018 + i * 16 + j]);
    }
    arpeggios.push(arr);
  }
  const trackByteLens = [];
  const trackLoops = [];
  for (let i = 0; i < 4; i++) {
    trackLoops.push(u16BE(bytes, 4042 + i * 4));
    trackByteLens.push(u16BE(bytes, 4042 + i * 4 + 2));
  }
  const tracks = [];
  let off = 4058;
  for (let i = 0; i < 4; i++) {
    const entryCount = trackByteLens[i] / 2;
    const entries = [];
    for (let j = 0; j < entryCount; j++) {
      entries.push({
        blockNumber: bytes[off],
        transpose: s8(bytes[off + 1])
      });
      off += 2;
    }
    tracks.push({ loopPosition: trackLoops[i], entries });
  }
  if (off + 4 > bytes.length) return null;
  const blockDataLen = u32BE(bytes, off);
  off += 4;
  const blockDataOffset = off;
  const numBlocks = Math.floor(blockDataLen / 64);
  const blocks = [];
  for (let b = 0; b < numBlocks; b++) {
    const blockLines = [];
    for (let row = 0; row < 16; row++) {
      blockLines.push({
        note: bytes[off],
        instrument: bytes[off + 1],
        effect: bytes[off + 2],
        effectArg: bytes[off + 3]
      });
      off += 4;
    }
    blocks.push(blockLines);
  }
  if (off + 256 > bytes.length) return null;
  const instrumentOffsets = new Array(128).fill(0);
  for (let i = 1; i <= 127; i++) {
    instrumentOffsets[i] = u16BE(bytes, off + (i - 1) * 2);
  }
  const breakOffset = u16BE(bytes, off + 254);
  off += 256;
  const instrumentDataBase = off;
  const rawInstruments = [];
  for (let i = 0; i < 128; i++) {
    if (instrumentOffsets[i] === breakOffset) {
      break;
    }
    const base = instrumentDataBase + instrumentOffsets[i];
    if (base + 88 > bytes.length) break;
    let iOff = base;
    const sLen = u16BE(bytes, iOff) * 2;
    iOff += 2;
    const rStart = u16BE(bytes, iOff);
    iOff += 2;
    let rLen = u16BE(bytes, iOff) * 2;
    iOff += 2;
    if (rStart + rLen >= sLen && sLen > 0) {
      rLen = sLen > rStart ? sLen - rStart : 0;
    }
    const volTable = [];
    for (let v = 0; v < 5; v++) {
      volTable.push({
        speed: bytes[base + 6 + v * 3],
        level: bytes[base + 7 + v * 3],
        sustain: bytes[base + 8 + v * 3]
      });
    }
    iOff += 15;
    const vibTable = [];
    for (let v = 0; v < 5; v++) {
      vibTable.push({
        speed: bytes[base + 21 + v * 3],
        delay: bytes[base + 22 + v * 3],
        sustain: bytes[base + 23 + v * 3]
      });
    }
    iOff += 15;
    const pitchBend = u16BE(bytes, iOff);
    iOff += 2;
    const isSampleByte = bytes[iOff];
    iOff++;
    const sampleNum = bytes[iOff] & 7;
    iOff++;
    const table = new Uint8Array(bytes.buffer, bytes.byteOffset + iOff, 48);
    rawInstruments.push({
      sampleLength: sLen,
      repeatStart: rStart,
      repeatLength: rLen,
      pitchBend,
      isSample: isSampleByte === 255,
      sampleNumber: sampleNum,
      table,
      dm2Config: {
        volTable,
        vibTable,
        pitchBend,
        table: new Uint8Array(table),
        isSample: isSampleByte === 255
      },
      instrBase: base
    });
  }
  off = instrumentDataBase + breakOffset;
  if (off + 4 > bytes.length) return null;
  const waveformDataLen = u32BE(bytes, off);
  off += 4;
  const numWaveforms = Math.floor(waveformDataLen / 256);
  const waveforms = [];
  for (let w = 0; w < numWaveforms; w++) {
    if (off + 256 > bytes.length) break;
    const wave = new Int8Array(256);
    for (let j = 0; j < 256; j++) {
      wave[j] = s8(bytes[off + j]);
    }
    waveforms.push(wave);
    off += 256;
  }
  for (const inst of rawInstruments) {
    if (!inst || inst.isSample) continue;
    const waveIdx = inst.table[0] !== void 0 && inst.table[0] !== 255 ? inst.table[0] : 0;
    const clamped = Math.max(0, Math.min(waveIdx, waveforms.length - 1));
    if (clamped < waveforms.length) {
      inst.dm2Config.waveformPCM = Array.from(waveforms[clamped]);
    }
  }
  off += 64;
  if (off + 32 > bytes.length) ;
  else {
    const sampleOffsets = [];
    for (let i = 0; i < 8; i++) {
      sampleOffsets.push(u32BE(bytes, off + i * 4));
    }
    off += 32;
    const sampleDataBase = off;
    for (const inst of rawInstruments) {
      if (!inst || !inst.isSample) continue;
      const sn = inst.sampleNumber;
      if (sn >= 8) continue;
      const sampleOff = sampleDataBase + sampleOffsets[sn];
      if (sampleOff + inst.sampleLength > bytes.length) continue;
      inst.sampleData = new Int8Array(
        bytes.buffer,
        bytes.byteOffset + sampleOff,
        inst.sampleLength
      );
    }
  }
  const dm2Instruments = rawInstruments.filter((x) => x !== null);
  const instruments = [];
  for (let i = 0; i < dm2Instruments.length; i++) {
    const inst = dm2Instruments[i];
    const id = i + 1;
    const chipRam = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase: inst.instrBase,
      instrSize: 88,
      sections: { instrumentTable: instrumentDataBase }
    };
    let builtInstrument;
    if (inst.isSample && inst.sampleData && inst.sampleLength > 0) {
      const pcmUint8 = new Uint8Array(inst.sampleLength);
      for (let j = 0; j < inst.sampleLength; j++) {
        pcmUint8[j] = inst.sampleData[j] & 255;
      }
      const hasLoop = inst.repeatLength > 2;
      const loopStart = hasLoop ? inst.repeatStart : 0;
      const loopEnd = hasLoop ? inst.repeatStart + inst.repeatLength : 0;
      builtInstrument = createSamplerInstrument(id, `Sample ${i}`, pcmUint8, 64, PCM_BASE_RATE, loopStart, loopEnd);
    } else if (!inst.isSample && inst.sampleLength > 0 && waveforms.length > 0) {
      const waveIdx = inst.table[0] !== void 0 && inst.table[0] !== 255 ? inst.table[0] : 0;
      const clampedWave = Math.max(0, Math.min(waveIdx, waveforms.length - 1));
      const waveform = waveforms[clampedWave];
      const playLen = Math.min(inst.sampleLength, 256);
      const pcmUint8 = new Uint8Array(playLen);
      for (let j = 0; j < playLen; j++) {
        pcmUint8[j] = waveform[j % 256] & 255;
      }
      builtInstrument = {
        ...createSamplerInstrument(id, `Synth ${i}`, pcmUint8, 64, SYNTH_BASE_RATE, 0, playLen),
        type: "synth",
        synthType: "DeltaMusic2Synth"
      };
    } else {
      builtInstrument = {
        id,
        name: `Instrument ${i}`,
        type: "synth",
        synthType: "DeltaMusic2Synth",
        effects: [],
        volume: -6,
        pan: 0
      };
    }
    builtInstrument.deltaMusic2 = inst.dm2Config;
    builtInstrument.uadeChipRam = chipRam;
    instruments.push(builtInstrument);
  }
  const maxTrackLen = Math.max(...tracks.map((t) => t.entries.length), 1);
  const trackerPatterns = [];
  for (let pos = 0; pos < maxTrackLen; pos++) {
    const channelRows = [[], [], [], []];
    for (let ch = 0; ch < 4; ch++) {
      const trackEntries = tracks[ch].entries;
      const tLen = trackEntries.length;
      let trackPos = pos;
      if (tLen === 0) {
        for (let row = 0; row < 16; row++) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
        continue;
      }
      if (trackPos >= tLen) {
        const loopStart = tracks[ch].loopPosition < tLen ? tracks[ch].loopPosition : 0;
        const loopSpan = tLen - loopStart;
        if (loopSpan > 0) {
          trackPos = loopStart + (pos - loopStart) % loopSpan;
        } else {
          trackPos = tLen - 1;
        }
      }
      const entry = trackEntries[trackPos];
      const blockIdx = entry.blockNumber;
      const transpose = entry.transpose;
      const block = blockIdx < blocks.length ? blocks[blockIdx] : null;
      for (let row = 0; row < 16; row++) {
        if (!block) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const line = block[row];
        let xmNote = 0;
        if (line.note > 0) {
          const noteIdx = line.note + transpose;
          xmNote = Math.max(1, Math.min(96, noteIdx));
        }
        const instrId = line.instrument < dm2Instruments.length ? line.instrument + 1 : 0;
        let effTyp = 0;
        let eff = 0;
        let effTyp2 = 0;
        let eff2 = 0;
        switch (line.effect) {
          case 1:
            effTyp = 15;
            eff = Math.max(1, line.effectArg & 15);
            break;
          case 2:
            break;
          case 3:
            effTyp = 1;
            eff = line.effectArg & 255;
            break;
          case 4:
            effTyp = 2;
            eff = line.effectArg & 255;
            break;
          case 5:
            effTyp = 3;
            eff = line.effectArg;
            break;
          case 6: {
            const xmVol = Math.round((line.effectArg & 63) / 63 * 64);
            channelRows[ch].push({
              note: xmNote,
              instrument: instrId,
              volume: 16 + Math.min(64, xmVol),
              effTyp: 0,
              eff: 0,
              effTyp2: 0,
              eff2: 0
            });
            continue;
          }
          case 7: {
            effTyp = 16;
            eff = Math.min(64, Math.round((line.effectArg & 63) / 63 * 64));
            break;
          }
          case 8: {
            const arpIdx = line.effectArg & 63;
            const arpTable = arpIdx < arpeggios.length ? arpeggios[arpIdx] : null;
            if (arpTable) {
              const x = Math.max(0, Math.min(15, arpTable[1] > 0 ? arpTable[1] : 0));
              const y = Math.max(0, Math.min(15, arpTable[2] > 0 ? arpTable[2] : 0));
              effTyp = 0;
              eff = x << 4 | y;
            }
            break;
          }
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
        // Amiga hard stereo LRRL panning
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "DM2",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numBlocks,
        originalInstrumentCount: dm2Instruments.length
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
        sourceFormat: "DM2",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "deltaMusic2",
    patternDataFileOffset: blockDataOffset,
    bytesPerCell: 4,
    rowsPerPattern: 16,
    numChannels: 4,
    numPatterns: trackerPatterns.length,
    moduleSize: bytes.length,
    encodeCell: encodeDeltaMusic2Cell,
    getCellFileOffset: (pattern, row, channel) => {
      var _a;
      const trackEntries = (_a = tracks[channel]) == null ? void 0 : _a.entries;
      if (!trackEntries || trackEntries.length === 0) return 0;
      let trackPos = pattern;
      const tLen = trackEntries.length;
      if (trackPos >= tLen) {
        const loopStart = tracks[channel].loopPosition < tLen ? tracks[channel].loopPosition : 0;
        const loopSpan = tLen - loopStart;
        trackPos = loopSpan > 0 ? loopStart + (pattern - loopStart) % loopSpan : tLen - 1;
      }
      const entry = trackEntries[trackPos];
      if (!entry || entry.blockNumber >= numBlocks) return 0;
      return blockDataOffset + entry.blockNumber * 64 + row * 4;
    }
  };
  return {
    name: moduleName,
    format: "DM2",
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: speed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
export {
  isDeltaMusic2Format,
  parseDeltaMusic2File
};
