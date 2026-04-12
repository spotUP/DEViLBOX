import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import { a as actionamicsEncoder } from "./ActionamicsEncoder-CxUzspTM.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SIGNATURE = "ACTIONAMICS SOUND TOOL";
const SIGNATURE_OFFSET = 62;
const PERIODS = [
  0,
  5760,
  5424,
  5120,
  4832,
  4560,
  4304,
  4064,
  3840,
  3816,
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
  1016,
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
  453,
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
  107,
  101,
  95
];
const PERIOD_TABLE_REFERENCE_IDX = 37;
const XM_REFERENCE_NOTE = 13;
function u16BE(b, off) {
  return b[off] << 8 | b[off + 1];
}
function u32BE(b, off) {
  return (b[off] << 24 | b[off + 1] << 16 | b[off + 2] << 8 | b[off + 3]) >>> 0;
}
function s8(v) {
  return v < 128 ? v : v - 256;
}
function readAmigaString(b, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = b[off + i];
    if (c === 0) break;
    if (c >= 32 && c < 128) s += String.fromCharCode(c);
  }
  return s.trim();
}
function astNoteToXM(noteIdx) {
  if (noteIdx <= 0 || noteIdx >= PERIODS.length) return 0;
  const xm = XM_REFERENCE_NOTE + (noteIdx - PERIOD_TABLE_REFERENCE_IDX);
  return Math.max(1, Math.min(96, xm));
}
function isActionamicsFormat(bytes) {
  if (bytes.length < 90) return false;
  let sig = "";
  for (let i = 0; i < SIGNATURE.length; i++) {
    sig += String.fromCharCode(bytes[SIGNATURE_OFFSET + i]);
  }
  return sig === SIGNATURE;
}
function parseActionamicsFile(bytes, filename) {
  if (!isActionamicsFormat(bytes)) return null;
  try {
    return parseInternal(bytes, filename);
  } catch (e) {
    console.warn("[ActionamicsParser] Parse failed:", e);
    return null;
  }
}
function parseInternal(bytes, filename) {
  const len = bytes.length;
  const tempo = u16BE(bytes, 0);
  const sectionLengths = [];
  for (let i = 0; i < 15; i++) {
    sectionLengths.push(u32BE(bytes, 2 + i * 4));
  }
  let cursor = 62;
  const moduleInfoOffset = cursor + sectionLengths[0];
  if (moduleInfoOffset + 4 > len) return null;
  const totalLength = u32BE(bytes, moduleInfoOffset);
  const positionsOffset = moduleInfoOffset + sectionLengths[1];
  const trackNumberLength = sectionLengths[2];
  const instrumentTransposeLength = sectionLengths[3];
  const noteTransposeLength = sectionLengths[4];
  if (trackNumberLength !== instrumentTransposeLength || trackNumberLength !== noteTransposeLength) {
    return null;
  }
  const numPositions = Math.floor(trackNumberLength / 4);
  if (positionsOffset + trackNumberLength + instrumentTransposeLength + noteTransposeLength > len) return null;
  const positions = Array.from(
    { length: 4 },
    () => Array.from({ length: numPositions }, () => ({ trackNumber: 0, noteTranspose: 0, instrumentTranspose: 0 }))
  );
  let p = positionsOffset;
  for (let ch = 0; ch < 4; ch++) {
    for (let j = 0; j < numPositions; j++) {
      positions[ch][j].trackNumber = bytes[p++];
    }
  }
  for (let ch = 0; ch < 4; ch++) {
    for (let j = 0; j < numPositions; j++) {
      positions[ch][j].noteTranspose = s8(bytes[p++]);
    }
  }
  for (let ch = 0; ch < 4; ch++) {
    for (let j = 0; j < numPositions; j++) {
      positions[ch][j].instrumentTranspose = s8(bytes[p++]);
    }
  }
  const instrumentsOffset = positionsOffset + trackNumberLength + instrumentTransposeLength + noteTransposeLength;
  const instrumentLength = sectionLengths[5];
  const numInstruments = Math.floor(instrumentLength / 32);
  if (instrumentsOffset + instrumentLength > len) return null;
  const instruments = [];
  let iOff = instrumentsOffset;
  for (let i = 0; i < numInstruments; i++) {
    const instr = {
      sampleNumberListNumber: bytes[iOff],
      sampleNumberListValuesCount: bytes[iOff + 1],
      sampleNumberListStartDelta: bytes[iOff + 2],
      sampleNumberListCounterEnd: bytes[iOff + 3],
      arpeggioListNumber: bytes[iOff + 4],
      arpeggioListValuesCount: bytes[iOff + 5],
      arpeggioListStartDelta: bytes[iOff + 6],
      arpeggioListCounterEnd: bytes[iOff + 7],
      frequencyListNumber: bytes[iOff + 8],
      frequencyListValuesCount: bytes[iOff + 9],
      frequencyListStartDelta: bytes[iOff + 10],
      frequencyListCounterEnd: bytes[iOff + 11],
      portamentoIncrement: s8(bytes[iOff + 12]),
      portamentoDelay: bytes[iOff + 13],
      noteTranspose: s8(bytes[iOff + 14]),
      // iOff+15 = pad
      attackEndVolume: bytes[iOff + 16],
      attackSpeed: bytes[iOff + 17],
      decayEndVolume: bytes[iOff + 18],
      decaySpeed: bytes[iOff + 19],
      sustainDelay: bytes[iOff + 20],
      releaseEndVolume: bytes[iOff + 21],
      releaseSpeed: bytes[iOff + 22]
      // iOff+23..31 = pad (9 bytes)
    };
    instruments.push(instr);
    iOff += 32;
  }
  const sampleNumberListOffset = instrumentsOffset + instrumentLength;
  const arpeggioListOffset = sampleNumberListOffset + sectionLengths[6];
  const frequencyListOffset = arpeggioListOffset + sectionLengths[7];
  function loadList(offset, length) {
    const count = Math.floor(length / 16);
    const result = [];
    for (let i = 0; i < count; i++) {
      const arr = new Int8Array(16);
      for (let j = 0; j < 16; j++) {
        arr[j] = s8(bytes[offset + i * 16 + j]);
      }
      result.push(arr);
    }
    return result;
  }
  const sampleNumberList = loadList(sampleNumberListOffset, sectionLengths[6]);
  const subSongsOffset = frequencyListOffset + sectionLengths[8] + sectionLengths[9] + sectionLengths[10];
  const subSongCount = Math.floor(sectionLengths[11] / 4);
  if (subSongsOffset + sectionLengths[11] > len) return null;
  const allSongInfos = [];
  for (let i = 0; i < subSongCount; i++) {
    const base = subSongsOffset + i * 4;
    const si = {
      startPosition: bytes[base],
      endPosition: bytes[base + 1],
      loopPosition: bytes[base + 2],
      speed: bytes[base + 3]
    };
    allSongInfos.push(si);
  }
  const songInfoList = allSongInfos.filter((s) => s.startPosition !== 0 || s.endPosition !== 0 || s.loopPosition !== 0);
  if (songInfoList.length === 0) {
    if (allSongInfos.length > 0) songInfoList.push(allSongInfos[0]);
    else return null;
  }
  const sampleInfoOffset = subSongsOffset + sectionLengths[11] + sectionLengths[12];
  const sampleInfoLength = sectionLengths[13];
  const numSamples = Math.floor(sampleInfoLength / 64);
  if (sampleInfoOffset + sampleInfoLength > len) return null;
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const base = sampleInfoOffset + i * 64;
    const length = u16BE(bytes, base + 4);
    const loopStart = u16BE(bytes, base + 6);
    const loopLength = u16BE(bytes, base + 8);
    const effectLength = u16BE(bytes, base + 12);
    const effectSpeed = u16BE(bytes, base + 14);
    const arpeggioListNumber = effectLength >> 8 & 255;
    const name = readAmigaString(bytes, base + 32, 32);
    samples.push({ name, length, loopStart, loopLength, pcm: null, arpeggioListNumber, effectSpeed });
  }
  const tracksOffset = sampleInfoOffset + sampleInfoLength;
  const trackOffsetsLength = sectionLengths[14];
  const numTrackOffsets = Math.floor(trackOffsetsLength / 2);
  const numTracks = numTrackOffsets - 1;
  if (tracksOffset + trackOffsetsLength > len) return null;
  const trackOffsetTable = [];
  for (let i = 0; i < numTrackOffsets; i++) {
    trackOffsetTable.push(u16BE(bytes, tracksOffset + i * 2));
  }
  const trackDataStart = tracksOffset + trackOffsetsLength;
  const trackDataArrays = [];
  const filePatternAddrs = [];
  const filePatternSizes = [];
  for (let i = 0; i < numTracks; i++) {
    const trackStart = trackDataStart + trackOffsetTable[i];
    const trackEnd = trackDataStart + trackOffsetTable[i + 1];
    filePatternAddrs.push(trackStart);
    filePatternSizes.push(Math.max(0, trackEnd - trackStart));
    if (trackEnd > len || trackStart > trackEnd) {
      trackDataArrays.push(new Uint8Array(0));
      continue;
    }
    trackDataArrays.push(bytes.slice(trackStart, trackEnd));
  }
  const totalSampleBytes = samples.reduce((acc, s) => acc + s.length * 2, 0);
  const sampleDataStart = totalLength - totalSampleBytes;
  if (sampleDataStart >= 0 && sampleDataStart + totalSampleBytes <= len) {
    let sOff = sampleDataStart;
    for (const sample of samples) {
      if (sample.length > 0) {
        const byteLen = sample.length * 2;
        const pcm = new Int8Array(byteLen);
        for (let j = 0; j < byteLen; j++) {
          pcm[j] = s8(bytes[sOff + j]);
        }
        sample.pcm = pcm;
        sOff += byteLen;
      }
    }
  }
  const primarySong = songInfoList[0];
  const instrumentConfigs = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const id = i + 1;
    if (sample.pcm && sample.length > 0) {
      const pcmBytes = new Uint8Array(sample.pcm.buffer);
      const sampleRate = 8287;
      const loopStart = sample.loopLength > 1 ? sample.loopStart * 2 : 0;
      const loopEnd = sample.loopLength > 1 ? (sample.loopStart + sample.loopLength) * 2 : 0;
      const samplerInstr = createSamplerInstrument(id, sample.name || `Sample ${i + 1}`, pcmBytes, 64, sampleRate, loopStart, loopEnd);
      samplerInstr.uadeChipRam = {
        moduleBase: 0,
        moduleSize: bytes.length,
        instrBase: sampleInfoOffset + i * 64,
        // file offset of this sample's 64-byte header
        instrSize: 64
      };
      instrumentConfigs.push(samplerInstr);
    } else {
      instrumentConfigs.push({
        id,
        name: sample.name || `Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0,
        uadeChipRam: {
          moduleBase: 0,
          moduleSize: bytes.length,
          instrBase: sampleInfoOffset + i * 64,
          // file offset of this sample's 64-byte header
          instrSize: 64
        }
      });
    }
  }
  function decodeTrack(data) {
    const rows = [];
    let pos = 0;
    let delayCounter = 0;
    const MAX_ROWS = 64;
    while (rows.length < MAX_ROWS && pos < data.length) {
      if (delayCounter > 0) {
        rows.push({ note: 0, instrNum: 0, effect: 0, effectArg: 0 });
        delayCounter--;
        continue;
      }
      const b0 = data[pos++];
      if ((b0 & 128) !== 0) {
        delayCounter = ~b0 & 255;
        continue;
      }
      if (b0 >= 112) {
        const effArg = pos < data.length ? data[pos++] : 0;
        rows.push({ note: 0, instrNum: 0, effect: b0, effectArg: effArg });
        continue;
      }
      const note = b0;
      let instrNum = 0;
      let effect = 0;
      let effectArg = 0;
      if (pos >= data.length) {
        rows.push({ note, instrNum, effect, effectArg });
        break;
      }
      const b1 = data[pos++];
      if ((b1 & 128) !== 0) {
        delayCounter = ~b1 & 255;
        rows.push({ note, instrNum, effect, effectArg });
        continue;
      }
      if (b1 >= 112) {
        effectArg = pos < data.length ? data[pos++] : 0;
        rows.push({ note, instrNum, effect: b1, effectArg });
        continue;
      }
      instrNum = b1;
      if (pos >= data.length) {
        rows.push({ note, instrNum, effect, effectArg });
        break;
      }
      const b2 = data[pos++];
      if ((b2 & 128) !== 0) {
        delayCounter = ~b2 & 255;
        rows.push({ note, instrNum, effect, effectArg });
        continue;
      }
      effect = b2;
      effectArg = pos < data.length ? data[pos++] : 0;
      rows.push({ note, instrNum, effect, effectArg });
    }
    while (rows.length < MAX_ROWS) {
      rows.push({ note: 0, instrNum: 0, effect: 0, effectArg: 0 });
    }
    return rows.slice(0, MAX_ROWS);
  }
  function mapEffect(effect, arg) {
    switch (effect) {
      case 112:
        return { effTyp: 0, eff: arg };
      // Arpeggio
      case 113:
        return { effTyp: 1, eff: arg };
      // Slide up (portamento up)
      case 114:
        return { effTyp: 2, eff: arg };
      // Slide down
      case 115:
        return { effTyp: 10, eff: arg };
      // Volume slide after envelope
      case 116:
        return { effTyp: 4, eff: arg };
      // Vibrato
      case 117:
        return { effTyp: 15, eff: arg };
      // Set rows (speed-like)
      case 118:
        return { effTyp: 9, eff: arg };
      // Set sample offset
      case 119:
        return { effTyp: 14, eff: 208 | arg & 15 };
      // Note delay (Exy E=D)
      case 120:
        return { effTyp: 14, eff: 192 | arg & 15 };
      // Mute (cut) → ECx
      case 121:
        return { effTyp: 9, eff: 0 };
      // Sample restart → offset 0
      case 122:
        return { effTyp: 7, eff: arg };
      // Tremolo
      case 123:
        return { effTyp: 13, eff: arg };
      // Break
      case 124:
        return { effTyp: 12, eff: Math.min(64, arg) };
      // Set volume
      case 125:
        return { effTyp: 10, eff: arg };
      // Volume slide
      case 126:
        return { effTyp: 6, eff: arg };
      // Volume slide + vibrato
      case 127:
        return { effTyp: 15, eff: arg };
      // Set speed
      default:
        return { effTyp: 0, eff: 0 };
    }
  }
  const startPos = primarySong.startPosition;
  const endPos = primarySong.endPosition;
  const ROWS_PER_PATTERN = 64;
  const trackerPatterns = [];
  for (let posIdx = startPos; posIdx <= endPos && posIdx < numPositions; posIdx++) {
    const channelRows = Array.from({ length: 4 }, () => []);
    for (let ch = 0; ch < 4; ch++) {
      const posInfo = positions[ch][posIdx];
      const trackIdx = posInfo.trackNumber;
      const noteTranspose = posInfo.noteTranspose;
      const instrTranspose = posInfo.instrumentTranspose;
      const trackData = trackIdx < trackDataArrays.length ? trackDataArrays[trackIdx] : new Uint8Array(0);
      const decodedRows = decodeTrack(trackData);
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const r = decodedRows[row] || { note: 0, instrNum: 0, effect: 0, effectArg: 0 };
        let xmNote = 0;
        let instrId = 0;
        if (r.note > 0) {
          const transposedNote = r.note + noteTranspose;
          xmNote = astNoteToXM(transposedNote);
          if (r.instrNum > 0) {
            const instrIdx = r.instrNum - 1 + instrTranspose;
            if (instrIdx >= 0 && instrIdx < instruments.length) {
              const instr = instruments[instrIdx];
              const snListNum = instr.sampleNumberListNumber;
              if (snListNum < sampleNumberList.length) {
                const sampleNum = sampleNumberList[snListNum][0];
                instrId = (sampleNum >= 0 ? sampleNum : sampleNum + 256) + 1;
              } else {
                instrId = r.instrNum;
              }
            }
          }
        }
        const { effTyp, eff } = mapEffect(r.effect, r.effectArg);
        channelRows[ch].push({
          note: xmNote,
          instrument: instrId,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        });
      }
    }
    const patIdx = posIdx - startPos;
    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Position ${posIdx}`,
      length: ROWS_PER_PATTERN,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: [-50, 50, 50, -50][ch] ?? 0,
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "AST",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numTracks,
        originalInstrumentCount: numSamples
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: ROWS_PER_PATTERN,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: [-50, 50, 50, -50][ch] ?? 0,
        instrumentId: null,
        color: null,
        rows: Array.from({ length: ROWS_PER_PATTERN }, () => ({
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
        sourceFormat: "AST",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: numSamples
      }
    });
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const bpm = tempo > 0 ? tempo : 125;
  const speed = primarySong.speed > 0 ? primarySong.speed : 6;
  const trackMap = [];
  for (let posIdx = startPos; posIdx <= endPos && posIdx < numPositions; posIdx++) {
    const chTracks = [];
    for (let ch = 0; ch < 4; ch++) {
      const trackIdx = positions[ch][posIdx].trackNumber;
      chTracks.push(trackIdx < numTracks ? trackIdx : -1);
    }
    trackMap.push(chTracks);
  }
  const variableLayout = {
    formatId: "actionamics",
    numChannels: 4,
    numFilePatterns: numTracks,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: len,
    encoder: actionamicsEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: moduleName,
    format: "AST",
    patterns: trackerPatterns,
    instruments: instrumentConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: speed,
    initialBPM: bpm,
    linearPeriods: false,
    uadeEditableFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    uadeEditableFileName: filename,
    uadeVariableLayout: variableLayout
  };
}
export {
  isActionamicsFormat,
  parseActionamicsFile
};
