import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function reverseEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { command: 0, param: 0 };
  if (effTyp === 8) {
    return { command: 8, param: Math.round(eff / 2) & 255 };
  }
  if (effTyp <= 15) {
    return { command: effTyp, param: eff };
  }
  return { command: 0, param: 0 };
}
function encodeAMFCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  if (note > 0) {
    const noteRaw = note - 37;
    out[0] = noteRaw > 0 && noteRaw <= 107 ? noteRaw : 0;
  }
  out[1] = cell.instrument ?? 0;
  const { command, param } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = command;
  out[3] = param;
  return out;
}
registerPatternEncoder("amf", () => encodeAMFCell);
function u8(v, off) {
  return v.getUint8(off);
}
function i8(v, off) {
  return v.getInt8(off);
}
function u16le(v, off) {
  return v.getUint16(off, true);
}
function u32le(v, off) {
  return v.getUint32(off, true);
}
function readString(v, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
function mod2xmFineTune(nibble) {
  const n = nibble & 15;
  return (n < 8 ? n : n - 16) * 16;
}
function blankInstrument(id, name) {
  return {
    id,
    name: name || `Sample ${id}`,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: -60,
    pan: 0
  };
}
function isAMFFormat(buffer) {
  if (buffer.byteLength < 4) return false;
  const v = new DataView(buffer);
  if (buffer.byteLength >= 38) {
    let match = true;
    const sig = "ASYLUM Music Format V1.0\0";
    for (let i = 0; i < 25; i++) {
      if (v.getUint8(i) !== sig.charCodeAt(i)) {
        match = false;
        break;
      }
    }
    if (match) {
      const numSamples = v.getUint8(34);
      if (numSamples <= 64) return true;
    }
  }
  const c0 = String.fromCharCode(v.getUint8(0));
  const c1 = String.fromCharCode(v.getUint8(1));
  const c2 = String.fromCharCode(v.getUint8(2));
  const ver = v.getUint8(3);
  if (c0 === "A" && c1 === "M" && c2 === "F") {
    if (ver === 1 || ver >= 8 && ver <= 14) return true;
  }
  if (c0 === "D" && c1 === "M" && c2 === "F") {
    if (ver >= 10 && ver <= 14) return true;
  }
  return false;
}
function convertModCommand(command, param) {
  switch (command) {
    case 0:
      return { effTyp: 0, eff: param };
    // arpeggio
    case 1:
      return { effTyp: 1, eff: param };
    // porta up
    case 2:
      return { effTyp: 2, eff: param };
    // porta down
    case 3:
      return { effTyp: 3, eff: param };
    // tone porta
    case 4:
      return { effTyp: 4, eff: param };
    // vibrato
    case 5:
      return { effTyp: 5, eff: param };
    // tone porta + vol slide
    case 6:
      return { effTyp: 6, eff: param };
    // vibrato + vol slide
    case 7:
      return { effTyp: 7, eff: param };
    // tremolo
    case 8:
      return { effTyp: 8, eff: Math.min(255, param * 2) };
    case 9:
      return { effTyp: 9, eff: param };
    // sample offset
    case 10:
      return { effTyp: 10, eff: param };
    // volume slide
    case 11:
      return { effTyp: 11, eff: param };
    // position jump
    case 12:
      return { effTyp: 12, eff: Math.min(64, param) };
    // set volume
    case 13:
      return { effTyp: 13, eff: param };
    // pattern break
    case 14:
      return { effTyp: 14, eff: param };
    // extended
    case 15:
      return { effTyp: 15, eff: param };
    // speed/tempo
    default:
      return { effTyp: 0, eff: 0 };
  }
}
function parseAsylumAMF(v, raw, filename) {
  var _a;
  const defaultSpeed = u8(v, 32);
  const defaultTempo = u8(v, 33);
  const numSamples = u8(v, 34);
  const numPatterns = u8(v, 35);
  const numOrders = u8(v, 36);
  const restartPos = u8(v, 37);
  const NUM_CHANNELS = 8;
  const songPositions = [];
  for (let i = 0; i < numOrders; i++) {
    songPositions.push(u8(v, 38 + i));
  }
  if (songPositions.length === 0) songPositions.push(0);
  const ASYLUM_SAMPLE_HDR = 37;
  const smpHdrBase = 294;
  const sampleHeaders = [];
  for (let s = 0; s < 64; s++) {
    const off = smpHdrBase + s * ASYLUM_SAMPLE_HDR;
    sampleHeaders.push({
      name: readString(v, off, 22),
      finetune: u8(v, off + 22),
      volume: Math.min(u8(v, off + 23), 64),
      transpose: i8(v, off + 24),
      length: u32le(v, off + 25),
      loopStart: u32le(v, off + 29),
      loopLength: u32le(v, off + 33)
    });
  }
  const patDataBase = smpHdrBase + 64 * ASYLUM_SAMPLE_HDR;
  const PATTERN_BYTES = 64 * NUM_CHANNELS * 4;
  const NOTE_MIN = 1;
  const patterns = [];
  for (let pat = 0; pat < numPatterns; pat++) {
    const patBase = patDataBase + pat * PATTERN_BYTES;
    const channels = Array.from({ length: NUM_CHANNELS }, (_, ch) => {
      const rows = [];
      for (let row = 0; row < 64; row++) {
        const cellOff = patBase + row * NUM_CHANNELS * 4 + ch * 4;
        if (cellOff + 3 >= v.byteLength) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const noteRaw = u8(v, cellOff);
        const instr = u8(v, cellOff + 1);
        const command = u8(v, cellOff + 2);
        const param = u8(v, cellOff + 3);
        let note = 0;
        if (noteRaw > 0 && noteRaw + 12 + NOTE_MIN <= 120) {
          note = noteRaw + 12 + NOTE_MIN;
        }
        const { effTyp, eff } = convertModCommand(command, param);
        rows.push({
          note,
          instrument: instr,
          volume: 0,
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
        pan: ch < 4 ? ch % 2 === 0 ? -64 : 64 : ch % 2 === 0 ? -64 : 64,
        instrumentId: null,
        color: null,
        rows
      };
    });
    patterns.push({
      id: `pattern-${pat}`,
      name: `Pattern ${pat}`,
      length: 64,
      channels,
      importMetadata: {
        sourceFormat: "AMF_ASYLUM",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numSamples
      }
    });
  }
  let smpDataOff = patDataBase + numPatterns * PATTERN_BYTES;
  const instruments = [];
  for (let s = 0; s < numSamples; s++) {
    const sh = sampleHeaders[s];
    const id = s + 1;
    const name = (sh == null ? void 0 : sh.name) || `Sample ${id}`;
    if (!sh || sh.length === 0 || smpDataOff + sh.length > v.byteLength) {
      instruments.push(blankInstrument(id, name));
      if (sh && sh.length > 0) smpDataOff += Math.min(sh.length, v.byteLength - smpDataOff);
      continue;
    }
    const pcm = raw.slice(smpDataOff, smpDataOff + sh.length);
    smpDataOff += sh.length;
    const hasLoop = sh.loopLength > 2 && sh.loopStart + sh.loopLength <= sh.length;
    const loopStart = hasLoop ? sh.loopStart : 0;
    const loopEnd = hasLoop ? sh.loopStart + sh.loopLength : 0;
    const sampleRate = 8363;
    const finetune = mod2xmFineTune(sh.finetune);
    const inst = createSamplerInstrument(id, name, pcm, sh.volume, sampleRate, loopStart, loopEnd);
    if ((_a = inst.metadata) == null ? void 0 : _a.modPlayback) {
      inst.metadata.modPlayback.finetune = finetune;
    }
    instruments.push(inst);
  }
  const clampedRestart = restartPos < numOrders ? restartPos : 0;
  const maxPat = Math.max(0, patterns.length - 1);
  const finalPositions = songPositions.map((p) => Math.min(p, maxPat));
  const uadePatternLayout = {
    formatId: "amf",
    patternDataFileOffset: 2662,
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels: NUM_CHANNELS,
    numPatterns,
    moduleSize: v.byteLength,
    encodeCell: encodeAMFCell
  };
  return {
    name: filename.replace(/\.[^/.]+$/i, ""),
    format: "MOD",
    patterns,
    instruments,
    songPositions: finalPositions,
    songLength: finalPositions.length,
    restartPosition: clampedRestart,
    numChannels: NUM_CHANNELS,
    initialSpeed: Math.max(1, defaultSpeed),
    initialBPM: Math.max(1, defaultTempo),
    linearPeriods: false,
    uadePatternLayout
  };
}
function convertAMFDSMIEffect(command, param, cell) {
  const masked = command & 127;
  const effTrans = [
    0,
    // 00 none
    15,
    // 01 speed
    10,
    // 02 volslide
    12,
    // 03 volume (CMD_VOLUME → volume column)
    1,
    // 04 portaUp
    0,
    // 05 none
    3,
    // 06 tonePorta
    29,
    // 07 tremor
    0,
    // 08 arpeggio (effTyp 0)
    4,
    // 09 vibrato
    5,
    // 0A tonePortaVol
    6,
    // 0B vibratoVol
    13,
    // 0C patBreak
    11,
    // 0D posJump
    0,
    // 0E none
    27,
    // 0F retrig
    9,
    // 10 offset
    10,
    // 11 fineVolSlide
    1,
    // 12 finePorta
    14,
    // 13 S3MCmdEx (noteDelay)
    14,
    // 14 S3MCmdEx (noteCut)
    15,
    // 15 tempo
    1,
    // 16 extraFinePorta
    8
    // 17 panning
  ];
  if (masked >= effTrans.length) return;
  let cmd = effTrans[masked];
  let p = param;
  switch (masked) {
    case 2:
    // Volume slide: positive = up, negative = down
    case 10:
    // Tone porta + vol slide
    case 11:
      if (p & 128) {
        p = -p & 255 & 15;
      } else {
        p = (p & 15) << 4;
      }
      break;
    case 3:
      p = Math.min(p, 64);
      if (cell.volume === 0) {
        cell.volume = p;
        cmd = 0;
        p = 0;
      }
      break;
    case 4:
      if (p & 128) {
        p = -p & 255 & 127;
      } else {
        cmd = 2;
      }
      break;
    case 17: {
      if (p === 0) {
        cmd = 0;
        break;
      }
      if (p & 128) {
        p = 240 | -p & 255 & 15;
      } else {
        p = 15 | (p & 15) << 4;
      }
      break;
    }
    case 18:
    // Fine portamento
    case 22: {
      if (p === 0) {
        cmd = 0;
        break;
      }
      if (p & 128) {
        cmd = 1;
        p = -p & 255 & 15;
      } else {
        cmd = 2;
      }
      p |= masked === 22 ? 224 : 240;
      break;
    }
    case 19:
      p = 208 | p & 15;
      break;
    case 20:
      p = 192 | p & 15;
      break;
    case 23: {
      if (p === 100) {
        p = 164;
      } else {
        p = Math.max(0, Math.min(128, (p < 128 ? p : p - 256) + 64));
        if (cell.effTyp !== 0) {
          if (cell.volume === 0) {
            cell.volume = Math.floor(p / 2);
          }
          cmd = 0;
          p = 0;
        }
      }
      break;
    }
  }
  if (cmd !== 0 || p !== 0) {
    cell.effTyp = cmd;
    cell.eff = p;
  }
}
function amfReadTrack(trackData, numRows, rows) {
  let pos = 0;
  while (pos + 2 < trackData.length) {
    const row = trackData[pos];
    const command = trackData[pos + 1];
    const value = trackData[pos + 2];
    pos += 3;
    if (row >= numRows) break;
    const cell = rows[row];
    if (command < 127) {
      if (command === 0 && value === 0) {
        cell.note = 97;
      } else {
        cell.note = command + 1;
        if (value !== 255) {
          cell.volume = value;
        }
      }
    } else if (command === 127) ;
    else if (command === 128) {
      cell.instrument = value + 1;
    } else {
      convertAMFDSMIEffect(command, value, cell);
    }
  }
}
function parseDSMIAMF(v, raw, filename) {
  var _a;
  const fileLen = v.byteLength;
  let off = 0;
  const sigStr = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2));
  const version = v.getUint8(3);
  const isDMF = sigStr === "DMF";
  off = 4;
  let songTitle = "";
  if (!isDMF) {
    if (off + 32 > fileLen) throw new Error("AMFParser(DSMI): truncated at title");
    songTitle = readString(v, off, 32);
    off += 32;
  }
  if (off + 4 > fileLen) throw new Error("AMFParser(DSMI): truncated at file header");
  const numSamples = u8(v, off);
  off++;
  const numOrders = u8(v, off);
  off++;
  const numTracks = u16le(v, off);
  off += 2;
  let numChannels = 4;
  if (version >= 9) {
    if (off >= fileLen) throw new Error("AMFParser(DSMI): truncated at numChannels");
    numChannels = u8(v, off);
    off++;
    if (numChannels < 1 || numChannels > 32) throw new Error(`AMFParser(DSMI): invalid numChannels ${numChannels}`);
  }
  const channelPan = Array(numChannels).fill(0);
  if (version >= 11) {
    const readChans = version >= 12 ? 32 : 16;
    for (let c = 0; c < numChannels && c < readChans; c++) {
      if (off >= fileLen) break;
      const pan = i8(v, off + c);
      if (pan === 100) {
        channelPan[c] = 0;
      } else {
        const raw256 = Math.max(0, Math.min(256, (pan + 64) * 2));
        channelPan[c] = raw256 - 128;
      }
    }
    if (off + readChans <= fileLen) off += readChans;
    else off = fileLen;
  } else if (version >= 9) {
    off += 16;
    for (let c = 0; c < numChannels; c++) {
      channelPan[c] = c & 1 ? 64 : -64;
    }
  } else {
    for (let c = 0; c < 4; c++) {
      channelPan[c] = c & 1 ? 64 : -64;
    }
  }
  let initialBPM = 125;
  let initialSpeed = 6;
  if (version >= 13) {
    if (off + 2 > fileLen) throw new Error("AMFParser(DSMI): truncated at tempo");
    let tempo = u8(v, off);
    off++;
    if (tempo < 32) tempo = 125;
    initialBPM = tempo;
    initialSpeed = u8(v, off);
    off++;
  }
  const orderEntries = [];
  for (let ord = 0; ord < numOrders; ord++) {
    let patLength = 64;
    if (version >= 14) {
      if (off + 2 > fileLen) break;
      patLength = u16le(v, off);
      off += 2;
    }
    const trackRefs = [];
    for (let c = 0; c < numChannels; c++) {
      if (off + 2 > fileLen) {
        trackRefs.push(0);
        continue;
      }
      trackRefs.push(u16le(v, off));
      off += 2;
    }
    orderEntries.push({ patLength, trackRefs });
  }
  let truncatedHeaders = false;
  if (version === 10 && !isDMF) {
    const peekOff = off;
    const AMF_NEW_HDR = 65;
    for (let s = 0; s < numSamples; s++) {
      const hdrOff = peekOff + s * AMF_NEW_HDR;
      if (hdrOff + AMF_NEW_HDR > fileLen) break;
      const type = u8(v, hdrOff);
      const idx = u32le(v, hdrOff + 46);
      const len = u32le(v, hdrOff + 50);
      const vol = u8(v, hdrOff + 56);
      const lstart = u32le(v, hdrOff + 57);
      const lend = u32le(v, hdrOff + 61);
      if (type > 1 || idx > numSamples || len > 1048576 || vol > 64 || lstart > len || lend > len) {
        truncatedHeaders = true;
        break;
      }
    }
  }
  const sampleHeaders = [];
  const sampleMap = [];
  for (let s = 0; s < numSamples; s++) {
    if (version < 10) {
      const AMF_OLD = 59;
      if (off + AMF_OLD > fileLen) break;
      const type = u8(v, off);
      const name = readString(v, off + 1, 32);
      const index = u32le(v, off + 46);
      const length = u16le(v, off + 50);
      const sr = u16le(v, off + 52);
      const volume = u8(v, off + 54);
      const loopStart = u16le(v, off + 55);
      const loopEnd = u16le(v, off + 57);
      const hasLoop = type !== 0 && loopEnd !== 65535 && loopEnd > loopStart + 2 && loopEnd <= length;
      sampleHeaders.push({
        type,
        name,
        index,
        length,
        sampleRate: sr,
        volume: Math.min(volume, 64),
        loopStart: hasLoop ? loopStart : 0,
        loopEnd: hasLoop ? loopEnd : 0,
        hasLoop
      });
      sampleMap.push(index);
      off += AMF_OLD;
    } else if (isDMF) {
      const AMF_COMPACT = 20;
      if (off + AMF_COMPACT > fileLen) break;
      const type = u8(v, off);
      const index = u32le(v, off + 2);
      const length = u32le(v, off + 6);
      const sr = u16le(v, off + 10);
      const volume = u8(v, off + 12);
      const loopStart = u32le(v, off + 13);
      const loopEndLo = u16le(v, off + 17);
      const loopEndHi = u8(v, off + 19);
      const loopEnd = loopEndLo | loopEndHi << 16;
      const hasLoop = type !== 0 && loopEnd > loopStart + 2 && loopEnd <= length;
      sampleHeaders.push({
        type,
        name: "",
        index,
        length,
        sampleRate: sr,
        volume: Math.min(volume, 64),
        loopStart: hasLoop ? loopStart : 0,
        loopEnd: hasLoop ? loopEnd : 0,
        hasLoop
      });
      sampleMap.push(index);
      off += AMF_COMPACT;
    } else {
      const AMF_NEW = 65;
      const readLen = truncatedHeaders ? 59 : AMF_NEW;
      if (off + readLen > fileLen) break;
      const type = u8(v, off);
      const name = readString(v, off + 1, 32);
      const index = u32le(v, off + 46);
      const length = u32le(v, off + 50);
      const sr = u16le(v, off + 54);
      const volume = u8(v, off + 56);
      let loopStart, loopEnd, hasLoop;
      if (truncatedHeaders) {
        const ls = off + 57 + 2 <= off + readLen ? u16le(v, off + 57) : 0;
        const le = off + 57 + 4 <= off + readLen ? u16le(v, off + 59) : 0;
        hasLoop = type !== 0 && le > ls + 2 && le <= length;
        loopStart = hasLoop ? ls : 0;
        loopEnd = hasLoop ? le : 0;
        if (truncatedHeaders && ls > 0) loopEnd = length;
        off += readLen;
      } else {
        loopStart = u32le(v, off + 57);
        loopEnd = u32le(v, off + 61);
        hasLoop = type !== 0 && loopEnd > loopStart + 2 && loopEnd <= length;
        off += AMF_NEW;
      }
      sampleHeaders.push({
        type,
        name,
        index,
        length,
        sampleRate: sr,
        volume: Math.min(volume, 64),
        loopStart: hasLoop ? loopStart : 0,
        loopEnd: hasLoop ? loopEnd : 0,
        hasLoop
      });
      sampleMap.push(index);
    }
  }
  if (off + numTracks * 2 > fileLen) throw new Error("AMFParser(DSMI): truncated at track map");
  const trackMap = [];
  for (let t = 0; t < numTracks; t++) {
    trackMap.push(u16le(v, off));
    off += 2;
  }
  let trackCount = 0;
  for (const tm of trackMap) {
    if (tm > trackCount) trackCount = tm;
  }
  const trackData = [];
  for (let i = 0; i < trackCount && off + 3 <= fileLen; i++) {
    if (off + 3 > fileLen) {
      trackData.push(null);
      break;
    }
    const numEvents = u16le(v, off);
    off += 2;
    off++;
    const dataLen = numEvents * 3 + (version === 1 ? 3 : 0);
    if (numEvents === 0) {
      trackData.push(null);
    } else {
      const end = Math.min(off + dataLen, fileLen);
      trackData.push(raw.slice(off, end));
      off += dataLen;
    }
  }
  const sampleDataStart = off;
  const patterns = [];
  for (let pat = 0; pat < numOrders; pat++) {
    const entry = orderEntries[pat];
    if (!entry) continue;
    const patLength = entry.patLength;
    const channelRows = Array.from(
      { length: numChannels },
      () => Array.from({ length: patLength }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }))
    );
    for (let chn = 0; chn < numChannels; chn++) {
      const trkRef = entry.trackRefs[chn] ?? 0;
      if (trkRef === 0 || trkRef > numTracks) continue;
      const realTrack = trackMap[trkRef - 1];
      if (realTrack === 0 || realTrack > trackCount) continue;
      const td = trackData[realTrack - 1];
      if (!td) continue;
      amfReadTrack(td, patLength, channelRows[chn]);
    }
    const channels = Array.from(
      { length: numChannels },
      (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: channelPan[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows: channelRows[ch]
      })
    );
    patterns.push({
      id: `pattern-${pat}`,
      name: `Pattern ${pat}`,
      length: patLength,
      channels,
      importMetadata: {
        sourceFormat: isDMF ? "AMF_DMF" : "AMF_DSMI",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numOrders,
        originalInstrumentCount: numSamples
      }
    });
  }
  const songPositions = Array.from({ length: numOrders }, (_, i) => i);
  const instruments = [];
  let smpReadOff = sampleDataStart;
  for (let fileOrd = 1; fileOrd <= numSamples && smpReadOff < fileLen; fileOrd++) {
    const startPos = smpReadOff;
    for (let target = 0; target < numSamples; target++) {
      if (sampleMap[target] !== fileOrd) continue;
      const sh = sampleHeaders[target];
      if (!sh) continue;
      const id = target + 1;
      const name = sh.name || `Sample ${id}`;
      if (sh.length === 0) {
        instruments.push(blankInstrument(id, name));
        continue;
      }
      const readLen = Math.min(sh.length, fileLen - startPos);
      if (readLen <= 0) {
        instruments.push(blankInstrument(id, name));
        continue;
      }
      smpReadOff = startPos;
      const pcm = raw.slice(startPos, startPos + readLen);
      if (isDMF) {
        const decoded = new Uint8Array(readLen);
        let acc = 0;
        for (let i = 0; i < readLen; i++) {
          acc = acc + pcm[i] & 255;
          decoded[i] = acc ^ 128;
        }
        instruments.push(createSamplerInstrument(
          id,
          name,
          decoded,
          sh.volume,
          sh.sampleRate || 8363,
          sh.loopStart,
          sh.loopEnd
        ));
      } else {
        const signed = new Uint8Array(readLen);
        for (let i = 0; i < readLen; i++) signed[i] = pcm[i] ^ 128;
        instruments.push(createSamplerInstrument(
          id,
          name,
          signed,
          sh.volume,
          sh.sampleRate || 8363,
          sh.loopStart,
          sh.loopEnd
        ));
      }
      smpReadOff = startPos + sh.length;
    }
    let fileLen2 = 0;
    for (let target = 0; target < numSamples; target++) {
      if (sampleMap[target] === fileOrd) {
        fileLen2 = ((_a = sampleHeaders[target]) == null ? void 0 : _a.length) ?? 0;
        break;
      }
    }
    smpReadOff = startPos + fileLen2;
  }
  instruments.sort((a, b) => a.id - b.id);
  return {
    name: songTitle || filename.replace(/\.[^/.]+$/i, ""),
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods: false
  };
}
async function parseAMFFile(buffer, filename) {
  if (!isAMFFormat(buffer)) {
    throw new Error("AMFParser: file does not match ASYLUM or DSMI AMF format");
  }
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const sig = "ASYLUM Music Format V1.0\0";
  let isAsylum = true;
  for (let i = 0; i < 25; i++) {
    if (v.getUint8(i) !== sig.charCodeAt(i)) {
      isAsylum = false;
      break;
    }
  }
  if (isAsylum) {
    return parseAsylumAMF(v, raw, filename);
  } else {
    return parseDSMIAMF(v, raw, filename);
  }
}
export {
  isAMFFormat,
  parseAMFFile
};
