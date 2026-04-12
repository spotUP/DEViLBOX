import { c5 as registerVariableEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function reversePSM16Effect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };
  switch (effTyp) {
    case 10: {
      const up = eff >> 4 & 15;
      const down = eff & 15;
      if (down === 15 && up > 0) return { cmd: 1, param: up << 4 | 15 };
      if (up > 0 && down === 0) return { cmd: 2, param: up << 4 & 240 };
      if (up === 15 && down > 0) return { cmd: 3, param: 240 | down };
      if (up === 0 && down > 0) return { cmd: 4, param: down & 15 };
      return { cmd: 0, param: 0 };
    }
    case 1: {
      if ((eff & 240) === 240) return { cmd: 10, param: eff & 15 };
      return { cmd: 11, param: eff };
    }
    case 2: {
      if ((eff & 240) === 240) return { cmd: 12, param: eff | 240 };
      return { cmd: 13, param: eff };
    }
    case 3:
      return { cmd: 14, param: eff };
    // tone portamento
    case 19: {
      const hiNib = eff >> 4 & 15;
      const loNib = eff & 15;
      if (hiNib === 1) return { cmd: 15, param: loNib };
      if (hiNib === 3) return { cmd: 21, param: loNib };
      if (hiNib === 4) return { cmd: 31, param: loNib };
      if (hiNib === 9) return { cmd: 41, param: loNib };
      if (hiNib === 12) return { cmd: 42, param: loNib };
      if (hiNib === 13) return { cmd: 43, param: loNib };
      if (hiNib === 11) return { cmd: 52, param: loNib };
      if (hiNib === 14) return { cmd: 53, param: loNib };
      if (hiNib === 2) return { cmd: 71, param: loNib };
      if (hiNib === 8) return { cmd: 72, param: loNib };
      return { cmd: 0, param: 0 };
    }
    case 4:
      return { cmd: 20, param: eff };
    // vibrato
    case 5: {
      if (eff >> 4 > 0) return { cmd: 16, param: eff << 4 };
      return { cmd: 17, param: eff & 15 };
    }
    case 6: {
      if (eff >> 4 > 0) return { cmd: 22, param: eff << 4 };
      return { cmd: 23, param: eff & 15 };
    }
    case 7:
      return { cmd: 30, param: eff };
    // tremolo
    case 9:
      return { cmd: 40, param: eff };
    // sample offset
    case 27:
      return { cmd: 41, param: eff & 15 };
    // retrigger
    case 11:
      return { cmd: 50, param: eff };
    // position jump
    case 13:
      return { cmd: 51, param: eff };
    // pattern break
    case 15:
      return { cmd: eff >= 32 ? 61 : 60, param: eff };
    // speed/tempo
    case 0:
      return { cmd: 70, param: eff };
    // arpeggio
    default:
      return { cmd: 0, param: 0 };
  }
}
const psmEncoder = {
  formatId: "psm",
  /**
   * Encode rows for a single channel in PSM16 packed format.
   * Each row emits: [chnFlag, ...fields] for non-empty cells, plus 0x00 end-of-row.
   */
  encodePattern(rows, channel) {
    const buf = [];
    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const vol = cell.volume ?? 0;
      const { cmd, param } = reversePSM16Effect(cell.effTyp ?? 0, cell.eff ?? 0);
      const hasNote = note !== 0 || instr !== 0;
      const hasVol = vol !== 0;
      const hasEffect = cmd !== 0 || param !== 0;
      if (hasNote || hasVol || hasEffect) {
        let flag = channel & 31;
        if (hasNote) flag |= 128;
        if (hasVol) flag |= 64;
        if (hasEffect) flag |= 32;
        buf.push(flag);
        if (hasNote) {
          const rawNote = note > 0 ? Math.max(0, Math.min(255, note - 36)) : 0;
          buf.push(rawNote);
          buf.push(instr & 255);
        }
        if (hasVol) {
          buf.push(Math.min(64, vol));
        }
        if (hasEffect) {
          buf.push(cmd & 255);
          buf.push(param & 255);
        }
      }
      buf.push(0);
    }
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(psmEncoder);
function u8(buf, off) {
  return buf[off] ?? 0;
}
function u16le(buf, off) {
  return (buf[off] ?? 0) | (buf[off + 1] ?? 0) << 8;
}
function u32le(buf, off) {
  return ((buf[off] ?? 0) | (buf[off + 1] ?? 0) << 8 | (buf[off + 2] ?? 0) << 16 | (buf[off + 3] ?? 0) << 24) >>> 0;
}
function readString(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i] ?? 0;
    if (c === 0) break;
    if (c === 32 && s.length === 0) continue;
    s += c >= 32 && c < 128 ? String.fromCharCode(c) : " ";
  }
  return s.trimEnd();
}
function readSpacePadded(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i] ?? 0;
    if (c === 0) break;
    s += c >= 32 && c < 128 ? String.fromCharCode(c) : " ";
  }
  return s.trimEnd();
}
function magicMatch(buf, off, magic) {
  if (off + magic.length > buf.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buf[off + i] !== magic.charCodeAt(i)) return false;
  }
  return true;
}
function isPSMFormat(bytes) {
  if (bytes.length < 12) return false;
  if (magicMatch(bytes, 0, "PSM ") && magicMatch(bytes, 8, "FILE")) return true;
  if (magicMatch(bytes, 0, "PSMþ") && bytes.length >= 146) {
    if (u8(bytes, 63) !== 26) return false;
    const fmtVer = u8(bytes, 65);
    if (fmtVer !== 16 && fmtVer !== 1) return false;
    return true;
  }
  return false;
}
function parsePSMFile(bytes, filename) {
  try {
    if (bytes.length < 4) return null;
    if (magicMatch(bytes, 0, "PSM ")) return _parseNewPSM(bytes, filename);
    if (magicMatch(bytes, 0, "PSMþ")) return _parsePSM16(bytes, filename);
    return null;
  } catch {
    return null;
  }
}
function readNewPSMChunks(bytes) {
  const chunks = [];
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(u8(bytes, pos), u8(bytes, pos + 1), u8(bytes, pos + 2), u8(bytes, pos + 3));
    const size = u32le(bytes, pos + 4);
    chunks.push({ id, start: pos + 8, size });
    pos += 8 + size;
  }
  return chunks;
}
function readSubChunks(bytes, start, size) {
  const chunks = [];
  let pos = start;
  const end = start + size;
  while (pos + 8 <= end) {
    const id = String.fromCharCode(u8(bytes, pos), u8(bytes, pos + 1), u8(bytes, pos + 2), u8(bytes, pos + 3));
    const csize = u32le(bytes, pos + 4);
    chunks.push({ id, start: pos + 8, size: csize });
    pos += 8 + csize;
  }
  return chunks;
}
function readPSMPatternIndex(bytes, pos, sinariaHint) {
  if (pos + 4 > bytes.length) return { patIndex: 0, isSinaria: sinariaHint, consumed: 0 };
  const id4 = String.fromCharCode(u8(bytes, pos), u8(bytes, pos + 1), u8(bytes, pos + 2), u8(bytes, pos + 3));
  if (id4 === "PATT") {
    if (pos + 8 > bytes.length) return { patIndex: 0, isSinaria: true, consumed: 8 };
    let numStr = "";
    for (let i = 4; i < 8; i++) {
      const c = u8(bytes, pos + i);
      if (c >= 48 && c <= 57) numStr += String.fromCharCode(c);
      else break;
    }
    const patIndex = numStr ? parseInt(numStr, 10) : 0;
    return { patIndex, isSinaria: true, consumed: 8 };
  } else {
    let numStr = "";
    for (let i = 1; i < 4; i++) {
      const c = u8(bytes, pos + i);
      if (c >= 48 && c <= 57) numStr += String.fromCharCode(c);
      else break;
    }
    const patIndex = numStr ? parseInt(numStr, 10) : 0;
    return { patIndex, isSinaria: sinariaHint, consumed: 4 };
  }
}
function convertPSMPorta(param, sinaria) {
  if (sinaria) return param;
  if (param < 4) return param | 240;
  return param >> 2;
}
function convertNewPSMEffect(cmd, param, sinaria, _bytes, _pos) {
  let effTyp = 0, eff = 0, extra = 0;
  switch (cmd) {
    // Volume slides
    case 1:
      effTyp = 10;
      eff = sinaria ? param << 4 | 15 : (param & 30) << 3 | 15;
      break;
    case 2:
      effTyp = 10;
      eff = sinaria ? 240 & param << 4 : 240 & param << 3;
      break;
    case 3:
      effTyp = 10;
      eff = sinaria ? param | 240 : 240 | param >> 1;
      break;
    case 4:
      effTyp = 10;
      if (sinaria) eff = param & 15;
      else eff = param < 2 ? param | 240 : param >> 1 & 15;
      break;
    // Portamento
    case 11:
      effTyp = 1;
      eff = 240 | convertPSMPorta(param, sinaria);
      break;
    case 12:
      effTyp = 1;
      eff = convertPSMPorta(param, sinaria);
      break;
    case 13:
      effTyp = 2;
      eff = 240 | convertPSMPorta(param, sinaria);
      break;
    case 14:
      effTyp = 2;
      eff = convertPSMPorta(param, sinaria);
      break;
    case 15:
      effTyp = 3;
      eff = sinaria ? param : param >> 2;
      break;
    case 16:
      effTyp = 5;
      eff = param & 240;
      break;
    // tone porta vol
    case 17:
      effTyp = 19;
      eff = 16 | param & 1;
      break;
    case 18:
      effTyp = 5;
      eff = param >> 4 & 15;
      break;
    // Vibrato
    case 21:
      effTyp = 4;
      eff = param;
      break;
    case 22:
      effTyp = 19;
      eff = 48 | param & 15;
      break;
    case 23:
      effTyp = 6;
      eff = 240 | param;
      break;
    case 24:
      effTyp = 6;
      eff = param;
      break;
    // Tremolo
    case 31:
      effTyp = 7;
      eff = param;
      break;
    case 32:
      effTyp = 19;
      eff = 64 | param & 15;
      break;
    // Sample commands
    case 41:
      effTyp = 9;
      eff = param;
      extra = 2;
      break;
    case 42:
      effTyp = 27;
      eff = param;
      break;
    case 43:
      effTyp = 19;
      eff = 192 | param & 15;
      break;
    case 44:
      effTyp = 19;
      eff = 208 | param & 15;
      break;
    // Position change
    case 51:
      effTyp = 11;
      eff = param / 2;
      extra = 1;
      break;
    case 52:
      effTyp = 13;
      eff = 0;
      break;
    case 53:
      effTyp = 19;
      eff = 176 | param & 15;
      break;
    case 54:
      effTyp = 19;
      eff = 224 | param & 15;
      break;
    // Speed
    case 61:
      effTyp = 15;
      eff = param;
      break;
    // speed
    case 62:
      effTyp = 15;
      eff = param;
      break;
    // tempo
    // Misc
    case 71:
      effTyp = 0;
      eff = param;
      break;
    // arpeggio
    case 72:
      effTyp = 19;
      eff = 32 | param & 15;
      break;
    // finetune
    case 73:
      effTyp = 19;
      eff = 128 | param & 15;
      break;
    // balance
    default:
      effTyp = 0;
      eff = 0;
      break;
  }
  return { effTyp, eff, extra };
}
function convertNewPSMNote(raw, sinaria) {
  if (sinaria) {
    if (raw < 85) return raw + 36;
    return 0;
  }
  if (raw === 255) return 121;
  if (raw >= 129) return 0;
  const note = (raw & 15) + 12 * (raw >> 4) + 13;
  return Math.max(1, Math.min(120, note));
}
function _parseNewPSM(bytes, filename) {
  if (!magicMatch(bytes, 0, "PSM ") || !magicMatch(bytes, 8, "FILE")) return null;
  const allChunks = readNewPSMChunks(bytes);
  const sdft = allChunks.find((c) => c.id === "SDFT");
  if (!sdft || !magicMatch(bytes, sdft.start, "MAINSONG")) return null;
  const songChunks = allChunks.filter((c) => c.id === "SONG");
  if (songChunks.length === 0) return null;
  let numChannels = 0;
  for (const sc of songChunks) {
    if (sc.start + 11 > bytes.length) continue;
    const compression = u8(bytes, sc.start + 9);
    if (compression !== 1) return null;
    const nc = u8(bytes, sc.start + 10);
    numChannels = Math.max(numChannels, nc);
  }
  if (numChannels === 0 || numChannels > 64) return null;
  const titleChunk = allChunks.find((c) => c.id === "TITL");
  let songName = "";
  if (titleChunk) {
    songName = readSpacePadded(bytes, titleChunk.start, titleChunk.size);
  }
  let sinariaFormat = false;
  let initialSpeed = 6;
  let initialBPM = 125;
  const songPositions = [];
  let restartPosition = 0;
  const channelPanning = Array(numChannels).fill(128);
  for (const sc of songChunks) {
    if (sc.start + 11 > bytes.length) continue;
    const subChunks = readSubChunks(bytes, sc.start + 11, sc.size - 11);
    for (const sub of subChunks) {
      if (sub.id === "OPLH") {
        if (sub.size < 9) continue;
        let sp = sub.start + 2;
        const subEnd = sub.start + sub.size;
        let chunkCount = 0;
        let firstOrderChunk = 65535;
        while (sp < subEnd) {
          if (sp >= bytes.length) break;
          const opcode = u8(bytes, sp++);
          if (opcode === 0) break;
          switch (opcode) {
            case 1: {
              const { patIndex, isSinaria, consumed } = readPSMPatternIndex(bytes, sp, sinariaFormat);
              if (isSinaria) sinariaFormat = true;
              sp += consumed;
              const finalPat = patIndex === 255 ? 65535 : patIndex === 254 ? 65534 : patIndex;
              if (finalPat < 65534) songPositions.push(finalPat);
              if (firstOrderChunk === 65535) firstOrderChunk = chunkCount;
              break;
            }
            case 2:
              sp += 4;
              break;
            case 3: {
              if (sp + 2 > bytes.length) break;
              const restartChunk = u16le(bytes, sp);
              sp += 2 + 1;
              if (restartChunk >= firstOrderChunk) {
                restartPosition = restartChunk - firstOrderChunk;
              }
              break;
            }
            case 4: {
              if (sp + 2 > bytes.length) break;
              const restartChunk = u16le(bytes, sp);
              sp += 2;
              if (restartChunk >= firstOrderChunk) {
                restartPosition = restartChunk - firstOrderChunk;
              }
              break;
            }
            case 5: {
              if (sp + 2 > bytes.length) break;
              const [chn, type] = [u8(bytes, sp), u8(bytes, sp + 1)];
              sp += 2;
              if (chn < numChannels) {
                if (type === 0) channelPanning[chn] = channelPanning[chn];
                else if (type === 4) channelPanning[chn] = 128;
              }
              break;
            }
            case 6:
              sp += 1;
              break;
            // transpose — skip
            case 7:
              if (sp < bytes.length) initialSpeed = Math.max(1, u8(bytes, sp++));
              break;
            case 8:
              if (sp < bytes.length) initialBPM = Math.max(32, u8(bytes, sp++));
              break;
            case 12: {
              if (sp + 6 > bytes.length) return null;
              const m = [u8(bytes, sp), u8(bytes, sp + 1), u8(bytes, sp + 2), u8(bytes, sp + 3), u8(bytes, sp + 4), u8(bytes, sp + 5)];
              if (m[0] !== 0 || m[1] !== 255 || m[2] !== 0 || m[3] !== 0 || m[4] !== 1 || m[5] !== 0) return null;
              sp += 6;
              break;
            }
            case 13: {
              if (sp + 3 > bytes.length) break;
              const [chn, pan, type] = [u8(bytes, sp), u8(bytes, sp + 1), u8(bytes, sp + 2)];
              sp += 3;
              if (chn < numChannels) {
                if (type === 0) channelPanning[chn] = pan ^ 128;
                else if (type === 2) channelPanning[chn] = 128;
                else if (type === 4) channelPanning[chn] = 128;
              }
              break;
            }
            case 14: {
              if (sp + 2 > bytes.length) break;
              sp += 2;
              break;
            }
            default:
              return null;
          }
          chunkCount++;
        }
      } else if (sub.id === "PPAN") {
        let sp = sub.start;
        for (let ch = 0; ch < numChannels; ch++) {
          if (sp + 2 > bytes.length) break;
          const [type, pan] = [u8(bytes, sp), u8(bytes, sp + 1)];
          sp += 2;
          if (type === 0) channelPanning[ch] = pan ^ 128;
          else if (type === 2) channelPanning[ch] = 128;
          else if (type === 4) channelPanning[ch] = 128;
        }
      }
    }
  }
  if (songPositions.length === 0) return null;
  const sampleNames = /* @__PURE__ */ new Map();
  const dsmpChunks = allChunks.filter((c) => c.id === "DSMP");
  for (const dsmp of dsmpChunks) {
    if (dsmp.start + 96 > bytes.length) continue;
    let sampleNumber;
    let sampleName;
    if (!sinariaFormat) {
      sampleNumber = u16le(bytes, dsmp.start + 52) + 1;
      sampleName = readString(bytes, dsmp.start + 13, 33);
    } else {
      sampleNumber = u16le(bytes, dsmp.start + 56) + 1;
      sampleName = readString(bytes, dsmp.start + 17, 33);
    }
    if (sampleNumber > 0 && sampleNumber < 256) {
      sampleNames.set(sampleNumber, sampleName);
    }
  }
  const maxSample = sampleNames.size > 0 ? Math.max(...sampleNames.keys()) : 0;
  const instruments = [];
  for (let i = 1; i <= Math.max(maxSample, 1); i++) {
    instruments.push({
      id: i,
      name: sampleNames.get(i) || `Sample ${i}`,
      type: "sample",
      synthType: "Sampler",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const patternMap = /* @__PURE__ */ new Map();
  const pbodChunks = allChunks.filter((c) => c.id === "PBOD");
  for (const pbod of pbodChunks) {
    if (pbod.size < 8) continue;
    let pp = pbod.start;
    const innerLen = u32le(bytes, pp);
    if (innerLen !== pbod.size) continue;
    pp += 4;
    const { patIndex, consumed } = readPSMPatternIndex(bytes, pp, sinariaFormat);
    pp += consumed;
    if (pp + 2 > bytes.length) continue;
    const numRows = u16le(bytes, pp);
    pp += 2;
    const clampedRows = Math.min(numRows, 256);
    if (clampedRows === 0) continue;
    const cellGrid = Array.from(
      { length: clampedRows },
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
    for (let row = 0; row < clampedRows; row++) {
      if (pp + 2 > bytes.length) break;
      const rowSize = u16le(bytes, pp);
      pp += 2;
      if (rowSize <= 2) continue;
      const rowEnd = pp + (rowSize - 2);
      if (rowEnd > bytes.length) break;
      while (pp + 2 <= rowEnd) {
        const flagByte = u8(bytes, pp);
        const channel = u8(bytes, pp + 1);
        pp += 2;
        const ch = Math.min(channel, numChannels - 1);
        const cell = cellGrid[row][ch];
        if (flagByte & 128) {
          if (pp < rowEnd) {
            cell.note = convertNewPSMNote(u8(bytes, pp++), sinariaFormat);
          }
        }
        if (flagByte & 64) {
          if (pp < rowEnd) {
            cell.instrument = u8(bytes, pp++) + 1;
          }
        }
        if (flagByte & 32) {
          if (pp < rowEnd) {
            const vol = u8(bytes, pp++);
            cell.volume = Math.round((Math.min(vol, 127) + 1) / 2);
          }
        }
        if (flagByte & 16) {
          if (pp + 2 <= rowEnd) {
            const cmd = u8(bytes, pp);
            const param = u8(bytes, pp + 1);
            pp += 2;
            const { effTyp, eff, extra } = convertNewPSMEffect(cmd, param, sinariaFormat);
            cell.effTyp = effTyp;
            cell.eff = eff;
            pp += extra;
            if (pp > rowEnd) pp = rowEnd;
          }
        }
      }
      pp = rowEnd;
    }
    const channels = Array.from({ length: numChannels }, (_, ch) => {
      const rawPan = channelPanning[ch] ?? 128;
      const pan = Math.round((rawPan - 128) / 128 * 100);
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan,
        instrumentId: null,
        color: null,
        rows: cellGrid.map((r) => r[ch])
      };
    });
    patternMap.set(patIndex, {
      id: `pattern-${patIndex}`,
      name: `Pattern ${patIndex}`,
      length: clampedRows,
      channels,
      importMetadata: {
        sourceFormat: sinariaFormat ? "PSM (Sinaria)" : "PSM",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: pbodChunks.length,
        originalInstrumentCount: instruments.length
      }
    });
  }
  const maxPatIdx = Math.max(...songPositions, 0);
  const patterns = [];
  for (let i = 0; i <= maxPatIdx; i++) {
    const existing = patternMap.get(i);
    if (existing) {
      patterns.push(existing);
    } else {
      patterns.push(makeEmptyPatternPSM(i, 64, numChannels, filename, pbodChunks.length, instruments.length));
    }
  }
  if (patterns.length === 0) {
    patterns.push(makeEmptyPatternPSM(0, 64, numChannels, filename, 0, instruments.length));
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "Sample 1",
      type: "sample",
      synthType: "Sampler",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const baseName = filename.replace(/\.[^/.]+$/, "");
  return {
    name: songName.trim() || baseName,
    format: "S3M",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: Math.min(restartPosition, songPositions.length - 1),
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods: false
  };
}
function _parsePSM16(bytes, filename) {
  if (bytes.length < 146) return null;
  if (!magicMatch(bytes, 0, "PSMþ")) return null;
  if (u8(bytes, 63) !== 26) return null;
  const formatVersion = u8(bytes, 65);
  if (formatVersion !== 16 && formatVersion !== 1) return null;
  const patternVersion = u8(bytes, 66);
  if (patternVersion !== 0) return null;
  const songType = u8(bytes, 64);
  if ((songType & 3) !== 0) return null;
  const songName = readSpacePadded(bytes, 4, 59);
  const songSpeed = u8(bytes, 67);
  const songTempo = u8(bytes, 68);
  u8(bytes, 69);
  const songLength = u16le(bytes, 70);
  const songOrders = u16le(bytes, 72);
  const numPatterns = u16le(bytes, 74);
  const numSamples = u16le(bytes, 76);
  const numChannelsPlay = u16le(bytes, 78);
  const numChannelsReal = u16le(bytes, 80);
  const orderOffset = u32le(bytes, 82);
  const panOffset = u32le(bytes, 86);
  const patOffset = u32le(bytes, 90);
  const smpOffset = u32le(bytes, 94);
  if (numChannelsPlay > 32 || numChannelsReal > 32) return null;
  const numChannels = Math.max(numChannelsPlay, numChannelsReal);
  if (numChannels === 0) return null;
  const songPositions = [];
  if (orderOffset > 4) {
    const ordPos = orderOffset - 4;
    if (ordPos + 4 + songOrders <= bytes.length && magicMatch(bytes, ordPos, "PORD")) {
      for (let i = 0; i < songOrders; i++) {
        songPositions.push(u8(bytes, ordPos + 4 + i));
      }
    }
  }
  if (songPositions.length === 0) {
    for (let i = 0; i < Math.min(songLength, 256); i++) songPositions.push(i);
  }
  const channelPanning = Array(numChannels).fill(128);
  if (panOffset > 4) {
    const panPos = panOffset - 4;
    if (panPos + 4 <= bytes.length && magicMatch(bytes, panPos, "PPAN")) {
      for (let i = 0; i < numChannels; i++) {
        if (panPos + 4 + i >= bytes.length) break;
        const raw = u8(bytes, panPos + 4 + i) & 15;
        channelPanning[i] = Math.round(((15 - raw) * 256 + 8) / 15);
      }
    }
  }
  const SAMPLE_HDR_SIZE = 64;
  const instruments = [];
  if (smpOffset > 4) {
    const smpPos = smpOffset - 4;
    if (smpPos + 4 <= bytes.length && magicMatch(bytes, smpPos, "PSAH")) {
      let sp = smpPos + 4;
      for (let s = 0; s < numSamples; s++) {
        if (sp + SAMPLE_HDR_SIZE > bytes.length) break;
        const sName = readString(bytes, sp + 13, 24);
        const smpNumber = u16le(bytes, sp + 41);
        sp += SAMPLE_HDR_SIZE;
        if (smpNumber > 0 && smpNumber < 256) {
          while (instruments.length < smpNumber) {
            const idx = instruments.length + 1;
            instruments.push({
              id: idx,
              name: `Sample ${idx}`,
              type: "sample",
              synthType: "Sampler",
              effects: [],
              volume: 0,
              pan: 0
            });
          }
          instruments[smpNumber - 1] = {
            id: smpNumber,
            name: sName || `Sample ${smpNumber}`,
            type: "sample",
            synthType: "Sampler",
            effects: [],
            volume: 0,
            pan: 0
          };
        }
      }
    }
  }
  const PSM16_PAT_HDR = 4;
  const patterns = [];
  const patFileAddrs = [];
  const patFileSizes = [];
  const patRowCounts = [];
  if (patOffset > 4) {
    const patPos = patOffset - 4;
    if (patPos + 4 <= bytes.length && magicMatch(bytes, patPos, "PPAT")) {
      let pp = patPos + 4;
      for (let pat = 0; pat < numPatterns; pat++) {
        if (pp + PSM16_PAT_HDR > bytes.length) break;
        const patSize = u16le(bytes, pp);
        const numRows = u8(bytes, pp + 2);
        pp += PSM16_PAT_HDR;
        if (patSize < PSM16_PAT_HDR) continue;
        const bodySize = (patSize + 15 & -16) - PSM16_PAT_HDR;
        const bodyEnd = pp + bodySize;
        if (bodyEnd > bytes.length) break;
        patFileAddrs.push(pp);
        patFileSizes.push(bodySize);
        const clampedRows = Math.min(numRows, 256);
        patRowCounts.push(clampedRows);
        const cellGrid = Array.from(
          { length: clampedRows },
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
        let curRow = 0;
        let cp = pp;
        const CHAN_MASK = 31;
        const NOTE_FLAG = 128;
        const VOL_FLAG = 64;
        const EFF_FLAG = 32;
        while (cp < bodyEnd && curRow < clampedRows) {
          const chnFlag = u8(bytes, cp++);
          if (chnFlag === 0) {
            curRow++;
            continue;
          }
          const ch = Math.min(chnFlag & CHAN_MASK, numChannels - 1);
          const cell = cellGrid[curRow][ch];
          if (chnFlag & NOTE_FLAG) {
            if (cp + 2 > bodyEnd) break;
            const rawNote = u8(bytes, cp++);
            const instr = u8(bytes, cp++);
            cell.note = Math.max(1, Math.min(120, rawNote + 36));
            cell.instrument = instr;
          }
          if (chnFlag & VOL_FLAG) {
            if (cp >= bodyEnd) break;
            const vol = u8(bytes, cp++);
            cell.volume = Math.min(64, vol);
          }
          if (chnFlag & EFF_FLAG) {
            if (cp + 2 > bodyEnd) break;
            const cmd = u8(bytes, cp++);
            const param = u8(bytes, cp++);
            const { effTyp, eff } = convertPSM16Effect(cmd, param);
            cell.effTyp = effTyp;
            cell.eff = eff;
            if (cmd === 40) cp += 2;
          }
        }
        pp = bodyEnd;
        const channels = Array.from({ length: numChannels }, (_, ch) => {
          const rawPan = channelPanning[ch] ?? 128;
          const pan = Math.round((rawPan - 128) / 128 * 100);
          return {
            id: `channel-${ch}`,
            name: `Channel ${ch + 1}`,
            muted: false,
            solo: false,
            collapsed: false,
            volume: 100,
            pan,
            instrumentId: null,
            color: null,
            rows: cellGrid.map((r) => r[ch])
          };
        });
        patterns.push({
          id: `pattern-${pat}`,
          name: `Pattern ${pat}`,
          length: clampedRows,
          channels,
          importMetadata: {
            sourceFormat: "PSM16",
            sourceFile: filename,
            importedAt: (/* @__PURE__ */ new Date()).toISOString(),
            originalChannelCount: numChannels,
            originalPatternCount: numPatterns,
            originalInstrumentCount: instruments.length
          }
        });
      }
    }
  }
  if (patterns.length === 0) {
    patterns.push(makeEmptyPatternPSM(0, 64, numChannels, filename, 0, instruments.length));
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "Sample 1",
      type: "sample",
      synthType: "Sampler",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const validPositions = songPositions.filter((p) => p < patterns.length);
  const finalPositions = validPositions.length > 0 ? validPositions : [0];
  const baseName = filename.replace(/\.[^/.]+$/, "");
  const trackMap = [];
  for (let p = 0; p < patterns.length; p++) {
    trackMap.push(Array.from({ length: numChannels }, () => p < patFileAddrs.length ? p : -1));
  }
  const uadeVariableLayout = {
    formatId: "psm",
    numChannels,
    numFilePatterns: patFileAddrs.length,
    rowsPerPattern: patRowCounts.length > 0 ? patRowCounts : 64,
    moduleSize: bytes.length,
    encoder: psmEncoder,
    filePatternAddrs: patFileAddrs,
    filePatternSizes: patFileSizes,
    trackMap
  };
  return {
    name: songName.trim() || baseName,
    format: "S3M",
    patterns,
    instruments,
    songPositions: finalPositions,
    songLength: finalPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: Math.max(1, songSpeed),
    initialBPM: Math.max(32, songTempo),
    linearPeriods: false,
    uadeVariableLayout
  };
}
function convertPSM16Effect(cmd, param, _bytes, _pos) {
  switch (cmd) {
    // Volume slides
    case 1:
      return { effTyp: 10, eff: param << 4 | 15 };
    // fine volslide up
    case 2:
      return { effTyp: 10, eff: param << 4 & 240 };
    // volslide up
    case 3:
      return { effTyp: 10, eff: 240 | param };
    // fine volslide down
    case 4:
      return { effTyp: 10, eff: param & 15 };
    // volslide down
    // Portamento
    case 10:
      return { effTyp: 1, eff: 240 | param };
    // fine porta up
    case 11:
      return { effTyp: 1, eff: param };
    // porta up
    case 12:
      return { effTyp: 2, eff: param | 240 };
    // fine porta down
    case 13:
      return { effTyp: 2, eff: param };
    // porta down
    case 14:
      return { effTyp: 3, eff: param };
    // tone portamento
    case 15:
      return { effTyp: 19, eff: 16 | param & 15 };
    // glissando
    case 16:
      return { effTyp: 5, eff: param << 4 };
    // tone porta + vol up
    case 17:
      return { effTyp: 5, eff: param & 15 };
    // tone porta + vol dn
    // Vibrato
    case 20:
      return { effTyp: 4, eff: param };
    // vibrato
    case 21:
      return { effTyp: 19, eff: 48 | param & 15 };
    // vib waveform
    case 22:
      return { effTyp: 6, eff: param << 4 };
    // vib + vol up
    case 23:
      return { effTyp: 6, eff: param & 15 };
    // vib + vol dn
    // Tremolo
    case 30:
      return { effTyp: 7, eff: param };
    // tremolo
    case 31:
      return { effTyp: 19, eff: 64 | param & 15 };
    // trem waveform
    // Sample
    case 40:
      return { effTyp: 9, eff: param };
    // 3-byte offset (middle byte)
    case 41:
      return { effTyp: 27, eff: param & 15 };
    // retrigger
    case 42:
      return { effTyp: 19, eff: 192 | param & 15 };
    // note cut
    case 43:
      return { effTyp: 19, eff: 208 | param & 15 };
    // note delay
    // Position
    case 50:
      return { effTyp: 11, eff: param };
    // position jump
    case 51:
      return { effTyp: 13, eff: param };
    // pattern break
    case 52:
      return { effTyp: 19, eff: 176 | param & 15 };
    // loop
    case 53:
      return { effTyp: 19, eff: 224 | param & 15 };
    // pattern delay
    // Speed
    case 60:
      return { effTyp: 15, eff: param };
    // speed
    case 61:
      return { effTyp: 15, eff: param };
    // tempo
    // Misc
    case 70:
      return { effTyp: 0, eff: param };
    // arpeggio
    case 71:
      return { effTyp: 19, eff: 32 | param & 15 };
    // finetune
    case 72:
      return { effTyp: 19, eff: 128 | param & 15 };
    // balance
    default:
      return { effTyp: 0, eff: 0 };
  }
}
function makeEmptyPatternPSM(idx, numRows, numChannels, filename, totalPats, numInstruments) {
  const emptyRow = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  const channels = Array.from({ length: numChannels }, (_, ch) => ({
    id: `channel-${ch}`,
    name: `Channel ${ch + 1}`,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: null,
    color: null,
    rows: Array.from({ length: numRows }, emptyRow)
  }));
  return {
    id: `pattern-${idx}`,
    name: `Pattern ${idx}`,
    length: numRows,
    channels,
    importMetadata: {
      sourceFormat: "PSM",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: totalPats,
      originalInstrumentCount: numInstruments
    }
  };
}
export {
  isPSMFormat,
  parsePSMFile
};
