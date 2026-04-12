import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const XM_KEYOFF_NOTE$1 = 97;
function reverseULTEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { nibble: 0, param: 0 };
  switch (effTyp) {
    case 0:
      return eff !== 0 ? { nibble: 0, param: eff } : { nibble: 0, param: 0 };
    case 1: {
      if ((eff & 240) === 240) {
        return { nibble: 14, param: 16 | eff & 15 };
      }
      return { nibble: 1, param: eff };
    }
    case 2: {
      if ((eff & 240) === 240) {
        return { nibble: 14, param: 32 | eff & 15 };
      }
      return { nibble: 2, param: eff };
    }
    case 3:
      return { nibble: 3, param: eff };
    // tone porta
    case 4:
      return { nibble: 4, param: eff };
    // vibrato
    case 7:
      return { nibble: 7, param: eff };
    // tremolo
    case 8: {
      const nibbleVal = Math.min(15, Math.round(eff / 17));
      return { nibble: 11, param: nibbleVal };
    }
    case 9: {
      return { nibble: 9, param: Math.min(255, Math.round(eff / 4)) };
    }
    case 10: {
      const up = eff >> 4 & 15;
      const down = eff & 15;
      if (down === 15 && up > 0) {
        return { nibble: 14, param: 160 | up & 15 };
      }
      if (up === 15 && down > 0) {
        return { nibble: 14, param: 176 | down & 15 };
      }
      if (up > 0) return { nibble: 10, param: up << 4 };
      return { nibble: 10, param: down & 15 };
    }
    case 12: {
      return { nibble: 12, param: Math.min(255, Math.round(eff * 255 / 64)) };
    }
    case 13: {
      const bcdParam = (Math.floor(eff / 10) & 15) << 4 | eff % 10;
      return { nibble: 13, param: bcdParam };
    }
    case 14: {
      const hiNib = eff >> 4 & 15;
      const loNib = eff & 15;
      if (hiNib === 9) return { nibble: 14, param: 144 | loNib };
      if (hiNib === 12) return { nibble: 14, param: 192 | loNib };
      if (hiNib === 13) return { nibble: 14, param: 208 | loNib };
      if (hiNib === 6) return { nibble: 14, param: 128 | loNib };
      return { nibble: 0, param: 0 };
    }
    case 15: {
      if (eff > 47) return { nibble: 15, param: eff };
      if (eff === 0) return { nibble: 15, param: 0 };
      return { nibble: 15, param: Math.min(31, eff) };
    }
    default:
      return { nibble: 0, param: 0 };
  }
}
const ultEncoder = {
  formatId: "ult",
  /**
   * Encode rows for a single channel in ULT format.
   * Each row: 5 bytes [noteByte, instr, cmd, para1, para2]
   * No RLE applied (repeat=1 for all cells).
   */
  encodePattern(rows, _channel) {
    const buf = [];
    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      let noteByte = 0;
      if (note === XM_KEYOFF_NOTE$1) {
        noteByte = 0;
      } else if (note > 24 && note <= 120) {
        noteByte = note - 24;
      }
      const fx1 = reverseULTEffect(cell.effTyp ?? 0, cell.eff ?? 0);
      const fx2 = reverseULTEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
      const cmd = (fx2.nibble & 15) << 4 | fx1.nibble & 15;
      buf.push(noteByte & 255);
      buf.push(instr & 255);
      buf.push(cmd);
      buf.push(fx1.param & 255);
      buf.push(fx2.param & 255);
    }
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(ultEncoder);
function u8(v, off) {
  return v.getUint8(off);
}
function i16le(v, off) {
  return v.getInt16(off, true);
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
const SIGNATURE = "MAS_UTrack_V00";
const HEADER_SIZE = 48;
const ROWS_PER_PATTERN = 64;
const ULT_16BIT = 4;
const ULT_LOOP = 8;
const ULT_PINGPONG = 16;
const XM_ARPEGGIO = 0;
const XM_PORTA_UP = 1;
const XM_PORTA_DOWN = 2;
const XM_TONE_PORTA = 3;
const XM_VIBRATO = 4;
const XM_TREMOLO = 7;
const XM_OFFSET = 9;
const XM_VOL_SLIDE = 10;
const XM_SET_VOLUME = 12;
const XM_PAT_BREAK = 13;
const XM_EXTENDED = 14;
const XM_SPEED = 15;
const XM_TEMPO = 15;
const XM_KEYOFF_NOTE = 97;
const XM_S3M_CMDEX = 14;
const EFF_NONE = 0;
const PAR_NONE = 0;
function translateULTEffect(e, param, version) {
  const nibble = e & 15;
  switch (nibble) {
    case 0:
      if (param !== 0 && version >= 51) {
        return [XM_ARPEGGIO, param];
      }
      return [EFF_NONE, PAR_NONE];
    case 1:
      return [XM_PORTA_UP, param];
    case 2:
      return [XM_PORTA_DOWN, param];
    case 3:
      return [XM_TONE_PORTA, param];
    case 4:
      return [XM_VIBRATO, param];
    case 5:
      if ((param & 15) === 2 || (param & 240) === 32) {
        return [XM_S3M_CMDEX, 159];
      }
      if (((param & 15) === 12 || (param & 240) === 192) && version >= 51) {
        return [255, 0];
      }
      return [EFF_NONE, PAR_NONE];
    case 6:
      return [EFF_NONE, PAR_NONE];
    case 7:
      if (version >= 52) {
        return [XM_TREMOLO, param];
      }
      return [EFF_NONE, PAR_NONE];
    case 8:
      return [EFF_NONE, PAR_NONE];
    case 9:
      return [XM_OFFSET, Math.min(255, param * 4)];
    case 10:
      if (param & 240) {
        return [XM_VOL_SLIDE, param & 240];
      }
      return [XM_VOL_SLIDE, param];
    case 11:
      return [8, (param & 15) * 17];
    case 12:
      return [XM_SET_VOLUME, Math.round(param * 64 / 255)];
    case 13:
      return [XM_PAT_BREAK, 10 * (param >> 4) + (param & 15)];
    case 14: {
      const hiNibble = param >> 4;
      const loNibble = param & 15;
      switch (hiNibble) {
        case 1:
          return [XM_PORTA_UP, 240 | loNibble];
        case 2:
          return [XM_PORTA_DOWN, 240 | loNibble];
        case 8:
          if (version >= 52) {
            return [XM_S3M_CMDEX, 96 | loNibble];
          }
          return [EFF_NONE, PAR_NONE];
        case 9:
          return [XM_EXTENDED, 144 | loNibble];
        case 10:
          return [XM_VOL_SLIDE, loNibble << 4 | 15];
        case 11:
          return [XM_VOL_SLIDE, 240 | loNibble];
        case 12:
          return [XM_S3M_CMDEX, 192 | loNibble];
        case 13:
          return [XM_S3M_CMDEX, 208 | loNibble];
        default:
          return [EFF_NONE, PAR_NONE];
      }
    }
    case 15:
      if (param > 47) {
        return [XM_TEMPO, param];
      }
      if (param === 0) {
        return [XM_SPEED, 6];
      }
      if (param <= 31) {
        return [XM_SPEED, param];
      }
      return [XM_SPEED, 31];
    default:
      return [EFF_NONE, PAR_NONE];
  }
}
function isULTFormat(buffer) {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const v = new DataView(buffer);
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (v.getUint8(i) !== SIGNATURE.charCodeAt(i)) return false;
  }
  const version = v.getUint8(14);
  if (version < 49 || version > 52) return false;
  return true;
}
function buildWAV16(pcmBytes, sampleRate, loopStart, loopEnd) {
  const numFrames = pcmBytes.length >> 1;
  const dataSize = numFrames * 2;
  const fileSize = 44 + dataSize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  const dst = new Uint8Array(buf, 44);
  dst.set(pcmBytes.subarray(0, numFrames * 2));
  return buf;
}
function wavToDataUrl(wavBuf) {
  const bytes = new Uint8Array(wavBuf);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
async function parseULTFile(buffer, filename) {
  if (!isULTFormat(buffer)) {
    throw new Error("ULTParser: not a valid UltraTracker file");
  }
  const v = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let pos = 0;
  const version = v.getUint8(14);
  const songName = readString(v, 15, 32) || filename.replace(/\.[^/.]+$/, "");
  const messageLength = v.getUint8(47);
  pos = HEADER_SIZE;
  pos += messageLength * 32;
  const numSamples = v.getUint8(pos);
  pos += 1;
  const sampleHeaders = [];
  for (let s = 0; s < numSamples; s++) {
    const base = pos;
    const name = readString(v, base, 32);
    const filename_ = readString(v, base + 32, 12);
    const loopStart = u32le(v, base + 44);
    const loopEnd = u32le(v, base + 48);
    const sizeStart = u32le(v, base + 52);
    const sizeEnd = u32le(v, base + 56);
    const volume = u8(v, base + 60);
    const flags = u8(v, base + 61);
    let speed;
    let finetune;
    if (version >= 52) {
      speed = u16le(v, base + 62);
      finetune = i16le(v, base + 64);
      pos += 66;
    } else {
      finetune = u16le(v, base + 62);
      speed = 8363;
      pos += 64;
    }
    sampleHeaders.push({
      name: name || `Sample ${s + 1}`,
      filename: filename_,
      loopStart,
      loopEnd,
      sizeStart,
      sizeEnd,
      volume,
      flags,
      speed,
      finetune
    });
  }
  const orderList = [];
  let restartPos = 0;
  for (let i = 0; i < 256; i++) {
    const b = v.getUint8(pos + i);
    if (b === 255) break;
    if (b === 254) {
      restartPos = orderList.length;
      break;
    }
    orderList.push(b);
  }
  pos += 256;
  const numChannels = v.getUint8(pos) + 1;
  pos += 1;
  const numPatterns = v.getUint8(pos) + 1;
  pos += 1;
  const channelPan = [];
  for (let ch = 0; ch < numChannels; ch++) {
    if (version >= 51) {
      const raw = (v.getUint8(pos + ch) & 15) * 16 + 8;
      channelPan.push(Math.round((raw - 128) / 128 * 50));
    } else {
      channelPan.push(ch & 1 ? 25 : -25);
    }
  }
  if (version >= 51) {
    pos += numChannels;
  }
  const patternDataStart = pos;
  const patternData = Array.from(
    { length: numPatterns },
    () => Array.from(
      { length: numChannels },
      () => new Array(ROWS_PER_PATTERN).fill(null)
    )
  );
  const emptyCell = () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: EFF_NONE,
    eff: PAR_NONE,
    effTyp2: EFF_NONE,
    eff2: PAR_NONE
  });
  for (let pat = 0; pat < numPatterns; pat++) {
    for (let ch = 0; ch < numChannels; ch++) {
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        patternData[pat][ch][row] = emptyCell();
      }
    }
  }
  for (let ch = 0; ch < numChannels; ch++) {
    for (let pat = 0; pat < numPatterns; pat++) {
      let row = 0;
      while (row < ROWS_PER_PATTERN) {
        if (pos >= buffer.byteLength) break;
        let repeat = 1;
        let noteByte = bytes[pos++];
        if (noteByte === 252) {
          if (pos + 1 >= buffer.byteLength) break;
          repeat = bytes[pos++];
          noteByte = bytes[pos++];
        }
        if (pos + 4 > buffer.byteLength) break;
        const instr = bytes[pos++];
        const cmd = bytes[pos++];
        const para1 = bytes[pos++];
        const para2 = bytes[pos++];
        let xmNote = 0;
        if (noteByte > 0 && noteByte < 97) {
          xmNote = noteByte + 24;
        }
        const [eff1Typ, eff1Par] = translateULTEffect(cmd & 15, para1, version);
        const [eff2Typ, eff2Par] = translateULTEffect(cmd >> 4, para2, version);
        let finalNote = xmNote;
        let finalEff1Typ = eff1Typ;
        let finalEff1Par = eff1Par;
        let finalEff2Typ = eff2Typ;
        let finalEff2Par = eff2Par;
        if (eff1Typ === 255) {
          finalNote = XM_KEYOFF_NOTE;
          finalEff1Typ = EFF_NONE;
          finalEff1Par = PAR_NONE;
        }
        if (eff2Typ === 255) {
          finalNote = XM_KEYOFF_NOTE;
          finalEff2Typ = EFF_NONE;
          finalEff2Par = PAR_NONE;
        }
        if (repeat + row > ROWS_PER_PATTERN) {
          repeat = ROWS_PER_PATTERN - row;
        }
        if (repeat === 0) break;
        const cell = {
          note: finalNote,
          instrument: instr,
          volume: 0,
          effTyp: finalEff1Typ,
          eff: finalEff1Par,
          effTyp2: finalEff2Typ,
          eff2: finalEff2Par
        };
        for (let r = 0; r < repeat; r++) {
          patternData[pat][ch][row + r] = { ...cell };
        }
        row += repeat;
      }
    }
  }
  let needsPostFix = false;
  for (let pat = 0; pat < numPatterns && !needsPostFix; pat++) {
    for (let ch = 0; ch < numChannels && !needsPostFix; ch++) {
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cell = patternData[pat][ch][row];
        if (cell.effTyp === XM_SPEED && cell.eff === 0 || cell.effTyp2 === XM_SPEED && cell.eff2 === 0) {
          needsPostFix = true;
          break;
        }
      }
    }
  }
  if (needsPostFix) {
    for (let pat = 0; pat < numPatterns; pat++) {
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const cell = patternData[pat][ch][row];
          if (cell.effTyp === XM_SPEED && cell.eff === 0) {
            cell.eff = 6;
            let injected = false;
            for (let c2 = 0; c2 < numChannels; c2++) {
              const target = patternData[pat][c2][row];
              if (target.effTyp2 === 0 && target.eff2 === 0) {
                target.effTyp2 = XM_TEMPO;
                target.eff2 = 125;
                injected = true;
                break;
              }
            }
            if (!injected) {
              for (let c2 = 0; c2 < numChannels; c2++) {
                const target = patternData[pat][c2][row];
                if (c2 !== ch && target.effTyp === 0 && target.eff === 0) {
                  target.effTyp = XM_TEMPO;
                  target.eff = 125;
                  break;
                }
              }
            }
          }
          if (cell.effTyp2 === XM_SPEED && cell.eff2 === 0) {
            cell.eff2 = 6;
            for (let c2 = 0; c2 < numChannels; c2++) {
              const target = patternData[pat][c2][row];
              if (target.effTyp === 0 && target.eff === 0) {
                target.effTyp = XM_TEMPO;
                target.eff = 125;
                break;
              }
            }
          }
        }
      }
    }
  }
  const patternDataSize = pos - patternDataStart;
  let totalSampleBytes = 0;
  for (const hdr of sampleHeaders) {
    if (hdr.sizeEnd > hdr.sizeStart) totalSampleBytes += hdr.sizeEnd - hdr.sizeStart;
  }
  const pcmStart = buffer.byteLength - totalSampleBytes;
  let pcmCursor = pcmStart;
  const samplePCM = [];
  for (let s = 0; s < numSamples; s++) {
    const hdr = sampleHeaders[s];
    const byteLen = hdr.sizeEnd > hdr.sizeStart ? hdr.sizeEnd - hdr.sizeStart : 0;
    if (byteLen > 0 && pcmCursor + byteLen <= buffer.byteLength) {
      samplePCM.push(bytes.slice(pcmCursor, pcmCursor + byteLen));
      pcmCursor += byteLen;
    } else {
      samplePCM.push(null);
      if (byteLen > 0) pcmCursor += byteLen;
    }
  }
  const instruments = [];
  for (let s = 0; s < numSamples; s++) {
    const hdr = sampleHeaders[s];
    const id = s + 1;
    const pcm = samplePCM[s];
    const is16 = (hdr.flags & ULT_16BIT) !== 0;
    const loop = (hdr.flags & ULT_LOOP) !== 0;
    const ping = (hdr.flags & ULT_PINGPONG) !== 0;
    const c5Speed = hdr.speed * 2;
    if (!pcm || pcm.length === 0) {
      instruments.push({
        id,
        name: hdr.name,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      });
      continue;
    }
    let loopStartFrames = 0;
    let loopEndFrames = 0;
    if (loop) {
      loopStartFrames = is16 ? hdr.loopStart >> 1 : hdr.loopStart;
      loopEndFrames = is16 ? hdr.loopEnd >> 1 : hdr.loopEnd;
      const maxFrames = is16 ? pcm.length >> 1 : pcm.length;
      loopEndFrames = Math.min(loopEndFrames, maxFrames);
    }
    const vol64 = Math.round(hdr.volume / 4);
    if (is16) {
      const wavBuf = buildWAV16(pcm, c5Speed);
      const dataUrl = wavToDataUrl(wavBuf);
      const hasLoop = loop && loopEndFrames > loopStartFrames;
      const loopType = ping ? "pingpong" : "forward";
      instruments.push({
        id,
        name: hdr.name.replace(/\0/g, "").trim() || `Sample ${id}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: vol64 > 0 ? 20 * Math.log10(vol64 / 64) : -60,
        pan: 0,
        sample: {
          audioBuffer: wavBuf,
          url: dataUrl,
          baseNote: "C3",
          detune: 0,
          loop: hasLoop,
          loopType: hasLoop ? loopType : "off",
          loopStart: loopStartFrames,
          loopEnd: loopEndFrames > 0 ? loopEndFrames : pcm.length >> 1,
          sampleRate: c5Speed,
          reverse: false,
          playbackRate: 1
        }
      });
    } else {
      const loopEnd = loop && loopEndFrames > loopStartFrames ? loopEndFrames : 0;
      instruments.push(
        createSamplerInstrument(id, hdr.name, pcm, vol64, c5Speed, loopStartFrames, loopEnd)
      );
    }
  }
  const patterns = [];
  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
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
        rows: patternData[pIdx][ch]
      })
    );
    patterns.push({
      id: `pattern-${pIdx}`,
      name: `Pattern ${pIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "ULT",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numSamples
      }
    });
  }
  const numFilePatterns = numChannels * numPatterns;
  const ultPatFileAddrs = [];
  const ultPatFileSizes = [];
  const avgSize = numFilePatterns > 0 ? Math.floor(patternDataSize / numFilePatterns) : 0;
  for (let i = 0; i < numFilePatterns; i++) {
    ultPatFileAddrs.push(patternDataStart + i * avgSize);
    ultPatFileSizes.push(avgSize);
  }
  const trackMap = [];
  for (let p = 0; p < numPatterns; p++) {
    const row = [];
    for (let ch = 0; ch < numChannels; ch++) {
      row.push(ch * numPatterns + p);
    }
    trackMap.push(row);
  }
  const uadeVariableLayout = {
    formatId: "ult",
    numChannels,
    numFilePatterns,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: buffer.byteLength,
    encoder: ultEncoder,
    filePatternAddrs: ultPatFileAddrs,
    filePatternSizes: ultPatFileSizes,
    trackMap
  };
  return {
    name: songName,
    format: "MOD",
    // closest XM-style format for replayer
    patterns,
    instruments,
    songPositions: orderList,
    songLength: orderList.length,
    restartPosition: restartPos,
    numChannels,
    initialSpeed: 4,
    // ULT default — OpenMPT uses 6 internally but ULT tick rate differs
    initialBPM: 125,
    // UltraTracker default BPM
    linearPeriods: false,
    uadeVariableLayout
  };
}
export {
  isULTFormat,
  parseULTFile
};
