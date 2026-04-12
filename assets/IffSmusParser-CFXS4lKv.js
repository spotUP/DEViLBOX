import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const DURATION_TABLE$1 = [
  32,
  16,
  8,
  4,
  2,
  -1,
  -1,
  -1,
  48,
  24,
  12,
  6,
  3,
  -1,
  -1,
  -1
];
const DURATION_TO_INDEX = /* @__PURE__ */ new Map();
for (let i = 0; i < DURATION_TABLE$1.length; i++) {
  if (DURATION_TABLE$1[i] > 0) {
    DURATION_TO_INDEX.set(DURATION_TABLE$1[i], i);
  }
}
const EVENT_REST$1 = 128;
const EVENT_INSTRUMENT$1 = 129;
const EVENT_MARK$1 = 255;
function ticksToDurationIndex(ticks) {
  if (DURATION_TO_INDEX.has(ticks)) {
    return DURATION_TO_INDEX.get(ticks);
  }
  let bestIdx = 3;
  let bestDist = Infinity;
  for (let i = 0; i < DURATION_TABLE$1.length; i++) {
    if (DURATION_TABLE$1[i] < 0) continue;
    const dist = Math.abs(DURATION_TABLE$1[i] - ticks);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}
const iffSmusEncoder = {
  formatId: "iffSmus",
  encodePattern(rows) {
    const events = [];
    let lastInstr = 0;
    let i = 0;
    while (i < rows.length) {
      const cell = rows[i];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      if (note > 0 && note <= 96) {
        if (instr > 0 && instr !== lastInstr) {
          events.push({ type: EVENT_INSTRUMENT$1, data: instr - 1 & 255 });
          lastInstr = instr;
        }
        let duration = 1;
        let j = i + 1;
        while (j < rows.length) {
          const next = rows[j];
          if ((next.note ?? 0) !== 0 || (next.instrument ?? 0) !== 0) break;
          duration++;
          j++;
        }
        const midiNote = Math.max(0, Math.min(127, note + 11));
        const durIdx = ticksToDurationIndex(duration);
        events.push({ type: midiNote, data: durIdx & 15 });
        i = j;
      } else {
        let duration = 0;
        let j = i;
        while (j < rows.length) {
          const next = rows[j];
          if ((next.note ?? 0) !== 0) break;
          if ((next.instrument ?? 0) !== 0) break;
          duration++;
          j++;
        }
        if (duration === 0) duration = 1;
        const durIdx = ticksToDurationIndex(duration);
        events.push({ type: EVENT_REST$1, data: durIdx & 15 });
        i = j;
      }
    }
    events.push({ type: EVENT_MARK$1, data: 255 });
    const out = new Uint8Array(events.length * 2);
    for (let e = 0; e < events.length; e++) {
      out[e * 2] = events[e].type & 255;
      out[e * 2 + 1] = events[e].data & 255;
    }
    return out;
  }
};
registerVariableEncoder(iffSmusEncoder);
function readFourCC(buf, off) {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
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
function u8(buf, off) {
  return buf[off];
}
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
const DURATION_TABLE = [
  32,
  16,
  8,
  4,
  2,
  -1,
  -1,
  -1,
  48,
  24,
  12,
  6,
  3,
  -1,
  -1,
  -1
];
const EVENT_LAST_NOTE = 127;
const EVENT_REST = 128;
const EVENT_INSTRUMENT = 129;
const EVENT_TIME_SIG = 130;
const EVENT_VOLUME = 132;
const EVENT_MARK = 255;
const TEMPO_TABLE = [
  64131,
  62757,
  61412,
  60096,
  58809,
  57548,
  56315,
  55108,
  53928,
  52772,
  51641,
  50535,
  49452,
  48392,
  47355,
  46340,
  45347,
  44376,
  43425,
  42494,
  41584,
  40693,
  39821,
  38967,
  38132,
  37315,
  36516,
  35733,
  34968,
  34218,
  33485,
  32768,
  32065,
  31378,
  30706,
  30048,
  29404,
  28774,
  28157,
  27554,
  26964,
  26386,
  25820,
  25267,
  24726,
  24196,
  23677,
  23170,
  22673,
  22188,
  21712,
  21247,
  20792,
  20346,
  19910,
  19483,
  19066,
  18657,
  18258,
  17866,
  17484,
  17109,
  16742,
  16384,
  16032,
  15689,
  15353,
  15024,
  14702,
  14387,
  14078,
  13777,
  13482,
  13193,
  12910,
  12633,
  12363,
  12098,
  11838,
  11585,
  11336,
  11094,
  10856,
  10623,
  10396,
  10173,
  9955,
  9741,
  9533,
  9328,
  9129,
  8933,
  8742,
  8554,
  8371,
  8192,
  8016,
  7844,
  7676,
  7512,
  7351,
  7193,
  7039,
  6888,
  6741,
  6596,
  6455,
  6316,
  6181,
  6049,
  5919,
  5792,
  5668,
  5547,
  5428,
  5311,
  5198,
  5086,
  4977,
  4870,
  4766,
  4664,
  4564,
  4466,
  4371,
  4277,
  4185,
  4096
];
function smusTempoToSpeedBPM(rawTempo) {
  if (rawTempo === 0) return { speed: 6, bpm: 125 };
  let tempoIndex = 0;
  if (rawTempo >= 3601) {
    const quotient = Math.floor(235929600 / rawTempo);
    for (let i = 0; i < TEMPO_TABLE.length; i++) {
      if (quotient >= TEMPO_TABLE[i]) {
        tempoIndex = i;
        break;
      }
      if (i === TEMPO_TABLE.length - 1) tempoIndex = i;
    }
  }
  const tableVal = TEMPO_TABLE[tempoIndex];
  const speed = tableVal >>> 12;
  if (speed === 0) return { speed: 6, bpm: 125 };
  const speedShifted = speed << 12;
  const calculatedTempo = Math.floor(tableVal * 32768 / speedShifted);
  const ciaTimer = Math.floor(calculatedTempo * 11932 / 32768);
  if (ciaTimer === 0) return { speed: 6, bpm: 125 };
  const bpm = Math.round(709379 * 5 / (2 * ciaTimer));
  return {
    speed: Math.max(1, Math.min(31, speed)),
    bpm: Math.max(32, Math.min(255, bpm))
  };
}
function smusNoteToXM(midiNote) {
  return Math.max(1, Math.min(96, midiNote - 11));
}
function isIffSmusFormat(buffer) {
  if (buffer.byteLength < 12) return false;
  const buf = new Uint8Array(buffer);
  if (readFourCC(buf, 0) !== "FORM") return false;
  const type = readFourCC(buf, 8);
  return type === "SMUS" || type === "TINY";
}
const SS_HEADER_SIZE = 62;
function parseSonixSampleFile(data) {
  if (data.length < SS_HEADER_SIZE + 4) return null;
  const lengthOfOctaveOne = u16BE(data, 0);
  const loopOffsetOfOctaveOne = u16BE(data, 2);
  const startOctave = data[4];
  const endOctave = data[5];
  if (lengthOfOctaveOne === 0) return null;
  if (startOctave > 10 || endOctave > 10) return null;
  const isSingleOctave = startOctave === endOctave || startOctave >= 8;
  let extractOctave;
  if (isSingleOctave) {
    extractOctave = startOctave;
  } else {
    if (startOctave > endOctave) return null;
    extractOctave = Math.round((startOctave + endOctave) / 2);
  }
  const octaveOffsetMul = (1 << extractOctave) - (1 << startOctave);
  const dataOffset = SS_HEADER_SIZE + octaveOffsetMul * lengthOfOctaveOne;
  const octaveLength = lengthOfOctaveOne * (1 << extractOctave);
  const availableData = data.length - dataOffset;
  if (availableData < 4) return null;
  const pcmLen = Math.min(octaveLength, availableData);
  const pcm = data.slice(dataOffset, dataOffset + pcmLen);
  let loopStart = 0;
  let loopEnd = 0;
  if (lengthOfOctaveOne !== loopOffsetOfOctaveOne && loopOffsetOfOctaveOne > 0) {
    const scaledLoopOffset = loopOffsetOfOctaveOne * (1 << extractOctave);
    if (scaledLoopOffset < pcmLen) {
      loopStart = scaledLoopOffset;
      loopEnd = pcmLen;
    }
  }
  const sampleRate = Math.round(8287 * Math.pow(2, 6 - extractOctave));
  return { pcm, loopStart, loopEnd, sampleRate };
}
async function parseIffSmusFile(buffer, filename, companionFiles) {
  const buf = new Uint8Array(buffer);
  if (buf.length < 12) {
    const _m = "File too small to be an IFF SMUS module";
    throw new Error(_m);
  }
  if (readFourCC(buf, 0) !== "FORM") {
    const _m = "Not an IFF FORM file";
    throw new Error(_m);
  }
  const formType = readFourCC(buf, 8);
  if (formType !== "SMUS" && formType !== "TINY") {
    throw new Error(`Not an IFF SMUS file: FORM type is ${formType}`);
  }
  let pos = 12;
  const fileLen = buf.length;
  let songName = "";
  let author = "";
  const moduleInfo = {
    globalVolume: 255,
    rawTempo: 0,
    transpose: 0,
    tune: 128,
    timeSigNumerator: 4,
    timeSigDenominator: 4,
    trackVolumes: [],
    tracksEnabled: [],
    tracks: [],
    instrumentMapper: new Array(256).fill(0),
    numChannels: 0
  };
  const instruments = [];
  let trackNumber = 0;
  const trackChunkOffsets = [];
  const trackChunkSizes = [];
  while (pos + 8 <= fileLen) {
    const chunkId = readFourCC(buf, pos);
    pos += 4;
    const chunkSize = (buf[pos] << 24 | buf[pos + 1] << 16 | buf[pos + 2] << 8 | buf[pos + 3]) >>> 0;
    pos += 4;
    const chunkStart = pos;
    switch (chunkId) {
      case "NAME": {
        if (chunkStart + chunkSize <= fileLen) {
          songName = readString(buf, chunkStart, chunkSize);
        }
        break;
      }
      case "AUTH": {
        if (chunkStart + chunkSize <= fileLen) {
          author = readString(buf, chunkStart, chunkSize);
        }
        break;
      }
      case "SHDR": {
        if (chunkStart + 4 > fileLen) break;
        moduleInfo.rawTempo = u16BE(buf, chunkStart);
        let globalVol = u8(buf, chunkStart + 2);
        if (globalVol < 128) globalVol *= 2;
        moduleInfo.globalVolume = globalVol;
        moduleInfo.numChannels = u8(buf, chunkStart + 3);
        moduleInfo.trackVolumes = new Array(moduleInfo.numChannels).fill(255);
        moduleInfo.tracksEnabled = new Array(moduleInfo.numChannels).fill(1);
        moduleInfo.tracks = new Array(moduleInfo.numChannels).fill(null);
        break;
      }
      case "INS1": {
        if (chunkStart + 4 > fileLen) break;
        const register_ = u8(buf, chunkStart);
        const instrType = u8(buf, chunkStart + 1);
        if (instrType !== 0) break;
        if (moduleInfo.instrumentMapper[register_] !== 0) break;
        const nameLen = chunkSize - 4;
        if (nameLen <= 0 || chunkStart + 4 + nameLen > fileLen) break;
        const instrName = readString(buf, chunkStart + 4, nameLen);
        if (!instrName) break;
        instruments.push({ name: instrName });
        moduleInfo.instrumentMapper[register_] = instruments.length;
        break;
      }
      case "TRAK": {
        if (moduleInfo.numChannels === 0) break;
        if (trackNumber >= moduleInfo.numChannels) break;
        const numEvents = Math.floor(chunkSize / 2);
        const events = [];
        for (let i = 0; i < numEvents; i++) {
          const evOff = chunkStart + i * 2;
          if (evOff + 2 > fileLen) break;
          const evType = u8(buf, evOff);
          let evData = u8(buf, evOff + 1);
          if (evType === EVENT_MARK) break;
          if (evType <= EVENT_LAST_NOTE || evType === EVENT_REST) {
            evData &= 15;
            const dur = DURATION_TABLE[evData];
            if (dur < 0) continue;
            evData = dur;
          } else if (evType === EVENT_INSTRUMENT) ;
          else if (evType === EVENT_TIME_SIG) {
            moduleInfo.timeSigNumerator = (evData >> 3 & 31) + 1;
            moduleInfo.timeSigDenominator = 1 << (evData & 7);
            continue;
          } else if (evType === EVENT_VOLUME) {
            if (trackNumber < moduleInfo.trackVolumes.length) {
              moduleInfo.trackVolumes[trackNumber] = (evData & 127) * 2;
            }
            continue;
          } else {
            continue;
          }
          events.push({ type: evType, data: evData });
        }
        events.push({ type: EVENT_MARK, data: 255 });
        moduleInfo.tracks[trackNumber] = { events };
        trackChunkOffsets.push(chunkStart);
        trackChunkSizes.push(chunkSize);
        trackNumber++;
        break;
      }
      case "SNX1":
      case "SNX2":
      case "SNX3":
      case "SNX4":
      case "SNX5":
      case "SNX6":
      case "SNX7":
      case "SNX8":
      case "SNX9": {
        if (moduleInfo.numChannels === 0) break;
        if (chunkStart + 8 + moduleInfo.numChannels * 4 > fileLen) break;
        moduleInfo.transpose = u16BE(buf, chunkStart);
        moduleInfo.tune = u16BE(buf, chunkStart + 2);
        for (let i = 0; i < moduleInfo.numChannels; i++) {
          const off = chunkStart + 8 + i * 4;
          moduleInfo.tracksEnabled[i] = (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
        }
        break;
      }
    }
    let advance = chunkSize;
    if ((advance & 1) !== 0) advance++;
    pos = chunkStart + advance;
  }
  const numCh = Math.max(1, moduleInfo.numChannels);
  const { speed, bpm } = smusTempoToSpeedBPM(moduleInfo.rawTempo);
  const companionByBase = /* @__PURE__ */ new Map();
  if (companionFiles) {
    for (const [name, buf2] of companionFiles) {
      const lower = name.toLowerCase();
      const dotIdx = lower.lastIndexOf(".");
      const base = dotIdx > 0 ? lower.slice(0, dotIdx) : lower;
      const ext = dotIdx > 0 ? lower.slice(dotIdx) : "";
      if (!companionByBase.has(base)) companionByBase.set(base, {});
      const entry = companionByBase.get(base);
      if (ext === ".instr") entry.instr = new Uint8Array(buf2);
      else if (ext === ".ss") entry.ss = new Uint8Array(buf2);
    }
  }
  const instrConfigs = [];
  for (let i = 0; i < instruments.length; i++) {
    const instr = instruments[i];
    const id = i + 1;
    const instrNameLower = instr.name.toLowerCase();
    const companion = companionByBase.get(instrNameLower);
    if (companion == null ? void 0 : companion.ss) {
      const parsed = parseSonixSampleFile(companion.ss);
      if (parsed && parsed.pcm.length > 2) {
        instrConfigs.push(createSamplerInstrument(
          id,
          instr.name || `Instrument ${id}`,
          parsed.pcm,
          64,
          parsed.sampleRate,
          parsed.loopStart,
          parsed.loopEnd
        ));
        continue;
      }
    }
    const silentPcm = new Uint8Array(2);
    instrConfigs.push(createSamplerInstrument(
      id,
      instr.name || `Instrument ${id}`,
      silentPcm,
      64,
      8287,
      0,
      0
    ));
  }
  const channelFlat = [];
  for (let ch = 0; ch < numCh; ch++) {
    const track = ch < moduleInfo.tracks.length ? moduleInfo.tracks[ch] : null;
    const cells = [];
    if (!track) {
      channelFlat.push(cells);
      continue;
    }
    let currentInstrReg = -1;
    const transposeS16 = moduleInfo.transpose >= 32768 ? moduleInfo.transpose - 65536 : moduleInfo.transpose;
    const transposeOff = (transposeS16 >> 4) - 8;
    for (const ev of track.events) {
      if (ev.type === EVENT_MARK) break;
      if (ev.type <= EVENT_LAST_NOTE) {
        const transposedMidi = ev.type + transposeOff;
        const xmNote = smusNoteToXM(transposedMidi);
        let xmInstr = 0;
        if (currentInstrReg >= 0) {
          const mapped = moduleInfo.instrumentMapper[currentInstrReg];
          if (mapped !== 0) xmInstr = mapped;
        }
        const trackVol = ch < moduleInfo.trackVolumes.length ? moduleInfo.trackVolumes[ch] : 255;
        const xmVol = trackVol === 255 ? 0 : 16 + Math.min(64, Math.round(trackVol / 254 * 64));
        const dur = Math.max(1, ev.data);
        cells.push({
          note: xmNote,
          instrument: xmInstr,
          volume: xmVol,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        });
        for (let k = 1; k < dur; k++) cells.push(emptyCell());
      } else if (ev.type === EVENT_REST) {
        const dur = Math.max(1, ev.data);
        for (let k = 0; k < dur; k++) cells.push(emptyCell());
      } else if (ev.type === EVENT_INSTRUMENT) {
        currentInstrReg = ev.data;
      }
    }
    channelFlat.push(cells);
  }
  let totalRows = 0;
  for (const ch of channelFlat) {
    if (ch.length > totalRows) totalRows = ch.length;
  }
  if (totalRows === 0) totalRows = 64;
  for (const ch of channelFlat) {
    while (ch.length < totalRows) ch.push(emptyCell());
  }
  const PATTERN_LENGTH = 64;
  const numPatterns = Math.max(1, Math.ceil(totalRows / PATTERN_LENGTH));
  const patterns = [];
  for (let p = 0; p < numPatterns; p++) {
    const startRow = p * PATTERN_LENGTH;
    const endRow = Math.min(startRow + PATTERN_LENGTH, totalRows);
    const patLen = endRow - startRow;
    const channels = channelFlat.map((cells, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: channelPan(ch),
      instrumentId: null,
      color: null,
      rows: cells.slice(startRow, endRow)
    }));
    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p + 1}`,
      length: patLen,
      channels,
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numCh,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instruments.length
      }
    });
  }
  const baseName = filename.replace(/\.[^/.]+$/, "");
  const displayName = songName ? author ? `${songName} (${author})` : songName : baseName;
  const smusTrackMap = patterns.map(
    () => Array.from({ length: numCh }, (_, ch) => ch)
  );
  const uadeVariableLayout = {
    formatId: "iffSmus",
    numChannels: numCh,
    numFilePatterns: trackChunkOffsets.length,
    rowsPerPattern: 64,
    moduleSize: buffer.byteLength,
    encoder: iffSmusEncoder,
    filePatternAddrs: trackChunkOffsets,
    filePatternSizes: trackChunkSizes,
    trackMap: smusTrackMap
  };
  return {
    name: `${displayName} [SMUS]`,
    format: "MOD",
    patterns,
    instruments: instrConfigs,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: speed,
    initialBPM: bpm,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadeVariableLayout
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function channelPan(ch) {
  const pattern = [-50, 50, 50, -50];
  return pattern[ch % 4];
}
export {
  isIffSmusFormat,
  parseIffSmusFile
};
