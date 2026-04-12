import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeKRISCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note > 0 && note >= 37) {
    const noteIdx = note - 37;
    const noteByte = noteIdx * 2 + 24;
    out[0] = Math.min(158, noteByte) & 255;
  } else {
    out[0] = 168;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  out[2] = (cell.effTyp ?? 0) & 15;
  out[3] = (cell.eff ?? 0) & 255;
  return out;
}
registerPatternEncoder("kris", () => encodeKRISCell);
function u8(v, off) {
  return v.getUint8(off);
}
function i8(v, off) {
  return v.getInt8(off);
}
function u16(v, off) {
  return v.getUint16(off, false);
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
const NUM_SAMPLES = 31;
const SAMPLE_HDR_SIZE = 30;
const TRACK_REF_OFFSET = 958;
const SYNTH_WAV_OFFSET = 1982;
const SYNTH_WAV_SIZE = 64;
const ROWS_PER_TRACK = 64;
const BYTES_PER_TRACK = ROWS_PER_TRACK * 4;
const NUM_CHANNELS = 4;
const SAMPLE_RATE = 8287;
const CHANNEL_PAN = [-50, 50, 50, -50];
async function parseKRISFile(buffer, filename) {
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const songName = readString(v, 0, 22) || filename.replace(/\.[^/.]+$/, "");
  const samples = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base = 22 + s * SAMPLE_HDR_SIZE;
    const nameRaw = Array.from(raw.subarray(base, base + 22));
    const name = readString(v, base, 22);
    const length = u16(v, base + 22);
    const finetune = i8(v, base + 24);
    const volume = Math.min(u8(v, base + 25), 64);
    const loopStart = u16(v, base + 26);
    const loopLen = u16(v, base + 28);
    const isSynth = nameRaw[0] === 0;
    samples.push({ name, nameRaw, length, finetune, volume, loopStart, loopLen, isSynth });
  }
  const numOrders = Math.max(1, Math.min(u8(v, 956), 128));
  const restartPos = Math.min(u8(v, 957), 127);
  const trackRefs = [];
  for (let o = 0; o < 128; o++) {
    const row = [];
    for (let c = 0; c < NUM_CHANNELS; c++) {
      const off = TRACK_REF_OFFSET + (o * NUM_CHANNELS + c) * 2;
      row.push({
        trackIdx: u8(v, off),
        transpose: i8(v, off + 1)
      });
    }
    trackRefs.push(row);
  }
  let numSynthWaveforms = 0;
  for (const samp of samples) {
    if (!samp.isSynth) continue;
    const candidates = [samp.nameRaw[1], samp.nameRaw[5], samp.nameRaw[10], samp.nameRaw[19]];
    for (const idx of candidates) {
      if (typeof idx === "number" && idx > numSynthWaveforms) {
        numSynthWaveforms = idx;
      }
    }
  }
  const tracksOffset = SYNTH_WAV_OFFSET + numSynthWaveforms * SYNTH_WAV_SIZE;
  let maxTrackIdx = 0;
  for (let o = 0; o < numOrders; o++) {
    for (let c = 0; c < NUM_CHANNELS; c++) {
      const ti = trackRefs[o][c].trackIdx;
      if (ti > maxTrackIdx) maxTrackIdx = ti;
    }
  }
  const sampleDataOffset = tracksOffset + (maxTrackIdx + 1) * BYTES_PER_TRACK;
  const trackCache = /* @__PURE__ */ new Map();
  function getTrack(trackIdx) {
    if (trackCache.has(trackIdx)) return trackCache.get(trackIdx);
    const off = tracksOffset + trackIdx * BYTES_PER_TRACK;
    const rows = [];
    for (let row = 0; row < ROWS_PER_TRACK; row++) {
      const cellOff = off + row * 4;
      if (cellOff + 3 >= buffer.byteLength) {
        rows.push({ noteByte: 168, instrument: 0, effTyp: 0, eff: 0 });
        continue;
      }
      const b0 = u8(v, cellOff);
      const b1 = u8(v, cellOff + 1);
      const b2 = u8(v, cellOff + 2);
      const b3 = u8(v, cellOff + 3);
      rows.push({ noteByte: b0, instrument: b1, effTyp: b2 & 15, eff: b3 });
    }
    trackCache.set(trackIdx, rows);
    return rows;
  }
  function krisNoteToXM(noteByte, transpose) {
    if (noteByte === 168) return 0;
    if (noteByte & 1) return 0;
    if (noteByte < 24 || noteByte > 158) return 0;
    const rawNote = Math.floor((noteByte - 24) / 2);
    const xmNote = 25 + rawNote + transpose;
    return Math.max(1, Math.min(96, xmNote));
  }
  function getActualPatternLength(chans) {
    var _a;
    let lastRow = -1;
    for (let row = 0; row < (((_a = chans[0]) == null ? void 0 : _a.rows.length) ?? 0); row++) {
      for (const ch of chans) {
        const c = ch.rows[row];
        if (c.note !== 0 || c.instrument !== 0 || c.effTyp !== 0 || c.eff !== 0) {
          lastRow = row;
          break;
        }
      }
    }
    return lastRow >= 0 ? lastRow + 1 : 1;
  }
  const patterns = [];
  const songPositions = [];
  for (let o = 0; o < numOrders; o++) {
    songPositions.push(o);
    const channels = [];
    for (let c = 0; c < NUM_CHANNELS; c++) {
      const ref = trackRefs[o][c];
      const trackRows = getTrack(ref.trackIdx);
      const transpose = ref.transpose;
      const rows = trackRows.map((row) => {
        const note = krisNoteToXM(row.noteByte, transpose);
        return {
          note,
          instrument: row.instrument,
          volume: 0,
          effTyp: row.effTyp,
          eff: row.eff,
          effTyp2: 0,
          eff2: 0
        };
      });
      channels.push({
        id: `channel-${c}`,
        name: `Channel ${c + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: CHANNEL_PAN[c],
        instrumentId: null,
        color: null,
        rows
      });
    }
    patterns.push({
      id: `pattern-${o}`,
      name: `Pattern ${o}`,
      length: getActualPatternLength(channels),
      channels,
      importMetadata: {
        sourceFormat: "KRIS",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numOrders,
        originalInstrumentCount: NUM_SAMPLES
      }
    });
  }
  const instruments = samples.map((samp, i) => {
    const id = i + 1;
    if (samp.isSynth) {
      return {
        id,
        name: samp.name.replace(/\0/g, "").trim() || "Synthetic",
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      };
    }
    const lengthBytes = samp.length * 2;
    const loopStartBytes = samp.loopStart * 2;
    const loopLenBytes = samp.loopLen * 2;
    const hasLoop = samp.loopLen > 1;
    const loopEnd = hasLoop ? loopStartBytes + loopLenBytes : lengthBytes;
    if (lengthBytes === 0 || sampleDataOffset + lengthBytes > buffer.byteLength) {
      return {
        id,
        name: samp.name || `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      };
    }
    let startOff = sampleDataOffset;
    for (let j = 0; j < i; j++) {
      startOff += samples[j].isSynth ? 0 : samples[j].length * 2;
    }
    const pcm = raw.subarray(startOff, startOff + lengthBytes);
    return createSamplerInstrument(
      id,
      samp.name || `Sample ${id}`,
      pcm,
      samp.volume,
      SAMPLE_RATE,
      hasLoop ? loopStartBytes : 0,
      hasLoop ? loopEnd : 0
    );
  });
  const uadePatternLayout = {
    formatId: "kris",
    patternDataFileOffset: tracksOffset,
    bytesPerCell: 4,
    rowsPerPattern: ROWS_PER_TRACK,
    numChannels: NUM_CHANNELS,
    numPatterns: patterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeKRISCell,
    getCellFileOffset: (pattern, row, channel) => {
      const refs = trackRefs[pattern];
      if (!refs) return 0;
      const ref = refs[channel];
      if (!ref) return 0;
      return tracksOffset + ref.trackIdx * BYTES_PER_TRACK + row * 4;
    }
  };
  return {
    name: songName,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: restartPos,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
export {
  parseKRISFile
};
