import { c5 as registerVariableEncoder, c2 as createSamplerInstrument, c3 as periodToNoteIndex } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const AMIGA_PERIODS = [
  // C-1 to B-1
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
  // C-2 to B-2
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
  // C-3 to B-3
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
  113
];
function xmNoteToPeriod(xmNote) {
  if (xmNote === 0) return 0;
  const idx = xmNote - 12 - 1;
  if (idx < 0 || idx >= AMIGA_PERIODS.length) return 0;
  return AMIGA_PERIODS[idx];
}
function pushWord(buf, word) {
  buf.push(word >> 8 & 255);
  buf.push(word & 255);
}
function cmdWord(cmd, param) {
  return 32768 | (cmd & 127) << 8 | param & 127;
}
const amosMusicBankEncoder = {
  formatId: "amosMusicBank",
  encodePattern(rows) {
    const buf = [];
    let lastInstr = 0;
    let row = 0;
    while (row < rows.length) {
      const cell = rows[row];
      if (cell) {
        const instr = cell.instrument ?? 0;
        if (instr > 0 && instr !== lastInstr) {
          pushWord(buf, cmdWord(9, instr - 1));
          lastInstr = instr;
        }
        const vol = cell.volume ?? 0;
        if (vol >= 16 && vol <= 80) {
          pushWord(buf, cmdWord(3, vol - 16));
        }
        const effTyp = cell.effTyp ?? 0;
        const eff = cell.eff ?? 0;
        if (effTyp !== 0 || eff !== 0) {
          switch (effTyp) {
            case 0:
              if (eff !== 0) {
                pushWord(buf, cmdWord(10, eff & 127));
              }
              break;
            case 1:
              pushWord(buf, cmdWord(1, eff & 127));
              break;
            case 2:
              pushWord(buf, cmdWord(2, eff & 127));
              break;
            case 3:
              pushWord(buf, cmdWord(11, eff & 127));
              break;
            case 4:
              pushWord(buf, cmdWord(12, eff & 127));
              break;
            case 10:
              if (eff !== 0) {
                pushWord(buf, cmdWord(13, eff & 127));
              } else {
                pushWord(buf, cmdWord(4, 0));
              }
              break;
            case 11:
              pushWord(buf, cmdWord(17, eff & 127));
              break;
            case 14: {
              const sub = eff >> 4 & 15;
              const subP = eff & 15;
              if (sub === 0 && subP <= 1) {
                pushWord(buf, cmdWord(subP === 0 ? 6 : 7, 0));
              } else if (sub === 5) {
                pushWord(buf, cmdWord(5, subP));
              } else if (sub === 6) {
                pushWord(buf, cmdWord(5, subP));
              }
              break;
            }
            case 15:
              if (eff > 0) {
                const amosTempo = Math.max(1, Math.min(100, Math.round(100 / eff)));
                pushWord(buf, cmdWord(8, amosTempo));
              }
              break;
          }
        }
        const period = xmNoteToPeriod(cell.note ?? 0);
        if (period > 0) {
          pushWord(buf, period & 4095);
        }
      }
      let delay = 1;
      while (row + delay < rows.length) {
        const nextCell = rows[row + delay];
        if (nextCell && ((nextCell.note ?? 0) !== 0 || (nextCell.instrument ?? 0) !== 0 || (nextCell.effTyp ?? 0) !== 0 || (nextCell.eff ?? 0) !== 0 || (nextCell.volume ?? 0) >= 16 && (nextCell.volume ?? 0) <= 80)) {
          break;
        }
        delay++;
      }
      if (delay > 0) {
        pushWord(buf, cmdWord(16, Math.min(delay, 127)));
      }
      row += delay;
    }
    pushWord(buf, 32768);
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(amosMusicBankEncoder);
function u16(view, off) {
  return view.getUint16(off, false);
}
function u32(view, off) {
  return view.getUint32(off, false);
}
function readString(view, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const ch = view.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
}
const AMOS_MAIN_HEADER = 20;
function periodToXM(period) {
  if (period === 0) return 0;
  const idx = periodToNoteIndex(period);
  return idx > 0 ? idx + 12 : 0;
}
function decodeABKChannelPattern(view, absOffset, bufLen) {
  const rows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  }));
  let pos = absOffset;
  let rowPos = 0;
  let inst = 0;
  let done = false;
  let perFxt = 0;
  let perFxp = 0;
  while (!done && pos + 2 <= bufLen) {
    const word = u16(view, pos);
    pos += 2;
    if (word === 32768 || word === 37120) break;
    if (word & 32768) {
      const cmd = word >> 8 & 127;
      const param = word & 127;
      if (cmd !== 3 && cmd !== 9 && cmd !== 11 && cmd !== 12 && cmd !== 13 && cmd < 16) {
        perFxt = 0;
        perFxp = 0;
      }
      switch (cmd) {
        case 1:
        case 14:
          if (rowPos < 64) {
            rows[rowPos].effTyp = 1;
            rows[rowPos].eff = param;
          }
          break;
        case 2:
        case 15:
          if (rowPos < 64) {
            rows[rowPos].effTyp = 2;
            rows[rowPos].eff = param;
          }
          break;
        case 3:
          if (rowPos < 64) {
            rows[rowPos].volume = 16 + Math.min(param, 64);
          }
          break;
        case 4:
          perFxt = 0;
          perFxp = 0;
          break;
        case 5:
          if (rowPos < 64) {
            rows[rowPos].effTyp = 14;
            rows[rowPos].eff = param === 0 ? 80 : 96 | param & 15;
          }
          break;
        case 6:
          if (rowPos < 64) {
            rows[rowPos].effTyp = 14;
            rows[rowPos].eff = 0;
          }
          break;
        case 7:
          if (rowPos < 64) {
            rows[rowPos].effTyp = 14;
            rows[rowPos].eff = 1;
          }
          break;
        case 8:
          if (param > 0 && rowPos < 64) {
            rows[rowPos].effTyp = 15;
            rows[rowPos].eff = Math.max(1, Math.round(100 / param));
          }
          break;
        case 9:
          inst = param + 1;
          break;
        case 10:
          perFxt = 0;
          perFxp = param;
          break;
        case 11:
          perFxt = 3;
          perFxp = param;
          break;
        case 12:
          perFxt = 4;
          perFxp = param;
          break;
        case 13:
          if (param !== 0) {
            perFxt = 10;
            perFxp = param;
          } else {
            perFxt = 0;
            perFxp = 0;
          }
          break;
        case 16:
          if (perFxt !== 0 || perFxp !== 0) {
            for (let d = 0; d < param && rowPos < 64; d++) {
              rows[rowPos].effTyp = perFxt;
              rows[rowPos].eff = perFxp;
              rowPos++;
            }
          } else {
            rowPos += param;
          }
          if (rowPos >= 64) done = true;
          break;
        case 17:
          if (rowPos < 64) {
            rows[rowPos].effTyp = 11;
            rows[rowPos].eff = param;
          }
          done = true;
          break;
      }
    } else {
      if (word & 16384) {
        const delay = word & 255;
        if (pos + 2 > bufLen) break;
        const word2 = u16(view, pos);
        pos += 2;
        if (word2 === 0 && delay === 0) break;
        if (word2 !== 0 && rowPos < 64) {
          const period = word2 & 4095;
          rows[rowPos].note = periodToXM(period);
          rows[rowPos].instrument = inst;
        }
        rowPos += delay;
        if (rowPos >= 64) done = true;
      } else {
        const period = word & 4095;
        if (period !== 0 && rowPos < 64) {
          rows[rowPos].note = periodToXM(period);
          rows[rowPos].instrument = inst;
        }
      }
    }
  }
  return rows;
}
function isAMOSMusicBankFormat(buffer) {
  if (buffer.byteLength < 32) return false;
  const view = new DataView(buffer);
  if (readString(view, 0, 4) !== "AmBk") return false;
  if (u16(view, 4) !== 3) return false;
  if (readString(view, 12, 8) !== "Music   ") return false;
  return true;
}
async function parseAMOSMusicBankFile(buffer, filename) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (!isAMOSMusicBankFormat(buffer)) {
    throw new Error("ABK: not an AMOS Music Bank file");
  }
  const instrOff = u32(view, AMOS_MAIN_HEADER + 0);
  const songsOff = u32(view, AMOS_MAIN_HEADER + 4);
  const pattOff = u32(view, AMOS_MAIN_HEADER + 8);
  if (instrOff > 1048576 || songsOff > 1048576 || pattOff > 1048576) {
    throw new Error("ABK: implausible section offsets");
  }
  const instrBase = AMOS_MAIN_HEADER + instrOff;
  const songsBase = AMOS_MAIN_HEADER + songsOff;
  const pattBase = AMOS_MAIN_HEADER + pattOff;
  if (instrBase + 2 > buffer.byteLength) throw new Error("ABK: instruments section out of range");
  const numInstr = u16(view, instrBase);
  const abkInstruments = [];
  for (let i = 0; i < numInstr; i++) {
    const base = instrBase + 2 + i * 32;
    if (base + 32 > buffer.byteLength) break;
    const sampleOffset = u32(view, base + 0);
    const repeatOffset = u32(view, base + 4);
    const len1 = u16(view, base + 8);
    const repeatEnd = u16(view, base + 10);
    const volume = u16(view, base + 12);
    const len2 = u16(view, base + 14);
    const name = readString(view, base + 16, 16).trim();
    const sampleLength = len2 > 4 ? len2 : len1;
    abkInstruments.push({
      name: name || `Sample ${i + 1}`,
      sampleOffset,
      repeatOffset,
      sampleLength,
      repeatEnd,
      volume: Math.min(volume, 64)
    });
  }
  let songName = filename.replace(/\.[^/.]+$/, "");
  let amosSpeed = 6;
  let songOrder = [];
  if (songsBase + 6 <= buffer.byteLength) {
    const numSongs = u16(view, songsBase);
    if (numSongs >= 1 && songsBase + 6 <= buffer.byteLength) {
      const songDataOffset = u32(view, songsBase + 2);
      const songDataBase = songsBase + songDataOffset;
      if (songDataBase + 28 <= buffer.byteLength) {
        const ch0PlaylistAbs = songDataBase + u16(view, songDataBase + 0);
        const amosTempo = u16(view, songDataBase + 8);
        const rawName = readString(view, songDataBase + 12, 16).trim();
        if (rawName) songName = rawName;
        if (amosTempo > 0) {
          amosSpeed = Math.max(1, Math.min(31, Math.round(100 / amosTempo)));
        }
        let plPos = ch0PlaylistAbs;
        while (plPos + 2 <= buffer.byteLength) {
          const pattIdx = u16(view, plPos);
          plPos += 2;
          if (pattIdx === 65535 || pattIdx === 65534) break;
          songOrder.push(pattIdx);
        }
      }
    }
  }
  if (pattBase + 2 > buffer.byteLength) throw new Error("ABK: patterns section out of range");
  const numPatterns = u16(view, pattBase);
  const patterns = [];
  const PANNING = [-50, 50, 50, -50];
  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const chanOffsetBase = pattBase + 2 + pIdx * 8;
    if (chanOffsetBase + 8 > buffer.byteLength) break;
    const channels = Array.from({ length: 4 }, (_, ch) => {
      const chanOff = u16(view, chanOffsetBase + ch * 2);
      const absOff = pattBase + chanOff;
      const rows = absOff + 2 <= buffer.byteLength ? decodeABKChannelPattern(view, absOff, buffer.byteLength) : Array.from({ length: 64 }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      }));
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows
      };
    });
    patterns.push({
      id: `pattern-${pIdx}`,
      name: `Pattern ${pIdx}`,
      length: 64,
      channels,
      importMetadata: {
        sourceFormat: "AMOSMusicBank",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numInstr
      }
    });
  }
  if (patterns.length === 0) {
    patterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 64 }, () => ({
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
        sourceFormat: "AMOSMusicBank",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const instrConfigs = abkInstruments.map((inst, i) => {
    const sampleByteLen = inst.sampleLength * 2;
    const sampleAbs = instrBase + inst.sampleOffset;
    if (sampleByteLen <= 2 || sampleAbs + sampleByteLen > buffer.byteLength) {
      return {
        id: i + 1,
        name: inst.name,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -60,
        pan: 0
      };
    }
    const pcm = bytes.slice(sampleAbs, sampleAbs + sampleByteLen);
    const hasLoop = inst.repeatEnd > 2;
    const loopStart = hasLoop && inst.repeatOffset > inst.sampleOffset ? (inst.repeatOffset - inst.sampleOffset) * 2 : 0;
    const loopEnd = hasLoop ? loopStart + inst.repeatEnd * 2 : 0;
    return createSamplerInstrument(i + 1, inst.name, pcm, inst.volume, 8287, loopStart, loopEnd);
  });
  const songPositions = songOrder.length > 0 ? songOrder.filter((idx) => idx < patterns.length) : [0];
  if (songPositions.length === 0) songPositions.push(0);
  const numABKChannels = 4;
  const numFilePatterns = numPatterns * numABKChannels;
  const trackMap = [];
  const filePatternAddrs = [];
  const filePatternSizes = [];
  const allOffsets = [];
  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const chPats = [];
    const chanOffsetBase = pattBase + 2 + pIdx * 8;
    for (let ch = 0; ch < numABKChannels; ch++) {
      const filePatIdx = pIdx * numABKChannels + ch;
      chPats.push(filePatIdx);
      if (chanOffsetBase + (ch + 1) * 2 <= buffer.byteLength) {
        const chanOff = u16(view, chanOffsetBase + ch * 2);
        const absOff = pattBase + chanOff;
        allOffsets.push({ fileIdx: filePatIdx, absOff });
      } else {
        allOffsets.push({ fileIdx: filePatIdx, absOff: 0 });
      }
    }
    trackMap.push(chPats);
  }
  const sorted = [...allOffsets].sort((a, b) => a.absOff - b.absOff);
  const addrMap = /* @__PURE__ */ new Map();
  const sizeMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    addrMap.set(entry.fileIdx, entry.absOff);
    const nextOff = i + 1 < sorted.length ? sorted[i + 1].absOff : buffer.byteLength;
    sizeMap.set(entry.fileIdx, Math.max(0, nextOff - entry.absOff));
  }
  for (let i = 0; i < numFilePatterns; i++) {
    filePatternAddrs.push(addrMap.get(i) ?? 0);
    filePatternSizes.push(sizeMap.get(i) ?? 256);
  }
  const variableLayout = {
    formatId: "amosMusicBank",
    numChannels: numABKChannels,
    numFilePatterns,
    rowsPerPattern: 64,
    moduleSize: buffer.byteLength,
    encoder: amosMusicBankEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: songName,
    format: "MOD",
    patterns,
    instruments: instrConfigs,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: amosSpeed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadeVariableLayout: variableLayout
  };
}
export {
  isAMOSMusicBankFormat,
  parseAMOSMusicBankFile
};
