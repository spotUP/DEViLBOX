import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeSynthesisCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note > 0) {
    out[0] = Math.max(0, Math.min(255, note + 12));
  } else {
    out[0] = 0;
  }
  out[1] = (cell.instrument ?? 0) & 255;
  out[2] = (cell.effTyp ?? 0) & 15;
  out[3] = (cell.eff ?? 0) & 255;
  return out;
}
registerPatternEncoder("synthesis", () => encodeSynthesisCell);
const PAL_CLOCK = 3546895;
const SYN_REFERENCE_IDX = 49;
const XM_REFERENCE_NOTE = 13;
const SYNTH_BASE_RATE = Math.round(PAL_CLOCK / (2 * 856));
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function s8(v) {
  return v < 128 ? v : v - 256;
}
function synNoteToXM(n) {
  if (n === 0) return 0;
  return XM_REFERENCE_NOTE + (n - SYN_REFERENCE_IDX);
}
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
function isSynthesisFormat(bytes) {
  if (bytes.length < 204) return false;
  if (bytes[0] === 83 && bytes[1] === 121 && bytes[2] === 110 && bytes[3] === 116 && bytes[4] === 104 && bytes[5] === 52 && bytes[6] === 46 && bytes[7] === 48) return true;
  if (bytes.length < 7950 + 204) return false;
  if (bytes[7950 + 0] === 83 && bytes[7950 + 1] === 121 && bytes[7950 + 2] === 110 && bytes[7950 + 3] === 116 && bytes[7950 + 4] === 104 && bytes[7950 + 5] === 52 && bytes[7950 + 6] === 46 && bytes[7950 + 7] === 50) return true;
  return false;
}
function parseSynthesisFile(bytes, filename) {
  try {
    return parseSynthesis(bytes, filename);
  } catch {
    return null;
  }
}
function parseSynthesis(bytes, filename) {
  if (!isSynthesisFormat(bytes)) return null;
  const startOffset = bytes[0] === 83 ? 0 : 7950;
  let off = startOffset + 8;
  const NOP = u16BE(bytes, off);
  off += 2;
  const NOR = u16BE(bytes, off);
  off += 2;
  off += 4;
  const NOS = bytes[off++];
  const NOW = bytes[off++];
  const NOI = bytes[off++];
  const NSS = bytes[off++];
  const NOE = bytes[off++];
  const NOADSR = bytes[off++];
  off += 1;
  off += 13;
  const moduleName = readString(bytes, off, 28);
  off += 28;
  off += 140;
  const sampleNames = [];
  for (let i = 0; i < NOS; i++) {
    off += 1;
    sampleNames.push(readString(bytes, off, 27));
    off += 27;
  }
  const sampleLengths = [];
  for (let i = 0; i < NOS; i++) {
    sampleLengths.push(u32BE(bytes, off));
    off += 4;
  }
  off += NOE * 128;
  off += NOADSR * 256;
  const instruments = [];
  for (let i = 0; i < NOI; i++) {
    const waveformNumber = bytes[off++];
    const synthesisEnabled = bytes[off++] !== 0;
    const waveformLength = u16BE(bytes, off);
    off += 2;
    const repeatLength = u16BE(bytes, off);
    off += 2;
    const volume = bytes[off++];
    off += 1;
    off += 1;
    off += 1;
    off += 2;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 1;
    off += 2;
    instruments.push({ waveformNumber, synthesisEnabled, waveformLength, repeatLength, volume });
  }
  off += 16 * 16;
  const subSongs = [];
  for (let i = 0; i < NSS; i++) {
    off += 4;
    const startSpeed = bytes[off++];
    const rowsPerTrack2 = bytes[off++];
    const firstPosition = u16BE(bytes, off);
    off += 2;
    const lastPosition = u16BE(bytes, off);
    off += 2;
    const restartPosition = u16BE(bytes, off);
    off += 2;
    off += 2;
    subSongs.push({ startSpeed, rowsPerTrack: rowsPerTrack2, firstPosition, lastPosition, restartPosition });
  }
  off += 14;
  const waveformData = [];
  for (let i = 0; i < NOW; i++) {
    waveformData.push(bytes.slice(off, off + 256));
    off += 256;
  }
  const positions = [];
  for (let p = 0; p < NOP; p++) {
    const voices = [];
    for (let v = 0; v < 4; v++) {
      const startTrackRow = u16BE(bytes, off);
      off += 2;
      const soundTranspose = s8(bytes[off++]);
      const noteTranspose = s8(bytes[off++]);
      voices.push({ startTrackRow, soundTranspose, noteTranspose });
    }
    positions.push(voices);
  }
  const totalRows = NOR + 64;
  const trackRowDataOffset = off;
  const trackLines = [];
  for (let i = 0; i < totalRows; i++) {
    const b1 = bytes[off++];
    const b2 = bytes[off++];
    const b3 = bytes[off++];
    const b4 = bytes[off++];
    trackLines.push({
      note: b1,
      instrument: b2,
      arpeggio: (b3 & 240) >> 4,
      effect: b3 & 15,
      effectArg: b4
    });
  }
  const samplePCM = [];
  for (let i = 0; i < NOS; i++) {
    const len = sampleLengths[i];
    samplePCM.push(len > 0 ? bytes.slice(off, off + len) : new Uint8Array(0));
    off += len;
  }
  const song = subSongs[0];
  if (!song) return null;
  const instrumentConfigs = [];
  for (let i = 0; i < NOI; i++) {
    const instr = instruments[i];
    const instrId = i + 1;
    if (!instr.synthesisEnabled) {
      const sampleIdx = instr.waveformNumber;
      if (sampleIdx < NOS && samplePCM[sampleIdx].length > 0) {
        const pcm = samplePCM[sampleIdx];
        const vol = instr.volume;
        const wl = instr.waveformLength;
        const rl = instr.repeatLength;
        let loopStart = 0;
        let loopEnd = 0;
        const sampleRate = Math.round(PAL_CLOCK / (2 * 856));
        if (rl === 0) {
          loopStart = 0;
          loopEnd = pcm.length;
        } else if (rl === 2) {
          loopStart = 0;
          loopEnd = 0;
        } else {
          loopStart = wl;
          loopEnd = wl + rl;
        }
        instrumentConfigs.push(
          createSamplerInstrument(instrId, sampleNames[sampleIdx] || `Sample ${sampleIdx}`, pcm, vol, sampleRate, loopStart, loopEnd)
        );
      } else {
        instrumentConfigs.push({
          id: instrId,
          name: `Instrument ${instrId}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0,
          oscillator: { type: "sawtooth", detune: 0, octave: 0 }
        });
      }
    } else {
      const waveIdx = instr.waveformNumber;
      if (waveIdx < NOW) {
        const waveBytes = waveformData[waveIdx];
        const wl = instr.waveformLength;
        const rl = instr.repeatLength;
        const vol = instr.volume;
        let loopStart = 0;
        let loopEnd = 0;
        if (rl === 0) {
          loopStart = 0;
          loopEnd = waveBytes.length;
        } else if (rl === 2) {
          loopStart = 0;
          loopEnd = 0;
        } else {
          loopStart = wl;
          loopEnd = wl + rl;
        }
        instrumentConfigs.push(
          createSamplerInstrument(instrId, `Waveform ${waveIdx}`, waveBytes, vol, SYNTH_BASE_RATE, loopStart, loopEnd)
        );
      } else {
        instrumentConfigs.push({
          id: instrId,
          name: `Instrument ${instrId}`,
          type: "synth",
          synthType: "Synth",
          effects: [],
          volume: 0,
          pan: 0,
          oscillator: { type: "sawtooth", detune: 0, octave: 0 }
        });
      }
    }
  }
  const rowsPerTrack = song.rowsPerTrack || 16;
  const firstPos = song.firstPosition;
  const patterns = [];
  const CHANNEL_PAN = [-50, 50, 50, -50];
  for (let posIdx = 0; posIdx < NOP; posIdx++) {
    const posVoices = positions[posIdx];
    const cells = Array.from(
      { length: rowsPerTrack },
      () => Array.from({ length: 4 }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }))
    );
    for (let v = 0; v < 4; v++) {
      const posVoice = posVoices[v];
      let trackRow = posVoice.startTrackRow;
      for (let row = 0; row < rowsPerTrack; row++) {
        if (trackRow >= trackLines.length) break;
        const tl = trackLines[trackRow++];
        let xmNote = 0;
        let instrNum = 0;
        let effTyp = 0;
        let eff = 0;
        if (tl.note !== 0) {
          const rawNote = tl.note + s8(posVoice.noteTranspose);
          const clamped = Math.max(1, Math.min(108, rawNote));
          xmNote = synNoteToXM(clamped);
        }
        if (tl.instrument !== 0) {
          instrNum = tl.instrument + s8(posVoice.soundTranspose);
          if (instrNum < 1) instrNum = 1;
          if (instrNum > NOI) instrNum = NOI;
        }
        switch (tl.effect) {
          case 1:
            effTyp = 3;
            eff = tl.effectArg;
            break;
          case 8:
            effTyp = 15;
            eff = tl.effectArg;
            break;
          case 15:
            effTyp = 12;
            eff = Math.min(64, tl.effectArg);
            break;
        }
        cells[row][v] = {
          note: xmNote,
          instrument: instrNum,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        };
      }
    }
    patterns.push({
      id: `pattern-${posIdx}`,
      name: `Pattern ${posIdx}`,
      length: rowsPerTrack,
      channels: Array.from({ length: 4 }, (_, chIdx) => ({
        id: `channel-${chIdx}`,
        name: `Channel ${chIdx + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: CHANNEL_PAN[chIdx],
        instrumentId: null,
        color: null,
        rows: cells.map((row) => row[chIdx])
      })),
      importMetadata: {
        sourceFormat: "Synthesis",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: NOP,
        originalInstrumentCount: NOI
      }
    });
  }
  const songPositions = [];
  for (let p = firstPos; p <= song.lastPosition && p < NOP; p++) {
    songPositions.push(p);
  }
  if (songPositions.length === 0) {
    for (let p = 0; p < NOP; p++) songPositions.push(p);
  }
  const baseName = filename.replace(/\.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "synthesis",
    patternDataFileOffset: trackRowDataOffset,
    bytesPerCell: 4,
    rowsPerPattern: totalRows,
    numChannels: 4,
    numPatterns: NOP,
    moduleSize: bytes.length,
    encodeCell: encodeSynthesisCell
  };
  return {
    name: moduleName || baseName,
    format: "XM",
    patterns,
    instruments: instrumentConfigs,
    songPositions,
    songLength: songPositions.length,
    restartPosition: song.restartPosition < songPositions.length ? song.restartPosition : 0,
    numChannels: 4,
    initialSpeed: song.startSpeed || 6,
    initialBPM: 125,
    uadePatternLayout
  };
}
export {
  isSynthesisFormat,
  parseSynthesisFile
};
