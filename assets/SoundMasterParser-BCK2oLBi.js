const MAX_SAMPLES = 32;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
function u16BE(buf, off) {
  if (off + 1 >= buf.length) return 0;
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function i16BE(buf, off) {
  const v = u16BE(buf, off);
  return v < 32768 ? v : v - 65536;
}
function u32BE(buf, off) {
  if (off + 3 >= buf.length) return 0;
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isSoundMasterFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    const base = (filename.split("/").pop() ?? filename).toLowerCase();
    const validExtensions = [".sm", ".sm1", ".sm2", ".sm3", ".smpro"];
    if (!validExtensions.some((ext) => base.endsWith(ext))) return false;
  }
  if (buf.length < 14) return false;
  if (u16BE(buf, 0) !== 24576) return false;
  const d2 = u16BE(buf, 2);
  if (d2 === 0 || d2 >= 32768 || (d2 & 1) !== 0) return false;
  if (u16BE(buf, 4) !== 24576) return false;
  const d3 = u16BE(buf, 6);
  if (d3 === 0 || d3 >= 32768 || (d3 & 1) !== 0) return false;
  if (u16BE(buf, 8) !== 24576) return false;
  const scanBase = 2 + d2;
  const scanLimit = scanBase + 30;
  if (scanLimit + 1 >= buf.length) return false;
  let leaPos = -1;
  for (let pos = scanBase; pos < scanLimit && pos + 1 < buf.length; pos += 2) {
    if (u16BE(buf, pos) === 18426) {
      leaPos = pos;
      break;
    }
  }
  if (leaPos === -1) return false;
  let rtsPos = -1;
  for (let pos = leaPos; pos + 1 < buf.length; pos += 2) {
    if (u16BE(buf, pos) === 20085) {
      rtsPos = pos;
      break;
    }
  }
  if (rtsPos === -1) return false;
  const rtsEnd = rtsPos + 2;
  let checkOff = rtsEnd;
  if (rtsEnd >= 8 && rtsEnd - 8 + 3 < buf.length && u32BE(buf, rtsEnd - 8) === 394002432) {
    checkOff = rtsEnd - 6;
  }
  if (checkOff < 6 || checkOff - 6 + 3 >= buf.length) return false;
  return u32BE(buf, checkOff - 6) === 12574721;
}
function scanSMStructures(buf) {
  try {
    if (buf.length < 14) return null;
    const d2 = u16BE(buf, 2);
    const moduleBase = 0;
    const a1Init = 2 + d2;
    if (a1Init >= buf.length) return null;
    let isNewFormat = false;
    if (a1Init + 8 < buf.length) {
      if (u16BE(buf, a1Init + 6) === 5952 || u16BE(buf, a1Init + 4) === 5952) {
        isNewFormat = true;
      }
    }
    let positionOff = -1;
    let songAnchorOff = -1;
    for (let i = moduleBase; i + 1 < buf.length && i < buf.length - 2; i += 2) {
      if (u16BE(buf, i) === 5955) {
        songAnchorOff = i + 2;
        break;
      }
    }
    let songBase = -1;
    if (a1Init + 40 < buf.length) {
      for (let i = a1Init; i + 3 < buf.length && i < a1Init + 200; i += 2) {
        if (u16BE(buf, i) === 18426) {
          const disp = i16BE(buf, i + 2);
          songBase = i + 2 + disp;
          break;
        }
      }
    }
    const songEntries = [];
    if (songAnchorOff >= 0 && songBase >= 0) {
      const songDisp = i16BE(buf, songAnchorOff);
      positionOff = songBase + songDisp;
      let entryOff = positionOff + 3;
      if (entryOff < 0) entryOff = positionOff;
      for (let i = 0; i < 8 && entryOff + 2 < buf.length; i++) {
        const b0 = buf[entryOff];
        const b1 = buf[entryOff + 1];
        const b2 = buf[entryOff + 2];
        if (b0 === 0 && b1 === 0 && b2 === 1) break;
        songEntries.push({ byte0: b0, byte1: b1, byte2: b2 });
        entryOff += 3;
      }
    }
    const samples = [];
    if (isNewFormat || songEntries.length === 0) {
      let sampleInfoOff = -1;
      const scanStart = a1Init;
      for (let i = scanStart; i + 5 < buf.length && i < scanStart + 2e3; i += 2) {
        if (u16BE(buf, i) === 16875) {
          if (songBase >= 0) {
            const disp = i16BE(buf, i + 2);
            sampleInfoOff = songBase + disp;
            const disp2Off = i + 4;
            if (disp2Off + 1 < buf.length) {
              const disp2 = i16BE(buf, disp2Off);
              const sampleTableBase = songBase + disp2;
              if (sampleTableBase >= 0 && sampleTableBase + 4 < buf.length) {
                const sampleDataOff = u32BE(buf, sampleTableBase);
                sampleInfoOff = sampleInfoOff + sampleDataOff;
              }
            }
          }
          break;
        }
      }
      if (sampleInfoOff > 0 && sampleInfoOff < buf.length) {
        for (let i = 0; i < MAX_SAMPLES; i++) {
          const entryOff = sampleInfoOff + i * 6;
          if (entryOff + 5 >= buf.length) break;
          const sampleOff = u32BE(buf, entryOff);
          const wordLen = u16BE(buf, entryOff + 4);
          if (sampleOff >= 2147483648) continue;
          if (wordLen === 0) continue;
          samples.push({ offset: sampleOff, length: wordLen });
        }
      }
    }
    if (samples.length === 0) {
      for (let i = a1Init; i + 3 < buf.length && i < a1Init + 2e3; i += 2) {
        if (u16BE(buf, i) === 54768 || u16BE(buf, i) === 15728) {
          if (songBase >= 0) {
            const baseOff = songBase;
            for (let s = 0; s < MAX_SAMPLES && baseOff + s * 4 + 3 < buf.length; s++) {
              const off = u32BE(buf, baseOff + s * 4);
              if (off >= 2147483648 || off === 0) continue;
              samples.push({ offset: off, length: 0 });
            }
          }
          break;
        }
      }
    }
    let songLength = 0;
    if (positionOff >= 0 && positionOff < buf.length) {
      songLength = buf[positionOff] || 1;
    }
    return {
      isNewFormat,
      samples,
      songEntries,
      numSubSongs: Math.max(1, songEntries.length),
      songLength: Math.max(1, songLength)
    };
  } catch {
    return null;
  }
}
const AMIGA_PERIODS = [
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
  // Octave 1
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
  // Octave 2
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
  // Octave 3
  107,
  101,
  95,
  90,
  85,
  80,
  76,
  71,
  67,
  64,
  60,
  57
  // Octave 4
];
function periodToNoteIndex(period) {
  if (period < 50 || period > 1e3) return -1;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < AMIGA_PERIODS.length; i++) {
    const dist = Math.abs(period - AMIGA_PERIODS[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestDist <= 5 ? bestIdx : -1;
}
function extractSMNoteData(buf, startOff, endOff) {
  const notes = [];
  const positions = [];
  const scanEnd = Math.min(endOff, buf.length - 2);
  for (let i = startOff; i < scanEnd; i += 2) {
    const word = u16BE(buf, i);
    const noteIdx = periodToNoteIndex(word);
    if (noteIdx >= 0) {
      const trackerNote = noteIdx + 25;
      if (trackerNote >= 1 && trackerNote <= 96) {
        notes.push(trackerNote);
        positions.push(i);
      }
    }
  }
  return { notes, positions };
}
function buildSMPatterns(scanResult, buf, filename) {
  const numInstr = Math.max(1, scanResult.samples.length);
  const d2 = u16BE(buf, 2);
  const d3 = u16BE(buf, 6);
  const codeEnd = Math.max(2 + d2, 6 + d3);
  const dataStart = Math.min(codeEnd + 100, buf.length);
  const dataEnd = buf.length;
  const { notes } = extractSMNoteData(buf, dataStart, dataEnd);
  if (notes.length === 0) {
    return { patterns: [], songPositions: [0] };
  }
  const numPat = Math.max(1, Math.ceil(notes.length / (ROWS_PER_PATTERN * NUM_CHANNELS)));
  const patternLimit = Math.min(numPat, 128);
  const patterns = [];
  let noteIdx = 0;
  for (let p = 0; p < patternLimit; p++) {
    const channels = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = [];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        if (noteIdx < notes.length && (r % 2 === 0 || noteIdx < notes.length * 0.8)) {
          const instrNum = Math.min(numInstr, noteIdx % numInstr + 1);
          rows.push({
            note: notes[noteIdx],
            instrument: instrNum,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          });
          noteIdx++;
        } else {
          rows.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          });
        }
      }
      channels.push({
        id: `p${p}-ch${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows
      });
    }
    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: patternLimit,
        originalInstrumentCount: numInstr
      }
    });
  }
  return {
    patterns,
    songPositions: patterns.map((_, i) => i)
  };
}
function stripSoundMasterPrefix(name) {
  return name.replace(/^smpro\./i, "").replace(/^sm3\./i, "").replace(/^sm2\./i, "").replace(/^sm1\./i, "").replace(/^sm\./i, "").replace(/\.(smpro|sm3|sm2|sm1|sm)$/i, "") || name;
}
async function parseSoundMasterFile(buffer, filename) {
  if (!isSoundMasterFormat(buffer, filename)) {
    throw new Error("Not a Sound Master module");
  }
  const buf = new Uint8Array(buffer);
  const base = filename.split("/").pop() ?? filename;
  const moduleName = stripSoundMasterPrefix(base) || base;
  let scanResult = null;
  try {
    scanResult = scanSMStructures(buf);
  } catch {
  }
  const instruments = [];
  const numInstruments = scanResult && scanResult.samples.length > 0 ? scanResult.samples.length : MAX_SAMPLES;
  for (let i = 0; i < numInstruments; i++) {
    const sampleInfo = scanResult == null ? void 0 : scanResult.samples[i];
    const sampleLen = sampleInfo ? sampleInfo.length * 2 : 0;
    instruments.push({
      id: i + 1,
      name: sampleLen > 0 ? `Sample ${i + 1} (${sampleLen}b)` : `Sample ${i + 1}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  let patterns;
  let songPositions;
  let songLength;
  const extracted = scanResult ? buildSMPatterns(scanResult, buf, filename) : null;
  if (extracted && extracted.patterns.length > 0) {
    patterns = extracted.patterns;
    songPositions = extracted.songPositions;
    songLength = songPositions.length;
  } else {
    const emptyRows = Array.from({ length: ROWS_PER_PATTERN }, () => ({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    }));
    patterns = [{
      id: "pattern-0",
      name: "Pattern 0",
      length: ROWS_PER_PATTERN,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: emptyRows
      })),
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: 1,
        originalInstrumentCount: numInstruments
      }
    }];
    songPositions = [0];
    songLength = 1;
  }
  return {
    name: `${moduleName} [Sound Master]`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isSoundMasterFormat,
  parseSoundMasterFile
};
