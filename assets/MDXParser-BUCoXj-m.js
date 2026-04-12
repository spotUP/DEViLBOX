import { D as DEFAULT_FURNACE } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function emptyPattern(id, name, numCh, rows) {
  return {
    id,
    name,
    length: rows,
    channels: Array.from({ length: numCh }, (_, i) => ({
      id: `ch${i}`,
      name: i < 8 ? `FM ${String.fromCharCode(65 + i)}` : "ADPCM",
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rows }, emptyCell),
      channelMeta: {
        importedFromMOD: false,
        originalIndex: i,
        channelType: "synth",
        furnaceType: i < 8 ? 33 : void 0,
        // OPM chip type
        hardwareName: i < 8 ? "YM2151" : "OKI ADPCM",
        shortName: i < 8 ? String.fromCharCode(65 + i) : "P"
      }
    }))
  };
}
function readShiftJISString(buf, offset) {
  let text = "";
  let i = offset;
  while (i < buf.length) {
    const b = buf[i];
    if (b === 0) {
      i++;
      break;
    }
    if (b >= 32 && b <= 126) {
      text += String.fromCharCode(b);
      i++;
    } else if (b >= 129 && b <= 159 || b >= 224 && b <= 239) {
      text += "?";
      i += 2;
    } else {
      i++;
    }
  }
  return { text: text.trim(), nextOff: i };
}
function emptyOPMVoice() {
  return {
    algorithm: 0,
    feedback: 0,
    pms: 0,
    ams: 0,
    operators: Array.from({ length: 4 }, () => ({
      dt1: 0,
      mul: 1,
      tl: 127,
      ks: 0,
      ar: 31,
      amsEn: 0,
      d1r: 0,
      dt2: 0,
      d2r: 0,
      d1l: 0,
      rr: 15
    }))
  };
}
function applyRegisterWrite(voice, reg, data, ch) {
  const chSlot = reg & 7;
  if (chSlot !== (ch & 7)) return;
  const baseReg = reg & 248;
  const opFromReg = (reg2) => {
    return reg2 >> 3 & 3;
  };
  if (baseReg === 32 || reg >= 32 && reg < 40) {
    voice.feedback = data >> 3 & 7;
    voice.algorithm = data & 7;
  } else if (reg >= 56 && reg < 64) {
    voice.pms = data >> 4 & 7;
    voice.ams = data & 3;
  } else if (reg >= 64 && reg < 96) {
    const op = opFromReg(reg);
    voice.operators[op].dt1 = data >> 4 & 7;
    voice.operators[op].mul = data & 15;
  } else if (reg >= 96 && reg < 128) {
    const op = opFromReg(reg);
    voice.operators[op].tl = data & 127;
  } else if (reg >= 128 && reg < 160) {
    const op = opFromReg(reg);
    voice.operators[op].ks = data >> 6 & 3;
    voice.operators[op].ar = data & 31;
  } else if (reg >= 160 && reg < 192) {
    const op = opFromReg(reg);
    voice.operators[op].amsEn = data >> 7 & 1;
    voice.operators[op].d1r = data & 31;
  } else if (reg >= 192 && reg < 224) {
    const op = opFromReg(reg);
    voice.operators[op].dt2 = data >> 6 & 3;
    voice.operators[op].d2r = data & 31;
  } else if (reg >= 224) {
    const op = opFromReg(reg);
    voice.operators[op].d1l = data >> 4 & 15;
    voice.operators[op].rr = data & 15;
  }
}
function parseChannel(buf, startOffset, endOffset, _dataBaseOffset, channelIdx) {
  const events = [];
  const voiceRegisters = /* @__PURE__ */ new Map();
  let pos = startOffset;
  let tick = 0;
  let currentVoice = 0;
  let currentVolume = 8;
  let loopTick = -1;
  let currentRegVoice = emptyOPMVoice();
  let lastVoiceFromRegs = -1;
  const repeatStack = [];
  const safeRead = () => {
    if (pos >= endOffset || pos >= buf.length) return 241;
    return buf[pos++];
  };
  const safeReadSigned16LE = () => {
    if (pos + 1 >= buf.length) {
      pos += 2;
      return 0;
    }
    const lo = buf[pos++];
    const hi = buf[pos++];
    const val = lo | hi << 8;
    return val >= 32768 ? val - 65536 : val;
  };
  let safety = 0;
  const MAX_COMMANDS = 5e5;
  while (pos < endOffset && pos < buf.length && safety++ < MAX_COMMANDS) {
    const cmd = safeRead();
    if (cmd <= 127) {
      tick += cmd + 1;
      continue;
    }
    if (cmd >= 128 && cmd <= 223) {
      if (cmd === 128) {
        const dur = safeRead();
        tick += dur + 1;
      } else {
        const noteVal = cmd - 128;
        const dur = safeRead();
        const midiNote = Math.max(1, Math.min(96, noteVal + 36));
        events.push({
          type: "note",
          tick,
          note: midiNote,
          duration: dur + 1,
          voice: currentVoice,
          volume: currentVolume
        });
        tick += dur + 1;
      }
      continue;
    }
    switch (cmd) {
      case 255: {
        const tempoVal = safeRead();
        events.push({ type: "tempo", tick, tempo: tempoVal });
        break;
      }
      case 254: {
        const reg = safeRead();
        const data = safeRead();
        applyRegisterWrite(currentRegVoice, reg, data, channelIdx & 7);
        if (reg >= 224) {
          const voiceClone = {
            algorithm: currentRegVoice.algorithm,
            feedback: currentRegVoice.feedback,
            pms: currentRegVoice.pms,
            ams: currentRegVoice.ams,
            operators: currentRegVoice.operators.map((op) => ({ ...op }))
          };
          lastVoiceFromRegs++;
          voiceRegisters.set(lastVoiceFromRegs, voiceClone);
        }
        break;
      }
      case 253: {
        currentVoice = safeRead();
        if (!voiceRegisters.has(currentVoice)) {
          voiceRegisters.set(currentVoice, emptyOPMVoice());
        }
        currentRegVoice = emptyOPMVoice();
        break;
      }
      case 252: {
        safeRead();
        break;
      }
      case 251: {
        currentVolume = safeRead() & 15;
        break;
      }
      case 250: {
        if (currentVolume > 0) currentVolume--;
        break;
      }
      case 249: {
        if (currentVolume < 15) currentVolume++;
        break;
      }
      case 248: {
        safeRead();
        break;
      }
      case 247: {
        safeRead();
        safeReadSigned16LE();
        break;
      }
      case 246: {
        const count = safeRead();
        const escOff = safeReadSigned16LE();
        repeatStack.push({
          startPos: pos,
          count: count - 1,
          escapeOffset: pos - 2 + escOff
          // relative to current position
        });
        break;
      }
      case 245: {
        if (repeatStack.length > 0) {
          const top = repeatStack[repeatStack.length - 1];
          if (top.count > 0) {
            top.count--;
            pos = top.startPos;
          } else {
            repeatStack.pop();
          }
        }
        break;
      }
      case 244: {
        if (repeatStack.length > 0) {
          const top = repeatStack[repeatStack.length - 1];
          if (top.count === 0) {
            pos = top.escapeOffset;
            repeatStack.pop();
          }
        }
        break;
      }
      case 243: {
        safeReadSigned16LE();
        break;
      }
      case 242: {
        safeRead();
        break;
      }
      case 241: {
        safeRead();
        safeRead();
        safeRead();
        safeRead();
        safeRead();
        break;
      }
      case 240: {
        break;
      }
      case 239: {
        safeRead();
        safeRead();
        safeRead();
        safeRead();
        safeRead();
        break;
      }
      case 238: {
        safeRead();
        break;
      }
      case 237: {
        safeRead();
        break;
      }
      case 236: {
        safeRead();
        break;
      }
      case 235: {
        safeRead();
        break;
      }
      case 234: {
        break;
      }
      case 233: {
        loopTick = tick;
        pos = endOffset;
        break;
      }
      default: {
        if (cmd >= 224 && cmd <= 232) {
          safeRead();
        }
        break;
      }
    }
  }
  return { events, totalTicks: tick, voiceRegisters, loopTick };
}
function opmVoiceToInstrument(voice, id, name) {
  const ops = voice.operators.map((op, i) => ({
    ...DEFAULT_FURNACE.operators[i],
    enabled: true,
    mult: op.mul,
    tl: op.tl,
    ar: op.ar,
    dr: op.d1r,
    d2r: op.d2r,
    sl: op.d1l,
    rr: op.rr,
    dt: op.dt1 > 3 ? -(op.dt1 & 3) : op.dt1,
    // DT1: 0-3 positive, 4-7 negative
    dt2: op.dt2,
    rs: op.ks,
    am: op.amsEn === 1
  }));
  const furnace = {
    ...DEFAULT_FURNACE,
    chipType: 33,
    // OPM
    algorithm: voice.algorithm,
    feedback: voice.feedback,
    fms: voice.pms,
    ams: voice.ams,
    ops: 4,
    operators: ops
  };
  return {
    id,
    name,
    type: "synth",
    synthType: "FurnaceOPM",
    furnace,
    effects: [],
    volume: 0,
    pan: 0
  };
}
function mdxTempoToBPM(tempoVal) {
  const divisor = 256 - (tempoVal & 255);
  if (divisor <= 0) return 120;
  const tickRate = 4e6 / (1024 * divisor);
  return Math.round(tickRate / 48 * 60);
}
const TICKS_PER_BEAT = 48;
const ROWS_PER_BEAT = 4;
const TICKS_PER_ROW = TICKS_PER_BEAT / ROWS_PER_BEAT;
const MAX_PATTERN_ROWS = 64;
const MAX_PATTERNS = 256;
function eventsToPatterns(channelResults, numChannels) {
  let bpm = 120;
  for (const ch of channelResults) {
    for (const ev of ch.events) {
      if (ev.type === "tempo") {
        bpm = mdxTempoToBPM(ev.tempo);
        break;
      }
    }
    if (bpm !== 120) break;
  }
  const maxTicks = Math.max(1, ...channelResults.map((c) => c.totalTicks));
  const totalRows = Math.min(
    MAX_PATTERN_ROWS * MAX_PATTERNS,
    Math.ceil(maxTicks / TICKS_PER_ROW)
  );
  const voiceToInst = /* @__PURE__ */ new Map();
  let nextInst = 1;
  for (const ch of channelResults) {
    for (const ev of ch.events) {
      if (ev.type === "note" && !voiceToInst.has(ev.voice)) {
        voiceToInst.set(ev.voice, nextInst++);
      }
    }
  }
  const numPatterns = Math.max(1, Math.ceil(totalRows / MAX_PATTERN_ROWS));
  const patterns = [];
  for (let p = 0; p < numPatterns && p < MAX_PATTERNS; p++) {
    const patRows = Math.min(MAX_PATTERN_ROWS, totalRows - p * MAX_PATTERN_ROWS);
    const pat = emptyPattern(`p${p}`, `Pattern ${p}`, numChannels, patRows);
    for (let chIdx = 0; chIdx < numChannels && chIdx < channelResults.length; chIdx++) {
      const chResult = channelResults[chIdx];
      for (const ev of chResult.events) {
        if (ev.type !== "note") continue;
        const row = Math.floor(ev.tick / TICKS_PER_ROW);
        const patIdx = Math.floor(row / MAX_PATTERN_ROWS);
        if (patIdx !== p) continue;
        const localRow = row - p * MAX_PATTERN_ROWS;
        if (localRow < 0 || localRow >= patRows) continue;
        const cell = pat.channels[chIdx].rows[localRow];
        if (cell.note === 0 && ev.note > 0) {
          cell.note = ev.note;
          cell.instrument = voiceToInst.get(ev.voice) ?? 1;
          if (ev.volume < 15) {
            cell.volume = 16 + Math.round(ev.volume * (64 / 15));
          }
        }
        const offRow = Math.floor((ev.tick + ev.duration) / TICKS_PER_ROW);
        const offPatIdx = Math.floor(offRow / MAX_PATTERN_ROWS);
        if (offPatIdx === p) {
          const offLocalRow = offRow - p * MAX_PATTERN_ROWS;
          if (offLocalRow > localRow && offLocalRow < patRows) {
            const offCell = pat.channels[chIdx].rows[offLocalRow];
            if (offCell.note === 0) {
              offCell.note = 97;
            }
          }
        }
      }
      for (const ev of chResult.events) {
        if (ev.type !== "tempo") continue;
        const row = Math.floor(ev.tick / TICKS_PER_ROW);
        const patIdx = Math.floor(row / MAX_PATTERN_ROWS);
        if (patIdx !== p) continue;
        const localRow = row - p * MAX_PATTERN_ROWS;
        if (localRow < 0 || localRow >= patRows) continue;
        if (chIdx === 0) {
          const cell = pat.channels[0].rows[localRow];
          const newBpm = Math.min(255, mdxTempoToBPM(ev.tempo));
          if (cell.effTyp === 0) {
            cell.effTyp = 15;
            cell.eff = newBpm;
          }
        }
      }
    }
    patterns.push(pat);
  }
  if (patterns.length === 0) {
    patterns.push(emptyPattern("p0", "Pattern 0", numChannels, 64));
  }
  return { patterns, bpm };
}
function parseHeader(buf) {
  const { text: title, nextOff: afterTitle } = readShiftJISString(buf, 0);
  let pdxFilename = "";
  let pos = afterTitle;
  while (pos < buf.length && buf[pos] !== 0) {
    if (buf[pos] >= 32 && buf[pos] <= 126) {
      pdxFilename += String.fromCharCode(buf[pos]);
    }
    pos++;
  }
  if (pos < buf.length && buf[pos] === 0) pos++;
  if (pos < buf.length && buf[pos] === 13) pos++;
  if (pos < buf.length && buf[pos] === 10) pos++;
  const toneDataOffset = pos;
  const offsets = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const maxChannels = Math.min(9, Math.floor((buf.length - pos) / 2));
  for (let i = 0; i < maxChannels; i++) {
    if (pos + 1 >= buf.length) break;
    const off = dv.getUint16(pos, true);
    offsets.push(off);
    pos += 2;
  }
  let numChannels = offsets.length;
  for (let n = offsets.length; n >= 1; n--) {
    const minValidOffset = n * 2;
    const allValid = offsets.slice(0, n).every((o) => o >= minValidOffset);
    if (allValid) {
      numChannels = n;
      break;
    }
  }
  return {
    title,
    pdxFilename: pdxFilename.trim(),
    toneDataOffset,
    channelOffsets: offsets.slice(0, numChannels),
    numChannels
  };
}
function parseMDXFile(buffer) {
  const buf = new Uint8Array(buffer);
  if (buf.length < 16) throw new Error("Buffer too small for MDX format");
  const header = parseHeader(buf);
  const { title, toneDataOffset, channelOffsets, numChannels } = header;
  const channelResults = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const startOff = toneDataOffset + channelOffsets[ch];
    const endOff = ch + 1 < numChannels ? toneDataOffset + channelOffsets[ch + 1] : buf.length;
    channelResults.push(parseChannel(buf, startOff, endOff, toneDataOffset, ch));
  }
  const allVoices = /* @__PURE__ */ new Map();
  for (const ch of channelResults) {
    for (const [voiceNum, voice] of ch.voiceRegisters) {
      if (!allVoices.has(voiceNum)) {
        allVoices.set(voiceNum, voice);
      }
    }
  }
  const { patterns, bpm } = eventsToPatterns(channelResults, numChannels);
  const instruments = [];
  const voiceNums = [...allVoices.keys()].sort((a, b) => a - b);
  const voiceToInstId = /* @__PURE__ */ new Map();
  for (let i = 0; i < voiceNums.length; i++) {
    const voiceNum = voiceNums[i];
    const voice = allVoices.get(voiceNum);
    const instId = i + 1;
    voiceToInstId.set(voiceNum, instId);
    instruments.push(opmVoiceToInstrument(voice, instId, `OPM Voice ${voiceNum}`));
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "OPM FM",
      type: "synth",
      synthType: "FurnaceOPM",
      furnace: { ...DEFAULT_FURNACE, chipType: 33, ops: 4 },
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  if (numChannels > 8) {
    instruments.push({
      id: instruments.length + 1,
      name: "ADPCM",
      type: "synth",
      synthType: "FurnaceOPM",
      // closest available
      furnace: { ...DEFAULT_FURNACE, chipType: 33, ops: 4 },
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const loopTick = Math.max(...channelResults.map((c) => c.loopTick));
  let restartPosition = 0;
  if (loopTick > 0) {
    const loopRow = Math.floor(loopTick / TICKS_PER_ROW);
    restartPosition = Math.min(
      patterns.length - 1,
      Math.floor(loopRow / MAX_PATTERN_ROWS)
    );
  }
  const songPositions = patterns.map((_, i) => i);
  return {
    name: title || "Untitled MDX",
    format: "MDX",
    patterns,
    instruments,
    songPositions,
    songLength: patterns.length,
    restartPosition,
    numChannels,
    initialSpeed: 6,
    initialBPM: bpm
  };
}
export {
  parseMDXFile
};
