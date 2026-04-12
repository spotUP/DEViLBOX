import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const NOTE_KEYOFF$1 = 97;
function reverseIMFEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };
  switch (effTyp) {
    case 15:
      if (eff < 32) return { cmd: 1, param: eff };
      return { cmd: 2, param: eff };
    // Set BPM (Bxx)
    case 3:
      return { cmd: 3, param: eff };
    // Tone porta (Cxx)
    case 5:
      return { cmd: 4, param: eff };
    // Tone porta + vol slide (Dxy)
    case 4:
      return { cmd: 5, param: eff };
    // Vibrato (Exy)
    case 6:
      return { cmd: 6, param: eff };
    // Vibrato + vol slide (Fxy)
    case 7:
      return { cmd: 8, param: eff };
    // Tremolo (Hxy)
    case 8:
      return { cmd: 10, param: eff };
    // Set pan (Jxx)
    case 25:
      return { cmd: 11, param: eff };
    // Pan slide (Kxy)
    case 12:
      return { cmd: 12, param: eff };
    // Set volume (Lxx)
    case 10:
      return { cmd: 13, param: eff };
    // Volume slide (Mxy)
    case 1:
      return { cmd: 18, param: eff };
    // Porta up (Rxx)
    case 2:
      return { cmd: 19, param: eff };
    // Porta down (Sxx)
    case 9:
      return { cmd: 24, param: eff };
    // Sample offset (Xxx)
    case 20:
      return { cmd: 26, param: eff };
    // Key off (Zxx)
    case 27:
      return { cmd: 27, param: eff };
    // Retrig (Rxy)
    case 11:
      return { cmd: 29, param: eff };
    // Position jump (Txx)
    case 13:
      return { cmd: 30, param: eff };
    // Pattern break (Uxx)
    case 16:
      return { cmd: 31, param: Math.min(127, eff >> 1) };
    // Master vol
    case 17:
      return { cmd: 32, param: eff };
    // Master vol slide (Wxy)
    case 14:
      return { cmd: 33, param: eff };
    // Extended (Xxx)
    default:
      return { cmd: 0, param: 0 };
  }
}
function encodeIMFNote(xmNote) {
  if (xmNote === 0) return 255;
  if (xmNote === NOTE_KEYOFF$1) return 160;
  const raw = xmNote - 13;
  if (raw < 0 || raw >= 96) return 255;
  const octave = Math.floor(raw / 12);
  const semi = raw % 12;
  return octave << 4 | semi;
}
function encodeIMFPatternChannel(rows, channel) {
  const parts = [];
  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];
    const hasNote = (cell.note ?? 0) !== 0 || (cell.instrument ?? 0) !== 0;
    const e1 = reverseIMFEffect(cell.effTyp ?? 0, cell.eff ?? 0);
    const e2 = reverseIMFEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
    const hasEff1 = e1.cmd !== 0 || e1.param !== 0;
    const hasEff2 = e2.cmd !== 0 || e2.param !== 0;
    const hasVol = (cell.volume ?? 0) > 0 && !hasEff1;
    if (!hasNote && !hasEff1 && !hasEff2 && !hasVol) {
      parts.push(0);
      continue;
    }
    let mask = channel & 31;
    if (hasNote) mask |= 32;
    if (hasEff1 && hasEff2) {
      mask |= 192;
    } else if (hasEff1 || hasVol) {
      mask |= 64;
    } else if (hasEff2) {
      mask |= 128;
    }
    parts.push(mask);
    if (hasNote) {
      parts.push(encodeIMFNote(cell.note ?? 0));
      parts.push(cell.instrument ?? 0);
    }
    if ((mask & 192) === 192) {
      if (hasVol) {
        parts.push(12);
        parts.push(cell.volume ?? 0);
      } else {
        parts.push(e1.cmd);
        parts.push(e1.param);
      }
      parts.push(e2.cmd);
      parts.push(e2.param);
    } else if (mask & 192) {
      if (hasVol) {
        parts.push(12);
        parts.push(cell.volume ?? 0);
      } else if (hasEff1) {
        parts.push(e1.cmd);
        parts.push(e1.param);
      } else {
        parts.push(e2.cmd);
        parts.push(e2.param);
      }
    }
  }
  return new Uint8Array(parts);
}
const imagoOrpheusEncoder = {
  formatId: "imf",
  encodePattern(rows, channel) {
    return encodeIMFPatternChannel(rows, channel);
  }
};
registerVariableEncoder(imagoOrpheusEncoder);
function u8(bytes, off) {
  return bytes[off] ?? 0;
}
function u16le(bytes, off) {
  return ((bytes[off] ?? 0) | (bytes[off + 1] ?? 0) << 8) >>> 0;
}
function u32le(bytes, off) {
  return ((bytes[off] ?? 0) | (bytes[off + 1] ?? 0) << 8 | (bytes[off + 2] ?? 0) << 16 | (bytes[off + 3] ?? 0) << 24) >>> 0;
}
function readString(bytes, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = bytes[off + i] ?? 0;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
const IMF_HDR_SIZE = 576;
const IMF_CHANNEL_SIZE = 16;
const IMF_INSTRUMENT_SIZE = 384;
const IMF_SAMPLE_SIZE = 64;
const MAX_CHANNELS = 32;
const NOTE_KEYOFF = 97;
const OFF_TITLE = 0;
const OFF_ORD_NUM = 32;
const OFF_PAT_NUM = 34;
const OFF_INS_NUM = 36;
const OFF_FLAGS = 38;
const OFF_TEMPO = 48;
const OFF_BPM = 49;
const OFF_MASTER = 50;
const OFF_AMP = 51;
const OFF_IM10 = 60;
const OFF_CHANNELS = 64;
const CHOFF_PAN = 12;
const CHOFF_STATUS = 13;
const FLAG_LINEAR_SLIDES = 1;
function isImagoOrpheusFormat(bytes) {
  if (bytes.length < IMF_HDR_SIZE + 256) return false;
  if (bytes[OFF_IM10] !== 73 || bytes[OFF_IM10 + 1] !== 77 || bytes[OFF_IM10 + 2] !== 49 || bytes[OFF_IM10 + 3] !== 48)
    return false;
  const ordNum = u16le(bytes, OFF_ORD_NUM);
  const insNum = u16le(bytes, OFF_INS_NUM);
  const bpm = u8(bytes, OFF_BPM);
  const master = u8(bytes, OFF_MASTER);
  const amp = u8(bytes, OFF_AMP);
  if (ordNum > 256) return false;
  if (insNum >= 256) return false;
  if (bpm < 32) return false;
  if (master > 64) return false;
  if (amp < 4 || amp > 127) return false;
  let detectedChannels = 0;
  for (let chn = 0; chn < MAX_CHANNELS; chn++) {
    const base = OFF_CHANNELS + chn * IMF_CHANNEL_SIZE;
    const status = u8(bytes, base + CHOFF_STATUS);
    if (status < 2) detectedChannels = chn + 1;
    else if (status > 2) return false;
  }
  if (detectedChannels === 0) return false;
  return true;
}
const IMF_EFFECTS = [
  0,
  // 0x00 none
  15,
  // 0x01 Axx set speed
  15,
  // 0x02 Bxx set tempo — will be promoted to CMD_TEMPO by speed>=0x20 logic
  3,
  // 0x03 Cxx tone porta
  5,
  // 0x04 Dxy tone porta + vol slide
  4,
  // 0x05 Exy vibrato
  6,
  // 0x06 Fxy vibrato + vol slide
  4,
  // 0x07 Gxy fine vibrato — reuse vibrato (no dedicated XM slot)
  7,
  // 0x08 Hxy tremolo
  0,
  // 0x09 Ixy arpeggio — map to none (arpeggio = 0x00 in XM)
  8,
  // 0x0A Axx set pan
  25,
  // 0x0B Bxy pan slide (XM Pxy = 0x19)
  12,
  // 0x0C Cxx set volume
  10,
  // 0x0D Dxy volume slide
  10,
  // 0x0E Exy fine volume slide (adjusted below)
  36,
  // 0x0F Fxx set finetune — map to XM finetune extension
  0,
  // 0x10 Gxy note slide up  (no XM equiv)
  0,
  // 0x11 Hxy note slide down (no XM equiv)
  1,
  // 0x12 Ixx porta up
  2,
  // 0x13 Jxx porta down
  1,
  // 0x14 Kxx fine porta up (adjusted)
  2,
  // 0x15 Lxx fine porta down (adjusted)
  0,
  // 0x16 Mxx filter cutoff → ignored
  0,
  // 0x17 Nxy filter slide   → ignored
  9,
  // 0x18 Oxx sample offset
  0,
  // 0x19 Pxx fine sample offset → unsupported
  20,
  // 0x1A Qxx key off (XM = 0x14)
  27,
  // 0x1B Rxy retrig (not standard XM but we pass through)
  29,
  // 0x1C Sxy tremor — no XM equiv, map none
  11,
  // 0x1D Txx position jump
  13,
  // 0x1E Uxx pattern break
  16,
  // 0x1F Vxx set master vol (XM global vol = 0x10)
  17,
  // 0x20 Wxy master vol slide (XM = 0x11)
  14,
  // 0x21 Xxx extended (S3MCMDEX → XM Exy)
  0,
  // 0x22 Yxx chorus → ignored
  0
  // 0x23 Zxx reverb → ignored
];
function translateIMFEffect(cmd, param) {
  switch (cmd) {
    case 1:
      break;
    case 2:
      return { effTyp: 15, eff: param };
    case 14:
      if (param === 0) ;
      else if (param === 240) {
        param = 239;
      } else if (param === 15) {
        param = 254;
      } else if (param & 240) {
        param = param & 240 | 15;
      } else {
        param = param & 15 | 240;
      }
      return { effTyp: 10, eff: param };
    case 15:
      param ^= 128;
      return { effTyp: 0, eff: 0 };
    // no direct XM mapping; suppress
    case 20:
    // fine porta up
    case 21:
      if (param >> 4) {
        param = 240 | param >> 4;
      } else {
        param = 224 | param & 15;
      }
      return { effTyp: cmd === 20 ? 1 : 2, eff: param };
    case 31:
      param = Math.min(255, param * 2);
      return { effTyp: 16, eff: param };
    case 33: {
      let n = 0;
      switch (param >> 4) {
        case 0:
          break;
        case 1:
        /* set filter */
        case 15:
          return { effTyp: 0, eff: 0 };
        case 3:
          n = 32;
          break;
        // glissando
        case 5:
          n = 48;
          break;
        // vibrato waveform
        case 8:
          n = 64;
          break;
        // tremolo waveform
        case 10:
          n = 176;
          break;
        // pattern loop
        case 11:
          n = 224;
          break;
        // pattern delay
        case 12:
        // note cut
        case 13:
          if (!param) return { effTyp: 0, eff: 0 };
          break;
        case 14:
          switch (param & 15) {
            case 0:
              param = 119;
              break;
            case 1:
              param = 119;
              break;
            case 2:
              param = 121;
              break;
            case 3:
              param = 123;
              break;
            default:
              return { effTyp: 0, eff: 0 };
          }
          return { effTyp: 14, eff: param };
        default:
          return { effTyp: 0, eff: 0 };
      }
      if (n) param = n | param & 15;
      return { effTyp: 14, eff: param };
    }
  }
  const effTyp = cmd < IMF_EFFECTS.length ? IMF_EFFECTS[cmd] : 0;
  return { effTyp, eff: param };
}
function parseImagoOrpheusFile(bytes, filename) {
  try {
    return parseInternal(bytes, filename);
  } catch {
    return null;
  }
}
function parseInternal(bytes, filename) {
  if (!isImagoOrpheusFormat(bytes)) return null;
  const ordNum = u16le(bytes, OFF_ORD_NUM);
  const patNum = u16le(bytes, OFF_PAT_NUM);
  const insNum = u16le(bytes, OFF_INS_NUM);
  const flags = u16le(bytes, OFF_FLAGS);
  const tempo = u8(bytes, OFF_TEMPO);
  const bpm = u8(bytes, OFF_BPM);
  const title = readString(bytes, OFF_TITLE, 32) || filename.replace(/\.[^/.]+$/, "");
  const linearSlides = !!(flags & FLAG_LINEAR_SLIDES);
  const numChannels = (() => {
    let n = 0;
    for (let chn = 0; chn < MAX_CHANNELS; chn++) {
      const base = OFF_CHANNELS + chn * IMF_CHANNEL_SIZE;
      const status = u8(bytes, base + CHOFF_STATUS);
      if (status < 2) n = chn + 1;
    }
    return n;
  })();
  if (numChannels === 0) return null;
  const channelPan = [];
  const channelMute = [];
  for (let chn = 0; chn < numChannels; chn++) {
    const base = OFF_CHANNELS + chn * IMF_CHANNEL_SIZE;
    const pan = u8(bytes, base + CHOFF_PAN);
    const status = u8(bytes, base + CHOFF_STATUS);
    channelPan.push(Math.round(pan / 255 * 256) - 128);
    channelMute.push(status === 1 || status === 2);
  }
  let cursor = IMF_HDR_SIZE;
  const orderList = [];
  for (let i = 0; i < 256; i++) {
    const ord = u8(bytes, cursor + i);
    if (ord === 255) break;
    if (i < ordNum) orderList.push(ord);
  }
  if (orderList.length === 0) orderList.push(0);
  cursor += 256;
  const patterns = [];
  const patternFileAddrs = [];
  const patternFileSizes = [];
  const patternRowCounts = [];
  for (let pat = 0; pat < patNum; pat++) {
    if (cursor + 4 > bytes.length) {
      patterns.push(makeEmptyPattern(pat, numChannels, channelPan, filename));
      patternFileAddrs.push(0);
      patternFileSizes.push(0);
      patternRowCounts.push(64);
      continue;
    }
    const chunkLen = u16le(bytes, cursor);
    const numRows = u16le(bytes, cursor + 2);
    cursor += 4;
    const dataEnd = cursor + chunkLen - 4;
    patternFileAddrs.push(cursor);
    patternFileSizes.push(chunkLen - 4);
    patternRowCounts.push(numRows);
    const channelRows = Array.from(
      { length: numChannels },
      () => Array.from({ length: numRows }, () => emptyCell())
    );
    let row = 0;
    let pos = cursor;
    while (row < numRows && pos < dataEnd) {
      const mask = u8(bytes, pos++);
      if (mask === 0) {
        row++;
        continue;
      }
      const channel = mask & 31;
      const validCh = channel < numChannels;
      const cell = validCh ? channelRows[channel][row] : emptyCell();
      if (mask & 32) {
        if (pos + 2 > dataEnd) break;
        const note = u8(bytes, pos++);
        const instr = u8(bytes, pos++);
        if (note === 160) {
          cell.note = NOTE_KEYOFF;
        } else if (note !== 255) {
          const xmNote = (note >> 4) * 12 + (note & 15) + 12 + 1;
          cell.note = xmNote >= 1 && xmNote <= 96 ? xmNote : 0;
        }
        cell.instrument = instr;
      }
      const effBits = mask & 192;
      if (effBits === 192) {
        if (pos + 4 > dataEnd) break;
        const e1c = u8(bytes, pos++);
        const e1d = u8(bytes, pos++);
        const e2c = u8(bytes, pos++);
        const e2d = u8(bytes, pos++);
        const { effTyp: t1, eff: p1 } = translateIMFEffect(e1c, e1d);
        const { effTyp: t2, eff: p2 } = translateIMFEffect(e2c, e2d);
        if (t1 !== 0) {
          cell.effTyp = t1;
          cell.eff = p1;
          cell.effTyp2 = t2;
          cell.eff2 = p2;
        } else {
          cell.effTyp = t2;
          cell.eff = p2;
        }
      } else if (effBits) {
        if (pos + 2 > dataEnd) break;
        const e1c = u8(bytes, pos++);
        const e1d = u8(bytes, pos++);
        const { effTyp, eff } = translateIMFEffect(e1c, e1d);
        if (effTyp === 12) {
          cell.volume = eff;
        } else {
          cell.effTyp = effTyp;
          cell.eff = eff;
        }
      }
    }
    cursor = dataEnd;
    const channels = channelRows.map((rows, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: channelMute[ch] ?? false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: channelPan[ch] ?? 0,
      instrumentId: null,
      color: null,
      rows
    }));
    patterns.push({
      id: `pattern-${pat}`,
      name: `Pattern ${pat}`,
      length: numRows,
      channels,
      importMetadata: {
        sourceFormat: "IMF",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: patNum,
        originalInstrumentCount: insNum
      }
    });
  }
  const instruments = [];
  let firstSampleId = 1;
  for (let ins = 0; ins < insNum; ins++) {
    if (cursor + IMF_INSTRUMENT_SIZE > bytes.length) {
      instruments.push(silentInstrument(ins + 1, `Instrument ${ins + 1}`));
      continue;
    }
    const insBase = cursor;
    const insName = readString(bytes, insBase, 32) || `Instrument ${ins + 1}`;
    const smpNum = u16le(bytes, insBase + 378);
    cursor += IMF_INSTRUMENT_SIZE;
    const sampleInstruments = [];
    for (let smp = 0; smp < smpNum; smp++) {
      if (cursor + IMF_SAMPLE_SIZE > bytes.length) break;
      const smpBase = cursor;
      const smpName = readString(bytes, smpBase, 13) || `${insName} ${smp + 1}`;
      let length = u32le(bytes, smpBase + 16);
      let loopStart = u32le(bytes, smpBase + 20);
      let loopEnd = u32le(bytes, smpBase + 24);
      const c5Speed = u32le(bytes, smpBase + 28);
      const volume = u8(bytes, smpBase + 32);
      const smpFlags = u8(bytes, smpBase + 48);
      cursor += IMF_SAMPLE_SIZE;
      const hasLoop = !!(smpFlags & 1);
      const pingPong = !!(smpFlags & 2);
      const is16bit = !!(smpFlags & 4);
      if (is16bit) {
        length = Math.floor(length / 2);
        loopStart = Math.floor(loopStart / 2);
        loopEnd = Math.floor(loopEnd / 2);
      }
      const sampleRate = c5Speed > 0 ? c5Speed : 8363;
      const smpId = firstSampleId + smp;
      if (length === 0 || cursor + (is16bit ? length * 2 : length) > bytes.length) {
        cursor += is16bit ? length * 2 : length;
        sampleInstruments.push(silentInstrument(smpId, smpName));
        continue;
      }
      const byteLen = is16bit ? length * 2 : length;
      const rawPcm = bytes.subarray(cursor, cursor + byteLen);
      cursor += byteLen;
      let pcm8;
      if (is16bit) {
        pcm8 = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
          const lo = rawPcm[i * 2] ?? 0;
          const hi = rawPcm[i * 2 + 1] ?? 0;
          const s16 = (lo | hi << 8) << 16 >> 16;
          const s8 = Math.max(-128, Math.min(127, s16 >> 8));
          pcm8[i] = s8 + 256 & 255;
        }
      } else {
        pcm8 = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
          const s = rawPcm[i] ?? 0;
          pcm8[i] = (s < 128 ? s : s - 256) + 128 & 255;
        }
      }
      const loopS = hasLoop ? loopStart : 0;
      const loopE = hasLoop ? loopEnd : 0;
      const inst = createSamplerInstrument(smpId, smpName, pcm8, volume, sampleRate, loopS, loopE);
      if (pingPong && inst.sample) {
        inst.sample.loopType = "pingpong";
      }
      sampleInstruments.push(inst);
    }
    if (sampleInstruments.length > 0) {
      const primary = { ...sampleInstruments[0], id: ins + 1, name: insName };
      instruments.push(primary);
    } else {
      instruments.push(silentInstrument(ins + 1, insName));
    }
    firstSampleId += smpNum;
  }
  return {
    name: title,
    format: "XM",
    patterns,
    instruments,
    songPositions: orderList,
    songLength: orderList.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: tempo > 0 ? tempo : 6,
    initialBPM: bpm >= 32 ? bpm : 125,
    linearPeriods: linearSlides,
    uadeVariableLayout: {
      formatId: "imf",
      numChannels,
      numFilePatterns: patNum,
      rowsPerPattern: patternRowCounts,
      moduleSize: bytes.length,
      encoder: imagoOrpheusEncoder,
      filePatternAddrs: patternFileAddrs,
      filePatternSizes: patternFileSizes,
      trackMap: Array.from(
        { length: patNum },
        (_, p) => Array.from({ length: numChannels }, (__, _ch) => p)
      )
    }
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeEmptyPattern(idx, numChannels, channelPan, filename) {
  const channels = Array.from({ length: numChannels }, (_, ch) => ({
    id: `channel-${ch}`,
    name: `Channel ${ch + 1}`,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: channelPan[ch] ?? 0,
    instrumentId: null,
    color: null,
    rows: Array.from({ length: 64 }, () => emptyCell())
  }));
  return {
    id: `pattern-${idx}`,
    name: `Pattern ${idx}`,
    length: 64,
    channels,
    importMetadata: {
      sourceFormat: "IMF",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
}
function silentInstrument(id, name) {
  return {
    id,
    name,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: 0,
    pan: 0
  };
}
export {
  isImagoOrpheusFormat,
  parseImagoOrpheusFile
};
