import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeDSMDynCell(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  out[0] = (cell.instrument ?? 0) & 255;
  if (note > 0 && note >= 36) {
    out[1] = Math.min(168, (note - 36) * 2);
  } else {
    out[1] = 0;
  }
  out[2] = (cell.effTyp ?? 0) & 255;
  out[3] = (cell.eff ?? 0) & 255;
  return out;
}
registerPatternEncoder("dsm_dyn", () => encodeDSMDynCell);
function u8(v, off) {
  return v.getUint8(off);
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
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}
function readMagic(v, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(v.getUint8(off + i));
  }
  return s;
}
const ROWS_PER_PATTERN = 64;
const NOTE_MIN = 1;
function mod2xmFineTune(nibble) {
  const n = nibble & 15;
  return (n < 8 ? n : n - 16) * 16;
}
function convertModCommand(command, param) {
  switch (command) {
    case 0:
      return { effTyp: 0, eff: param };
    // Arpeggio (or no effect if param=0)
    case 1:
      return { effTyp: 1, eff: param };
    // Portamento up
    case 2:
      return { effTyp: 2, eff: param };
    // Portamento down
    case 3:
      return { effTyp: 3, eff: param };
    // Tone portamento
    case 4:
      return { effTyp: 4, eff: param };
    // Vibrato
    case 5:
      return { effTyp: 5, eff: param };
    // Tone porta + vol slide
    case 6:
      return { effTyp: 6, eff: param };
    // Vibrato + vol slide
    case 7:
      return { effTyp: 7, eff: param };
    // Tremolo
    case 8:
      return { effTyp: 8, eff: param };
    // Set panning (0-255)
    case 9:
      return { effTyp: 9, eff: param };
    // Sample offset
    case 10:
      return { effTyp: 10, eff: param };
    // Volume slide
    case 11:
      return { effTyp: 11, eff: param };
    // Position jump
    case 12:
      return { effTyp: 12, eff: Math.min(param, 64) };
    // Set volume
    case 13:
      return { effTyp: 13, eff: param };
    // Pattern break
    case 14:
      return { effTyp: 14, eff: param };
    // Extended effect
    case 15:
      return { effTyp: 15, eff: param };
    // Set speed/tempo
    default:
      return { effTyp: 0, eff: 0 };
  }
}
function pcm16ToWAV(samples, rate) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const fileSize = 44 + dataSize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  const ws = (off2, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off2 + i, s.charCodeAt(i));
  };
  ws(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ws(36, "data");
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(off, samples[i], true);
    off += 2;
  }
  return buf;
}
function createSamplerInstrument16(id, name, pcm, volume, sampleRate, loopStart, loopEnd) {
  const hasLoop = loopEnd > loopStart && loopEnd > 2;
  const wavBuf = pcm16ToWAV(pcm, sampleRate);
  const wavBytes = new Uint8Array(wavBuf);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < wavBytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(wavBytes.subarray(i, Math.min(i + CHUNK, wavBytes.length)))
    );
  }
  const dataUrl = `data:audio/wav;base64,${btoa(binary)}`;
  return {
    id,
    name: name.replace(/\0/g, "").trim() || `Sample ${id}`,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: volume > 0 ? 20 * Math.log10(volume / 64) : -60,
    pan: 0,
    sample: {
      audioBuffer: wavBuf,
      url: dataUrl,
      baseNote: "C3",
      detune: 0,
      loop: hasLoop,
      loopType: hasLoop ? "forward" : "off",
      loopStart,
      loopEnd: loopEnd > 0 ? loopEnd : pcm.length,
      sampleRate,
      reverse: false,
      playbackRate: 1
    },
    metadata: {
      modPlayback: {
        usePeriodPlayback: true,
        periodMultiplier: 3546895,
        finetune: 0,
        defaultVolume: volume
      }
    }
  };
}
function buildEmptyInstrument(id, name) {
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
function isDSMFormat(buffer) {
  if (buffer.byteLength < 12) return false;
  const v = new DataView(buffer);
  if (readMagic(v, 0, 4) === "RIFF" && readMagic(v, 8, 4) === "DSMF") return true;
  if (readMagic(v, 0, 4) === "DSMF") return true;
  if (buffer.byteLength >= 5) {
    const magic = readMagic(v, 0, 4);
    if (magic === "DSm" && u8(v, 4) === 32) return true;
  }
  return false;
}
function readDSMSongHeader(v, off, chunkSize) {
  const end = off + chunkSize;
  const songName = readString(v, off, 28);
  const fileVersion = chunkSize > 29 ? u16le(v, off + 28) : 0;
  const flags = chunkSize > 31 ? u16le(v, off + 30) : 0;
  const restartPos = chunkSize > 35 ? u16le(v, off + 34) : 0;
  const numOrders = chunkSize > 37 ? u16le(v, off + 36) : 0;
  const numSamples = chunkSize > 39 ? u16le(v, off + 38) : 0;
  const numPatterns = chunkSize > 41 ? u16le(v, off + 40) : 0;
  const numChannels = chunkSize > 43 ? u16le(v, off + 42) : 1;
  const globalVol = chunkSize > 44 ? u8(v, off + 44) : 64;
  const masterVol = chunkSize > 45 ? u8(v, off + 45) : 128;
  const speed = chunkSize > 46 ? u8(v, off + 46) : 6;
  const bpm = chunkSize > 47 ? u8(v, off + 47) : 125;
  const panPos = [];
  for (let i = 0; i < 16; i++) {
    const panOff = off + 48 + i;
    panPos.push(panOff < end ? u8(v, panOff) : 64);
  }
  const orders = [];
  for (let i = 0; i < 128; i++) {
    const ordOff = off + 64 + i;
    orders.push(ordOff < end ? u8(v, ordOff) : 255);
  }
  return {
    songName,
    fileVersion,
    flags,
    restartPos,
    numOrders,
    numSamples,
    numPatterns,
    numChannels,
    globalVol,
    masterVol,
    speed,
    bpm,
    panPos,
    orders
  };
}
const DSM_SAMPLE_HEADER_SIZE = 64;
function readDSMSampleHeader(v, off) {
  return {
    filename: readString(v, off, 13),
    flags: u16le(v, off + 13),
    volume: u8(v, off + 15),
    length: u32le(v, off + 16),
    loopStart: u32le(v, off + 20),
    loopEnd: u32le(v, off + 24),
    // dataPtr at +28 — ignored
    sampleRate: u32le(v, off + 32),
    sampleName: readString(v, off + 36, 28)
  };
}
function parseRiffDSMF(v, bytes, filename) {
  const fileLen = v.byteLength;
  let chunkCursor = 12;
  if (chunkCursor + 8 > fileLen) {
    throw new Error("DSMParser(RIFF): file too small for SONG chunk header");
  }
  const songChunkMagic = readMagic(v, chunkCursor, 4);
  if (songChunkMagic !== "SONG") {
    throw new Error(`DSMParser(RIFF): expected SONG chunk, found "${songChunkMagic}"`);
  }
  const songChunkSize = u32le(v, chunkCursor + 4);
  chunkCursor += 8;
  const songHeader = readDSMSongHeader(v, chunkCursor, songChunkSize);
  chunkCursor += songChunkSize;
  if (songHeader.numOrders > 128 || songHeader.numChannels > 16 || songHeader.numPatterns > 256 || songHeader.restartPos > 128) {
    throw new Error("DSMParser(RIFF): invalid song header values");
  }
  const numChannels = Math.max(songHeader.numChannels, 1);
  const orderList = [];
  for (let i = 0; i < songHeader.numOrders; i++) {
    const ord = songHeader.orders[i];
    if (ord === 255) break;
    if (ord !== 254) orderList.push(ord);
  }
  const channelPan = [];
  for (let i = 0; i < numChannels; i++) {
    const raw = songHeader.panPos[i];
    channelPan.push(raw <= 128 ? raw * 2 : 128);
  }
  const patterns = [];
  const instruments = [];
  while (chunkCursor + 8 <= fileLen) {
    const chunkMagic = readMagic(v, chunkCursor, 4);
    const chunkSize = u32le(v, chunkCursor + 4);
    const dataStart = chunkCursor + 8;
    chunkCursor += 8 + chunkSize;
    if (dataStart + chunkSize > fileLen) break;
    if (chunkMagic === "PATT") {
      const patIdx = patterns.length;
      const channels = Array.from(
        { length: numChannels },
        (_, ch) => ({
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: (channelPan[ch] ?? 128) - 128,
          // convert 0-256 → -128..128
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
        })
      );
      let cur = dataStart + 2;
      let row = 0;
      while (cur < dataStart + chunkSize && row < ROWS_PER_PATTERN) {
        const flag = u8(v, cur++);
        if (flag === 0) {
          row++;
          continue;
        }
        const chn = flag & 15;
        const cell = chn < numChannels ? channels[chn].rows[row] : { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 };
        if (flag & 128) {
          const noteRaw = u8(v, cur++);
          if (noteRaw > 0 && noteRaw <= 12 * 9) {
            cell.note = noteRaw + 11 + NOTE_MIN;
          } else if (noteRaw > 0) {
            cell.note = noteRaw;
          }
        }
        if (flag & 64) {
          cell.instrument = u8(v, cur++);
        }
        if (flag & 32) {
          cell.volume = Math.min(u8(v, cur++), 64);
        }
        if (flag & 16) {
          const command = u8(v, cur++);
          const param = u8(v, cur++);
          const { effTyp, eff } = convertModCommand(command, param);
          cell.effTyp = effTyp;
          cell.eff = eff;
        }
      }
      patterns.push({
        id: `pattern-${patIdx}`,
        name: `Pattern ${patIdx}`,
        length: ROWS_PER_PATTERN,
        channels,
        importMetadata: {
          sourceFormat: "DSM",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: numChannels,
          originalPatternCount: songHeader.numPatterns,
          originalInstrumentCount: songHeader.numSamples
        }
      });
    } else if (chunkMagic === "INST") {
      const smpIdx = instruments.length + 1;
      if (dataStart + DSM_SAMPLE_HEADER_SIZE > fileLen) {
        instruments.push(buildEmptyInstrument(smpIdx, `Sample ${smpIdx}`));
        continue;
      }
      const hdr = readDSMSampleHeader(v, dataStart);
      const pcmStart = dataStart + DSM_SAMPLE_HEADER_SIZE;
      const pcmLen = Math.min(hdr.length, dataStart + chunkSize - pcmStart);
      const volume = Math.min(hdr.volume, 64);
      const smpName = hdr.sampleName || hdr.filename || `Sample ${smpIdx}`;
      const loopActive = (hdr.flags & 1) !== 0;
      const is16Bit = (hdr.flags & 4) !== 0;
      const isDelta = (hdr.flags & 64) !== 0;
      const isSigned = (hdr.flags & 2) !== 0;
      const loopStart = loopActive ? hdr.loopStart : 0;
      const loopEnd = loopActive ? hdr.loopEnd : 0;
      const sampleRate = hdr.sampleRate || 8363;
      if (pcmLen <= 0 || pcmStart + pcmLen > fileLen) {
        instruments.push(buildEmptyInstrument(smpIdx, smpName));
        continue;
      }
      if (is16Bit) {
        const numFrames = Math.floor(pcmLen / 2);
        const pcm16 = new Int16Array(numFrames);
        for (let i = 0; i < numFrames; i++) {
          pcm16[i] = v.getInt16(pcmStart + i * 2, true);
        }
        instruments.push(
          createSamplerInstrument16(smpIdx, smpName, pcm16, volume, sampleRate, loopStart, loopEnd)
        );
      } else {
        let raw = bytes.slice(pcmStart, pcmStart + pcmLen);
        if (isDelta) {
          const out = new Uint8Array(pcmLen);
          let acc = 0;
          for (let i = 0; i < pcmLen; i++) {
            acc = acc + raw[i] & 255;
            out[i] = acc;
          }
          raw = out;
          const signed8 = new Uint8Array(pcmLen);
          for (let i = 0; i < pcmLen; i++) signed8[i] = raw[i] ^ 128;
          raw = signed8;
          instruments.push(
            createSamplerInstrument(smpIdx, smpName, raw, volume, sampleRate, loopStart, loopEnd)
          );
        } else if (isSigned) {
          instruments.push(
            createSamplerInstrument(smpIdx, smpName, raw, volume, sampleRate, loopStart, loopEnd)
          );
        } else {
          const signed8 = new Uint8Array(pcmLen);
          for (let i = 0; i < pcmLen; i++) signed8[i] = raw[i] ^ 128;
          instruments.push(
            createSamplerInstrument(smpIdx, smpName, signed8, volume, sampleRate, loopStart, loopEnd)
          );
        }
      }
    }
  }
  while (instruments.length < songHeader.numSamples) {
    const id = instruments.length + 1;
    instruments.push(buildEmptyInstrument(id, `Sample ${id}`));
  }
  const restartPos = Math.min(songHeader.restartPos, Math.max(0, orderList.length - 1));
  return {
    name: songHeader.songName || filename.replace(/\.[^/.]+$/, ""),
    format: "MOD",
    patterns,
    instruments,
    songPositions: orderList,
    songLength: orderList.length,
    restartPosition: restartPos,
    numChannels,
    initialSpeed: songHeader.speed || 6,
    initialBPM: songHeader.bpm || 125,
    linearPeriods: false
  };
}
const DSm_FILE_HEADER_SIZE = 64;
function readDSmFileHeader(v) {
  return {
    title: readString(v, 5, 20),
    artist: readString(v, 25, 20),
    numChannels: u8(v, 45),
    numSamples: u8(v, 46),
    numOrders: u8(v, 47),
    packInformation: u8(v, 48),
    globalVol: u8(v, 49)
  };
}
const DSm_SAMPLE_HEADER_SIZE = 32;
function readDSmSampleHeader(v, off) {
  return {
    name: readString(v, off, 22),
    type: u8(v, off + 22),
    length: u16le(v, off + 23),
    finetune: u8(v, off + 25),
    volume: u8(v, off + 26),
    loopStart: u16le(v, off + 27),
    loopLength: u16le(v, off + 29)
  };
}
function parseDynamicStudioDSm(v, bytes, filename) {
  var _a, _b;
  const fileLen = v.byteLength;
  const hdr = readDSmFileHeader(v);
  const {
    numChannels: rawNumChannels,
    numSamples,
    numOrders,
    globalVol
  } = hdr;
  if (rawNumChannels < 1 || rawNumChannels > 16 || numSamples === 0 || numOrders === 0) {
    throw new Error("DSMParser(DSm): invalid file header values");
  }
  const numChannels = rawNumChannels;
  let cur = DSm_FILE_HEADER_SIZE;
  const channelPan = [];
  for (let i = 0; i < numChannels; i++) {
    if (cur >= fileLen) channelPan.push(128);
    else channelPan.push((u8(v, cur++) & 15) * 17);
  }
  const orderList = [];
  for (let i = 0; i < numOrders; i++) {
    if (cur >= fileLen) break;
    orderList.push(u8(v, cur++));
  }
  let maxPatIdx = 0;
  for (const p of orderList) {
    if (p > maxPatIdx) maxPatIdx = p;
  }
  const numPatterns = maxPatIdx + 1;
  const channelNames = [];
  const trackNamesTotal = numPatterns * numChannels * 8;
  if (cur + trackNamesTotal > fileLen) {
    throw new Error("DSMParser(DSm): file truncated at track names");
  }
  for (let ch = 0; ch < numChannels; ch++) {
    channelNames.push(readString(v, cur + ch * 8, 8) || `Channel ${ch + 1}`);
  }
  cur += trackNamesTotal;
  if (cur + numSamples * DSm_SAMPLE_HEADER_SIZE > fileLen) {
    throw new Error("DSMParser(DSm): file truncated at sample headers");
  }
  const sampleHeaders = [];
  for (let i = 0; i < numSamples; i++) {
    sampleHeaders.push(readDSmSampleHeader(v, cur));
    cur += DSm_SAMPLE_HEADER_SIZE;
  }
  const patternDataOffset = cur;
  const patternDataSize = numPatterns * numChannels * ROWS_PER_PATTERN * 4;
  if (cur + patternDataSize > fileLen) {
    throw new Error("DSMParser(DSm): file truncated at pattern data");
  }
  const patterns = [];
  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const channels = Array.from(
      { length: numChannels },
      (_, ch) => ({
        id: `channel-${ch}`,
        name: channelNames[ch] ?? `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (channelPan[ch] ?? 128) - 128,
        // 0-255 → -128..127
        instrumentId: null,
        color: null,
        rows: []
      })
    );
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cellOff = cur + (patIdx * numChannels * ROWS_PER_PATTERN + row * numChannels + ch) * 4;
        const d0 = u8(v, cellOff);
        const d1 = u8(v, cellOff + 1);
        const d2 = u8(v, cellOff + 2);
        const d3 = u8(v, cellOff + 3);
        const note = d1 > 0 && d1 <= 84 * 2 ? (d1 >> 1) + NOTE_MIN + 35 : 0;
        let effTyp = 0;
        let eff = d3;
        let volCmd = 0;
        let vol = 0;
        if (d2 === 8) {
          switch (d3 & 240) {
            case 0:
              effTyp = 14;
              eff = d3 | 128;
              break;
            case 16:
              effTyp = 10;
              eff = (d3 & 15) << 4;
              break;
            case 32:
              effTyp = 14;
              eff = d3 | 160;
              break;
            case 48:
            // CMD_MODCMDEX fine porta up
            case 64:
              effTyp = 14;
              eff = d3 - 32;
              break;
            default:
              effTyp = 0;
              eff = 0;
              break;
          }
        } else if (d2 === 19) {
          effTyp = 8;
          let param = (d3 & 127) * 2;
          if (d3 <= 64) param += 128;
          else if (d3 < 128) param = 384 - param;
          else if (d3 < 192) param = 128 - param;
          else param -= 128;
          eff = Math.min(255, Math.max(0, param));
        } else if ((d2 & 240) === 32) {
          effTyp = 9;
          eff = d3;
          volCmd = 1;
          vol = (d2 & 15) * 4 + 4;
        } else if (d2 <= 15 || d2 === 17 || d2 === 18) {
          const mappedCmd = d2 === 17 || d2 === 18 ? d2 - 16 : d2;
          const result = convertModCommand(mappedCmd, d3);
          effTyp = result.effTyp;
          eff = result.eff;
        }
        const cell = {
          note,
          instrument: d0,
          volume: volCmd !== 0 ? vol : 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0
        };
        channels[ch].rows.push(cell);
      }
    }
    patterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "DSM",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numSamples
      }
    });
  }
  cur += patternDataSize;
  const instruments = [];
  for (let i = 0; i < numSamples; i++) {
    const sh = sampleHeaders[i];
    const smpIdx = i + 1;
    const smpName = sh.name || `Sample ${smpIdx}`;
    const volume = Math.min(sh.volume, 64);
    const is16Bit = sh.type === 16;
    const byteLen = sh.length * 2;
    const loopActive = sh.loopLength > 2;
    const loopStart = loopActive ? sh.loopStart : 0;
    const loopEnd = loopActive ? sh.loopStart + sh.loopLength : 0;
    const sampleRate = 8363;
    const finetune = mod2xmFineTune(sh.finetune);
    if (byteLen <= 0 || cur + byteLen > fileLen) {
      instruments.push(buildEmptyInstrument(smpIdx, smpName));
      cur += Math.max(0, Math.min(byteLen, fileLen - cur));
      continue;
    }
    if (is16Bit) {
      const numFrames = byteLen / 2;
      const pcm16 = new Int16Array(numFrames);
      for (let j = 0; j < numFrames; j++) {
        pcm16[j] = v.getInt16(cur + j * 2, true);
      }
      const inst = createSamplerInstrument16(smpIdx, smpName, pcm16, volume, sampleRate, loopStart, loopEnd);
      if ((_a = inst.metadata) == null ? void 0 : _a.modPlayback) {
        inst.metadata.modPlayback.finetune = finetune;
      }
      instruments.push(inst);
    } else {
      const raw = bytes.slice(cur, cur + byteLen);
      const inst = createSamplerInstrument(smpIdx, smpName, raw, volume, sampleRate, loopStart, loopEnd);
      if ((_b = inst.metadata) == null ? void 0 : _b.modPlayback) {
        inst.metadata.modPlayback.finetune = finetune;
      }
      instruments.push(inst);
    }
    cur += byteLen;
  }
  const globalVolScaled = Math.round(globalVol * 256 / 100);
  const uadePatternLayout = {
    formatId: "dsm_dyn",
    patternDataFileOffset: patternDataOffset,
    bytesPerCell: 4,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels,
    numPatterns,
    moduleSize: v.byteLength,
    encodeCell: encodeDSMDynCell,
    getCellFileOffset: (pattern, row, channel) => {
      return patternDataOffset + (pattern * numChannels * ROWS_PER_PATTERN + row * numChannels + channel) * 4;
    }
  };
  return {
    name: hdr.title || filename.replace(/\.[^/.]+$/, ""),
    format: "MOD",
    patterns,
    instruments,
    songPositions: orderList,
    songLength: orderList.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    // Store global volume in compatFlags for replayer awareness
    compatFlags: {
      globalVolume: globalVolScaled
    },
    uadePatternLayout
  };
}
async function parseDSMFile(buffer, filename) {
  if (!isDSMFormat(buffer)) {
    throw new Error("DSMParser: file does not match DSIK RIFF DSMF or Dynamic Studio DSm format");
  }
  const v = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const magic0 = readMagic(v, 0, 4);
  if (magic0 === "RIFF" || magic0 === "DSMF") {
    return parseRiffDSMF(v, bytes, filename);
  }
  return parseDynamicStudioDSm(v, bytes, filename);
}
export {
  isDSMFormat,
  parseDSMFile
};
