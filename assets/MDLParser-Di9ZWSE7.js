import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MDLNOTE_NOTE$1 = 1 << 0;
const MDLNOTE_SAMPLE$1 = 1 << 1;
const MDLNOTE_VOLUME$1 = 1 << 2;
const MDLNOTE_EFFECTS$1 = 1 << 3;
const MDLNOTE_PARAM1$1 = 1 << 4;
const MDLNOTE_PARAM2$1 = 1 << 5;
function reverseEffects(cell) {
  let e1 = 0, p1 = 0, e2 = 0, p2 = 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  if (effTyp !== 0 || eff !== 0) {
    const { cmd, param } = xmToMDL(effTyp, eff);
    e1 = cmd;
    p1 = param;
  }
  const effTyp2 = cell.effTyp2 ?? 0;
  const eff2 = cell.eff2 ?? 0;
  if (effTyp2 !== 0 || eff2 !== 0) {
    const { cmd, param } = xmToMDL(effTyp2, eff2);
    if (cmd >= 16 && cmd <= 21) {
      e2 = cmd - 15;
    } else {
      e2 = cmd;
    }
    p2 = param;
  }
  return { e1, e2, p1, p2 };
}
function xmToMDL(effTyp, eff) {
  switch (effTyp) {
    case 1:
      return { cmd: 1, param: eff };
    // Porta up
    case 2:
      return { cmd: 2, param: eff };
    // Porta down
    case 3:
      return { cmd: 3, param: eff };
    // Tone porta
    case 4:
      return { cmd: 4, param: eff };
    // Vibrato
    case 0:
      return { cmd: eff !== 0 ? 5 : 0, param: eff };
    // Arpeggio
    case 15:
      return { cmd: eff >= 32 ? 7 : 15, param: eff };
    // Tempo/Speed
    case 8:
      return { cmd: 8, param: Math.min(127, eff >> 1) };
    // Panning
    case 11:
      return { cmd: 11, param: eff };
    // Position jump
    case 16:
      return { cmd: 12, param: Math.min(255, eff * 2 - 1) };
    // Global vol
    case 13:
      return { cmd: 13, param: eff };
    // Pattern break
    case 10:
      return { cmd: 16, param: eff };
    // Vol slide → G/H
    case 27:
      return { cmd: 18, param: eff };
    // Retrig
    case 7:
      return { cmd: 19, param: eff };
    // Tremolo
    case 29:
      return { cmd: 20, param: eff };
    // Tremor
    default:
      return { cmd: 0, param: 0 };
  }
}
function isCellEmpty(cell) {
  return (cell.note ?? 0) === 0 && (cell.instrument ?? 0) === 0 && (cell.volume ?? 0) === 0 && (cell.effTyp ?? 0) === 0 && (cell.eff ?? 0) === 0 && (cell.effTyp2 ?? 0) === 0 && (cell.eff2 ?? 0) === 0;
}
function encodeMDLTrack(rows) {
  const parts = [];
  let emptyCount = 0;
  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];
    if (isCellEmpty(cell)) {
      emptyCount++;
      if (emptyCount >= 64 || row === rows.length - 1) {
        parts.push(emptyCount - 1 << 2 | 0);
        emptyCount = 0;
      }
      continue;
    }
    if (emptyCount > 0) {
      parts.push(emptyCount - 1 << 2 | 0);
      emptyCount = 0;
    }
    let flags = 0;
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const vol = cell.volume ?? 0;
    const { e1, e2, p1, p2 } = reverseEffects(cell);
    if (note !== 0) flags |= MDLNOTE_NOTE$1;
    if (instr !== 0) flags |= MDLNOTE_SAMPLE$1;
    if (vol !== 0) flags |= MDLNOTE_VOLUME$1;
    const hasEffects = e1 !== 0 || e2 !== 0;
    if (hasEffects) flags |= MDLNOTE_EFFECTS$1;
    if (p1 !== 0) flags |= MDLNOTE_PARAM1$1;
    if (p2 !== 0) flags |= MDLNOTE_PARAM2$1;
    parts.push(flags << 2 | 3);
    if (flags & MDLNOTE_NOTE$1) {
      if (note === 97) parts.push(255);
      else parts.push(note);
    }
    if (flags & MDLNOTE_SAMPLE$1) parts.push(instr);
    if (flags & MDLNOTE_VOLUME$1) {
      parts.push(Math.max(1, Math.min(255, vol * 4 - 2)));
    }
    if (flags & MDLNOTE_EFFECTS$1) {
      parts.push(e2 << 4 | e1 & 15);
    }
    if (flags & MDLNOTE_PARAM1$1) parts.push(p1);
    if (flags & MDLNOTE_PARAM2$1) parts.push(p2);
  }
  return new Uint8Array(parts);
}
const mdlEncoder = {
  formatId: "mdl",
  encodePattern(rows, _channel) {
    return encodeMDLTrack(rows);
  }
};
registerVariableEncoder(mdlEncoder);
function u8(v, off) {
  return v.getUint8(off);
}
function u16le(v, off) {
  return v.getUint16(off, true);
}
function u32le(v, off) {
  return v.getUint32(off, true);
}
function readStringPadded(v, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c !== 0) s += String.fromCharCode(c);
  }
  return s.trim();
}
const MDLNOTE_NOTE = 1 << 0;
const MDLNOTE_SAMPLE = 1 << 1;
const MDLNOTE_VOLUME = 1 << 2;
const MDLNOTE_EFFECTS = 1 << 3;
const MDLNOTE_PARAM1 = 1 << 4;
const MDLNOTE_PARAM2 = 1 << 5;
const MDL_EFF_PORTA_UP = 1;
const MDL_EFF_PORTA_DN = 2;
const MDL_EFF_TONE_PORTA = 3;
const MDL_EFF_VIBRATO = 4;
const MDL_EFF_ARPEGGIO = 0;
const MDL_EFF_TEMPO = 15;
const MDL_EFF_PANNING = 8;
const MDL_EFF_POS_JUMP = 11;
const MDL_EFF_GLOBAL_VOL = 16;
const MDL_EFF_PAT_BREAK = 13;
const MDL_EFF_SPEED = 15;
const MDL_EFF_VOL_SLIDE = 10;
const MDL_EFF_RETRIG = 27;
const MDL_EFF_TREMOLO = 7;
const MDL_EFF_TREMOR = 29;
function convertMDLCommand(command, param) {
  switch (command) {
    case 0:
      return { effTyp: 0, eff: 0 };
    case 1:
      return { effTyp: MDL_EFF_PORTA_UP, eff: param };
    case 2:
      return { effTyp: MDL_EFF_PORTA_DN, eff: param };
    case 3:
      return { effTyp: MDL_EFF_TONE_PORTA, eff: param };
    case 4:
      return { effTyp: MDL_EFF_VIBRATO, eff: param };
    case 5:
      return { effTyp: MDL_EFF_ARPEGGIO, eff: param };
    // arpeggio = effTyp 0 with param
    case 6:
      return { effTyp: 0, eff: 0 };
    case 7:
      return { effTyp: MDL_EFF_TEMPO, eff: Math.max(32, param) };
    case 8:
      return { effTyp: MDL_EFF_PANNING, eff: (param & 127) * 2 };
    case 9:
      if (param < 64) return { effTyp: 14, eff: 120 };
      else if (param < 128) return { effTyp: 14, eff: 122 };
      else if (param < 192) return { effTyp: 14, eff: 124 };
      else return { effTyp: 0, eff: 0 };
    case 10:
      return { effTyp: 0, eff: 0 };
    case 11:
      return { effTyp: MDL_EFF_POS_JUMP, eff: param };
    case 12:
      return { effTyp: MDL_EFF_GLOBAL_VOL, eff: Math.floor((param + 1) / 2) };
    case 13: {
      const decimal = 10 * (param >> 4) + (param & 15);
      return { effTyp: MDL_EFF_PAT_BREAK, eff: decimal };
    }
    case 14: {
      const hi = param >> 4;
      const lo = param & 15;
      switch (hi) {
        case 0:
          return { effTyp: 0, eff: 0 };
        // unused
        case 1:
          return { effTyp: 25, eff: Math.min(lo, 14) << 4 | 15 };
        case 2:
          return { effTyp: 25, eff: 240 | Math.min(lo, 14) };
        case 3:
          return { effTyp: 0, eff: 0 };
        // unused
        case 4:
          return { effTyp: 14, eff: 48 | lo };
        case 5: {
          const fineEff = lo << 4 ^ 128;
          return { effTyp: 33, eff: fineEff };
        }
        case 6:
          return { effTyp: 14, eff: 176 | lo };
        case 7:
          return { effTyp: 14, eff: 64 | lo };
        case 8:
          return { effTyp: 0, eff: 0 };
        // Set sample loop type — ignored
        case 9:
          return { effTyp: MDL_EFF_RETRIG, eff: lo };
        case 10: {
          const upParam = 240 & (lo + 1 << 3 & 240);
          return { effTyp: 17, eff: upParam };
        }
        case 11: {
          const dnParam = lo + 1 >> 1 & 255;
          return { effTyp: 17, eff: dnParam };
        }
        case 12:
          return { effTyp: 14, eff: 192 | lo };
        case 13:
          return { effTyp: 14, eff: 208 | lo };
        case 14:
          return { effTyp: 14, eff: 224 | lo };
        case 15:
          return { effTyp: 9, eff: param };
        // will be post-processed
        default:
          return { effTyp: 0, eff: 0 };
      }
    }
    case 15:
      return { effTyp: MDL_EFF_SPEED, eff: param };
    case 16: {
      let p = param;
      if (p < 224) {
        p >>= 2;
        if (p > 15) p = 15;
        p <<= 4;
      } else if (p < 240) {
        p = (p & 15) << 2 | 15;
      } else {
        p = p << 4 | 15;
      }
      return { effTyp: MDL_EFF_VOL_SLIDE, eff: p };
    }
    case 17: {
      let p = param;
      if (p < 224) {
        p >>= 2;
        if (p > 15) p = 15;
      } else if (p < 240) {
        p = (p & 15) >> 2 | 240;
      }
      return { effTyp: MDL_EFF_VOL_SLIDE, eff: p };
    }
    case 18:
      return { effTyp: MDL_EFF_RETRIG, eff: param };
    // I
    case 19:
      return { effTyp: MDL_EFF_TREMOLO, eff: param };
    // J
    case 20:
      return { effTyp: MDL_EFF_TREMOR, eff: param };
    // K
    case 21:
      return { effTyp: 0, eff: 0 };
    // L (none)
    default:
      return { effTyp: 0, eff: 0 };
  }
}
function importMDLCommands(cell, vol, cmd1Raw, cmd2Raw, param1, param2) {
  let cmd2 = cmd2Raw;
  if (cmd2 >= 1 && cmd2 <= 6) cmd2 += 15;
  const e1 = convertMDLCommand(cmd1Raw, param1);
  const e2 = convertMDLCommand(cmd2, param2);
  if (vol > 0) {
    cell.volume = Math.floor((vol + 2) / 4);
  }
  if (e1.effTyp !== 0 || e1.eff !== 0) {
    cell.effTyp = e1.effTyp;
    cell.eff = e1.eff;
  }
  if (e2.effTyp !== 0 || e2.eff !== 0) {
    cell.effTyp2 = e2.effTyp;
    cell.eff2 = e2.eff;
  }
}
function decompressMDL8(src, numSamples) {
  const out = new Uint8Array(numSamples);
  let acc = 0;
  let srcIdx = 0;
  for (let i = 0; i < numSamples && srcIdx < src.length; i++) {
    const b = src[srcIdx++];
    let rev = 0;
    for (let bit = 0; bit < 8; bit++) {
      rev |= (b >> bit & 1) << 7 - bit;
    }
    const delta = rev < 128 ? rev : rev - 256;
    acc = acc + delta & 255;
    out[i] = acc;
  }
  return out;
}
function decompressMDL16(src, numSamples) {
  const out = new Int16Array(numSamples);
  let acc = 0;
  let srcIdx = 0;
  for (let i = 0; i < numSamples && srcIdx + 1 < src.length; i++) {
    const lo = src[srcIdx++];
    const hi = src[srcIdx++];
    const raw = hi << 8 | lo;
    let rev = 0;
    for (let bit = 0; bit < 16; bit++) {
      rev |= (raw >> bit & 1) << 15 - bit;
    }
    const delta = rev < 32768 ? rev : rev - 65536;
    acc = acc + delta & 65535;
    const signed = acc < 32768 ? acc : acc - 65536;
    out[i] = signed;
  }
  return out;
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
    volume: volume > 0 ? 20 * Math.log10(volume / 255) : -60,
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
        usePeriodPlayback: false,
        periodMultiplier: 3546895,
        finetune: 0,
        defaultVolume: Math.round(volume * 64 / 255)
      }
    }
  };
}
function isMDLFormat(buffer) {
  if (buffer.byteLength < 5) return false;
  const v = new DataView(buffer);
  const id = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  const version = v.getUint8(4);
  return id === "DMDL" && version < 32;
}
function readChunks(v, startOff) {
  const chunks = /* @__PURE__ */ new Map();
  let off = startOff;
  const fileLen = v.byteLength;
  while (off + 6 <= fileLen) {
    const id = u16le(v, off);
    const len = u32le(v, off + 2);
    const dataOff = off + 6;
    if (dataOff + len > fileLen) break;
    chunks.set(id, { id, offset: dataOff, length: len });
    off = dataOff + len;
  }
  return chunks;
}
const CHUNK_IN = 20041;
const CHUNK_PA = 16720;
const CHUNK_TR = 21076;
const CHUNK_IS = 21321;
const CHUNK_SA = 16723;
async function parseMDLFile(buffer, filename) {
  if (!isMDLFormat(buffer)) {
    throw new Error("MDLParser: file does not match DMDL magic");
  }
  const v = new DataView(buffer);
  const raw = new Uint8Array(buffer);
  const fileVersion = u8(v, 4);
  const chunks = readChunks(v, 5);
  const inChunk = chunks.get(CHUNK_IN);
  if (!inChunk) throw new Error("MDLParser: missing IN chunk");
  let inOff = inChunk.offset;
  const songTitle = readStringPadded(v, inOff, 32);
  const numOrders = u16le(v, inOff + 52);
  const restartPos = u16le(v, inOff + 54);
  const speed = u8(v, inOff + 57);
  const tempo = u8(v, inOff + 58);
  const chnSetupOff = inOff + 59;
  let numChannels = 0;
  for (let c = 0; c < 32; c++) {
    const setup = u8(v, chnSetupOff + c);
    if (!(setup & 128)) numChannels = c + 1;
  }
  if (numChannels < 1) numChannels = 1;
  const ordersOff = inOff + 91;
  const songPositions = [];
  for (let i = 0; i < numOrders && ordersOff + i < inChunk.offset + inChunk.length; i++) {
    songPositions.push(u8(v, ordersOff + i));
  }
  const channelPan = [];
  for (let c = 0; c < numChannels; c++) {
    const setup = u8(v, chnSetupOff + c);
    let pan = (setup & 127) * 2;
    if (pan >= 254) pan = 256;
    channelPan.push(pan - 128);
  }
  const tracks = [];
  const trackFileAddrs = [0];
  const trackFileSizes = [0];
  const trChunk = chunks.get(CHUNK_TR);
  if (trChunk) {
    let trOff = trChunk.offset;
    const trEnd = trOff + trChunk.length;
    if (trOff + 2 <= trEnd) {
      const numTracks = u16le(v, trOff);
      trOff += 2;
      tracks.push({ data: new Uint8Array(0) });
      for (let i = 1; i <= numTracks && trOff + 2 <= trEnd; i++) {
        const trkSize = u16le(v, trOff);
        trOff += 2;
        const trkEnd = Math.min(trOff + trkSize, trEnd);
        trackFileAddrs.push(trOff);
        trackFileSizes.push(trkEnd - trOff);
        tracks.push({ data: raw.slice(trOff, trkEnd) });
        trOff += trkSize;
      }
    }
  }
  const patterns = [];
  const patternTrackMap = [];
  const paChunk = chunks.get(CHUNK_PA);
  if (paChunk) {
    let paOff = paChunk.offset;
    const paEnd = paOff + paChunk.length;
    if (paOff < paEnd) {
      const numPats = u8(v, paOff);
      paOff++;
      for (let pat = 0; pat < numPats && paOff < paEnd; pat++) {
        let numChans = 32;
        let numRows = 64;
        let patName = "";
        if (fileVersion >= 16) {
          if (paOff + 18 > paEnd) break;
          numChans = u8(v, paOff);
          numRows = u8(v, paOff + 1) + 1;
          patName = readStringPadded(v, paOff + 2, 16);
          paOff += 18;
        }
        if (numChans > numChannels) numChannels = Math.min(numChans, 32);
        if (paOff + numChans * 2 > paEnd) break;
        const trackNums = [];
        for (let chn = 0; chn < numChans; chn++) {
          trackNums.push(u16le(v, paOff));
          paOff += 2;
        }
        const paddedTrackNums = Array.from(
          { length: numChannels },
          (_, i) => i < trackNums.length ? trackNums[i] : -1
        );
        patternTrackMap.push(paddedTrackNums);
        const grid = Array.from(
          { length: numRows },
          () => Array.from({ length: numChannels }, () => ({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          }))
        );
        for (let chn = 0; chn < numChans && chn < numChannels; chn++) {
          const trkNum = trackNums[chn];
          if (trkNum === 0 || trkNum >= tracks.length) continue;
          const trkData = tracks[trkNum].data;
          let pos = 0;
          let row = 0;
          while (row < numRows && pos < trkData.length) {
            const b = trkData[pos++];
            const x = b >> 2 & 63;
            const y = b & 3;
            switch (y) {
              case 0:
                row += x + 1;
                break;
              case 1:
                if (row > 0) {
                  const prevCell = grid[row - 1][chn];
                  let repeatCount = x;
                  while (row < numRows && repeatCount >= 0) {
                    grid[row][chn] = { ...prevCell };
                    row++;
                    repeatCount--;
                  }
                }
                break;
              case 2:
                if (row > x) {
                  grid[row][chn] = { ...grid[x][chn] };
                }
                row++;
                break;
              case 3: {
                const cell = grid[row][chn];
                if (x & MDLNOTE_NOTE) {
                  if (pos >= trkData.length) break;
                  const nb = trkData[pos++];
                  if (nb > 120) {
                    cell.note = 97;
                  } else {
                    cell.note = nb;
                  }
                }
                if (x & MDLNOTE_SAMPLE) {
                  if (pos >= trkData.length) break;
                  cell.instrument = trkData[pos++];
                }
                let vol = 0, e1 = 0, e2 = 0, p1 = 0, p2 = 0;
                if (x & MDLNOTE_VOLUME) {
                  if (pos >= trkData.length) break;
                  vol = trkData[pos++];
                }
                if (x & MDLNOTE_EFFECTS) {
                  if (pos >= trkData.length) break;
                  const efByte = trkData[pos++];
                  e1 = efByte & 15;
                  e2 = efByte >> 4;
                }
                if (x & MDLNOTE_PARAM1) {
                  if (pos >= trkData.length) break;
                  p1 = trkData[pos++];
                }
                if (x & MDLNOTE_PARAM2) {
                  if (pos >= trkData.length) break;
                  p2 = trkData[pos++];
                }
                importMDLCommands(cell, vol, e1, e2, p1, p2);
                row++;
                break;
              }
            }
          }
        }
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
          rows: grid.map((r) => r[ch])
        }));
        patterns.push({
          id: `pattern-${pat}`,
          name: patName || `Pattern ${pat}`,
          length: numRows,
          channels,
          importMetadata: {
            sourceFormat: "MDL",
            sourceFile: filename,
            importedAt: (/* @__PURE__ */ new Date()).toISOString(),
            originalChannelCount: numChannels,
            originalPatternCount: numPats,
            originalInstrumentCount: 0
            // filled after instrument pass
          }
        });
      }
    }
  }
  const instruments = new Array(256).fill(null);
  const isChunk = chunks.get(CHUNK_IS);
  const saChunk = chunks.get(CHUNK_SA);
  if (isChunk) {
    let isOff = isChunk.offset;
    const isEnd = isOff + isChunk.length;
    let saOff = saChunk ? saChunk.offset : 0;
    const saEnd = saChunk ? saChunk.offset + saChunk.length : 0;
    if (isOff < isEnd) {
      const numSamples = u8(v, isOff);
      isOff++;
      for (let s = 0; s < numSamples && isOff < isEnd; s++) {
        const sampleIndex = u8(v, isOff);
        isOff++;
        if (sampleIndex === 0) break;
        const smpName = readStringPadded(v, isOff, 32);
        isOff += 32;
        isOff += 8;
        let c4speed;
        if (fileVersion < 16) {
          c4speed = u16le(v, isOff);
          isOff += 2;
        } else {
          c4speed = u32le(v, isOff);
          isOff += 4;
        }
        const sampleRate = c4speed * 2;
        let smpLength = u32le(v, isOff);
        isOff += 4;
        let loopStart = u32le(v, isOff);
        isOff += 4;
        let loopLength = u32le(v, isOff);
        isOff += 4;
        const smpVolume = u8(v, isOff);
        isOff++;
        const smpFlags = u8(v, isOff);
        isOff++;
        const is16Bit = (smpFlags & 1) !== 0;
        const isMDLComp = (smpFlags & 12) !== 0;
        const hasLoop = loopLength !== 0;
        if (is16Bit) {
          smpLength = Math.floor(smpLength / 2);
          loopStart = Math.floor(loopStart / 2);
          loopLength = Math.floor(loopLength / 2);
        }
        const loopEnd = hasLoop ? loopStart + loopLength : 0;
        if (!saChunk || smpLength === 0 || saOff >= saEnd) {
          instruments[sampleIndex] = blankInstrument(sampleIndex, smpName || `Sample ${sampleIndex}`);
          continue;
        }
        const rawByteLen = is16Bit ? smpLength * 2 : smpLength;
        const available = saEnd - saOff;
        if (rawByteLen > available) {
          const readLen = available;
          const smpRaw2 = raw.slice(saOff, saOff + readLen);
          saOff += readLen;
          if (is16Bit) {
            const frames = Math.floor(readLen / 2);
            const pcm16 = new Int16Array(frames);
            for (let i = 0; i < frames; i++) {
              pcm16[i] = smpRaw2[i * 2 + 1] << 8 | smpRaw2[i * 2];
            }
            instruments[sampleIndex] = createSamplerInstrument16(
              sampleIndex,
              smpName || `Sample ${sampleIndex}`,
              pcm16,
              smpVolume,
              sampleRate,
              loopStart,
              loopEnd
            );
          } else {
            instruments[sampleIndex] = createSamplerInstrument(
              sampleIndex,
              smpName || `Sample ${sampleIndex}`,
              smpRaw2,
              Math.round(smpVolume * 64 / 255),
              sampleRate,
              loopStart,
              loopEnd
            );
          }
          continue;
        }
        const smpRaw = raw.slice(saOff, saOff + rawByteLen);
        saOff += rawByteLen;
        if (is16Bit) {
          let pcm16;
          if (isMDLComp) {
            pcm16 = decompressMDL16(smpRaw, smpLength);
          } else {
            pcm16 = new Int16Array(smpLength);
            for (let i = 0; i < smpLength; i++) {
              const lo = smpRaw[i * 2];
              const hi = smpRaw[i * 2 + 1];
              const val = hi << 8 | lo;
              pcm16[i] = val < 32768 ? val : val - 65536;
            }
          }
          instruments[sampleIndex] = createSamplerInstrument16(
            sampleIndex,
            smpName || `Sample ${sampleIndex}`,
            pcm16,
            smpVolume,
            sampleRate,
            loopStart,
            loopEnd
          );
        } else {
          let pcm8;
          if (isMDLComp) {
            pcm8 = decompressMDL8(smpRaw, smpLength);
          } else {
            pcm8 = smpRaw;
          }
          instruments[sampleIndex] = createSamplerInstrument(
            sampleIndex,
            smpName || `Sample ${sampleIndex}`,
            pcm8,
            Math.round(smpVolume * 64 / 255),
            sampleRate,
            loopStart,
            loopEnd
          );
        }
      }
    }
  }
  const instrumentsList = [];
  for (let i = 1; i < 256; i++) {
    if (instruments[i] !== null) {
      instrumentsList.push(instruments[i]);
    }
  }
  const maxPatternIdx = patterns.length - 1;
  const finalPositions = songPositions.filter((p) => p <= maxPatternIdx).map((p) => p);
  if (finalPositions.length === 0) finalPositions.push(0);
  const clampedRestart = Math.min(restartPos, Math.max(0, finalPositions.length - 1));
  return {
    name: songTitle || filename.replace(/\.[^/.]+$/i, ""),
    format: "MOD",
    patterns,
    instruments: instrumentsList,
    songPositions: finalPositions,
    songLength: finalPositions.length,
    restartPosition: clampedRestart,
    numChannels,
    initialSpeed: Math.max(1, speed),
    initialBPM: Math.max(4, tempo),
    linearPeriods: false,
    uadeVariableLayout: {
      formatId: "mdl",
      numChannels,
      numFilePatterns: tracks.length,
      rowsPerPattern: 64,
      // nominal, actual varies
      moduleSize: buffer.byteLength,
      encoder: mdlEncoder,
      filePatternAddrs: trackFileAddrs,
      filePatternSizes: trackFileSizes,
      trackMap: patternTrackMap
    }
  };
}
export {
  isMDLFormat,
  parseMDLFile
};
