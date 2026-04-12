import { c5 as registerVariableEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const KM_NOTE_OFFSET$1 = 36;
function reverseKMEffect(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0, empty: true };
  switch (effTyp) {
    case 0:
      if (eff === 0) return { cmd: 0, param: 0, empty: true };
      return { cmd: 11, param: eff, empty: false };
    case 1:
      return { cmd: 12, param: eff, empty: false };
    case 2:
      return { cmd: 13, param: eff, empty: false };
    case 3:
      return { cmd: 7, param: eff, empty: false };
    case 4:
      return { cmd: 9, param: eff, empty: false };
    case 5:
      return { cmd: 8, param: eff, empty: false };
    case 6:
      return { cmd: 10, param: eff, empty: false };
    case 7:
      return { cmd: 19, param: eff, empty: false };
    case 9:
      return { cmd: 6, param: eff, empty: false };
    case 10:
      return { cmd: 14, param: eff, empty: false };
    case 12:
      return { cmd: 0, param: eff, empty: false };
    case 14: {
      const subCmd = eff >> 4 & 15;
      const subParam = eff & 15;
      switch (subCmd) {
        case 1:
          return { cmd: 3, param: subParam, empty: false };
        // Fine slide up
        case 2:
          return { cmd: 4, param: subParam, empty: false };
        // Fine slide down
        case 5:
          return { cmd: 5, param: subParam, empty: false };
        // Set finetune
        case 9:
          return { cmd: 15, param: subParam, empty: false };
        // Retrig
        case 10:
          return { cmd: 1, param: subParam, empty: false };
        // Fine vol slide up
        case 11:
          return { cmd: 2, param: subParam, empty: false };
        // Fine vol slide down
        case 12:
          return { cmd: 17, param: subParam, empty: false };
        // Note cut
        default:
          return { cmd: 0, param: 0, empty: true };
      }
    }
    case 15:
      return { cmd: 18, param: eff, empty: false };
    default:
      return { cmd: 0, param: 0, empty: true };
  }
}
const karlMortonEncoder = {
  formatId: "karlMorton",
  encodePattern(rows) {
    const buf = [];
    for (let i = 0; i < rows.length; i++) {
      const cell = rows[i];
      if (!cell) {
        buf.push(0);
        buf.push(0);
        buf.push(0);
        buf.push(0);
        continue;
      }
      const xmNote = cell.note ?? 0;
      let kmNote = 0;
      if (xmNote > 0 && xmNote > KM_NOTE_OFFSET$1) {
        kmNote = Math.min(36, xmNote - KM_NOTE_OFFSET$1);
      }
      buf.push(kmNote & 127);
      const instr = (cell.instrument ?? 0) & 31;
      const { cmd, param, empty } = reverseKMEffect(cell.effTyp ?? 0, cell.eff ?? 0);
      if (empty) {
        buf.push(instr | 128);
      } else {
        buf.push(instr);
        buf.push(cmd & 255);
        buf.push(param & 255);
      }
    }
    return new Uint8Array(buf);
  }
};
registerVariableEncoder(karlMortonEncoder);
function u8(bytes, off) {
  return bytes[off] ?? 0;
}
function u16le(bytes, off) {
  return ((bytes[off] ?? 0) | (bytes[off + 1] ?? 0) << 8) >>> 0;
}
function u32le(bytes, off) {
  return ((bytes[off] ?? 0) | (bytes[off + 1] ?? 0) << 8 | (bytes[off + 2] ?? 0) << 16 | (bytes[off + 3] ?? 0) << 24) >>> 0;
}
function readString32(bytes, off) {
  let s = "";
  for (let i = 0; i < 32; i++) {
    const c = bytes[off + i] ?? 0;
    if (c === 0) break;
    if (c >= 32) s += String.fromCharCode(c);
  }
  return s.trim();
}
const ID_SONG = 1196314451;
const ID_SMPL = 1280331091;
const SMPL_HDR_SIZE = 40;
const SONG_FIXED_SIZE = 32 + 31 * 34 + 2 + 4 + 4 + 4;
const KM_PATTERN_LEN = 64;
const MAX_CHANNELS = 4;
const AMIGA_PAL_FREQ = 3546895;
const SAMPLE_RATE = 8287;
const MOD2XM_FINETUNE = [0, 16, 32, 48, 64, 80, 96, 112, -128, -112, -96, -80, -64, -48, -32, -16];
const KM_EFF_TRANS = [
  [12, 0],
  // 0  CMD_VOLUME
  [14, 160],
  // 1  CMD_MODCMDEX | 0xA0
  [14, 176],
  // 2  CMD_MODCMDEX | 0xB0
  [14, 16],
  // 3  CMD_MODCMDEX | 0x10
  [14, 32],
  // 4  CMD_MODCMDEX | 0x20
  [14, 80],
  // 5  CMD_MODCMDEX | 0x50
  [9, 0],
  // 6  CMD_OFFSET
  [3, 0],
  // 7  CMD_TONEPORTAMENTO
  [5, 0],
  // 8  CMD_TONEPORTAVOL
  [4, 0],
  // 9  CMD_VIBRATO
  [6, 0],
  // 10 CMD_VIBRATOVOL
  [0, 0],
  // 11 CMD_ARPEGGIO (arpeggio = 0x00 in XM notation)
  [1, 0],
  // 12 CMD_PORTAMENTOUP
  [2, 0],
  // 13 CMD_PORTAMENTODOWN
  [10, 0],
  // 14 CMD_VOLUMESLIDE
  [14, 144],
  // 15 CMD_MODCMDEX | 0x90
  [3, 255],
  // 16 CMD_TONEPORTAMENTO param=0xFF (slide to previous)
  [14, 192],
  // 17 CMD_MODCMDEX | 0xC0
  [15, 0],
  // 18 CMD_SPEED (param >= 0x20 → CMD_TEMPO)
  [7, 0]
  // 19 CMD_TREMOLO
];
const KM_NOTE_OFFSET = 49 - 13;
function isValidKMString32(bytes, off) {
  let nullFound = false;
  for (let i = 0; i < 32; i++) {
    const c = bytes[off + i] ?? 0;
    if (c > 0 && c < 32) return false;
    if (c === 0) nullFound = true;
    else if (nullFound) return false;
  }
  return nullFound;
}
function isKarlMortonFormat(bytes) {
  if (bytes.length < 8 + SONG_FIXED_SIZE + 8) return false;
  const id = u32le(bytes, 0);
  const length = u32le(bytes, 4);
  if (id !== ID_SONG) return false;
  if (length < 8 + SONG_FIXED_SIZE) return false;
  if (length > 262144) return false;
  const songBase = 8;
  const musicSize = u32le(bytes, songBase + 1092);
  const songHdrSize = 8 + SONG_FIXED_SIZE;
  if (length - songHdrSize !== musicSize) return false;
  const unknown = u16le(bytes, songBase + 1086);
  if (unknown !== 0) return false;
  const numChannels = u32le(bytes, songBase + 1088);
  if (numChannels < 1 || numChannels > 4) return false;
  if (!isValidKMString32(bytes, songBase)) return false;
  for (let i = 0; i < 31; i++) {
    const refBase = songBase + 32 + i * 34;
    const ft = u8(bytes, refBase + 32);
    const vol = u8(bytes, refBase + 33);
    if (ft > 15 || vol > 64) return false;
    if (!isValidKMString32(bytes, refBase)) return false;
  }
  return true;
}
function parseKarlMortonFile(bytes, filename) {
  try {
    return parseInternal(bytes, filename);
  } catch {
    return null;
  }
}
function parseInternal(bytes, filename) {
  var _a, _b, _c, _d, _e;
  if (!isKarlMortonFormat(bytes)) return null;
  const sampleChunks = [];
  const songChunks = [];
  let pos = 0;
  while (pos + 8 <= bytes.length) {
    const chunkId = u32le(bytes, pos);
    const chunkLen = u32le(bytes, pos + 4);
    if (chunkLen < 8) break;
    const payloadOff = pos + 8;
    const payloadLen = chunkLen - 8;
    if (chunkId === ID_SMPL) {
      if (payloadLen >= SMPL_HDR_SIZE) {
        const name = readString32(bytes, payloadOff);
        const loopStart = u32le(bytes, payloadOff + 32);
        const size = u32le(bytes, payloadOff + 36);
        if (isValidKMString32(bytes, payloadOff)) {
          sampleChunks.push({
            name,
            loopStart,
            size,
            dataOffset: payloadOff + SMPL_HDR_SIZE,
            headerOffset: payloadOff
          });
        }
      }
    } else if (chunkId === ID_SONG) {
      if (payloadLen >= SONG_FIXED_SIZE) {
        const name = readString32(bytes, payloadOff);
        const numChannels2 = u32le(bytes, payloadOff + 1088);
        const restartPos = u32le(bytes, payloadOff + 1092);
        const musicSize = u32le(bytes, payloadOff + 1096);
        const sampRefs = [];
        for (let i = 0; i < 31; i++) {
          const refBase = payloadOff + 32 + i * 34;
          const refName = readString32(bytes, refBase);
          const finetune = u8(bytes, refBase + 32);
          const volume = u8(bytes, refBase + 33);
          sampRefs.push({ name: refName, finetune, volume });
        }
        songChunks.push({
          name,
          samples: sampRefs,
          numChannels: Math.min(Math.max(numChannels2, 1), MAX_CHANNELS),
          restartPos,
          musicSize,
          musicOffset: payloadOff + SONG_FIXED_SIZE
        });
      }
    }
    pos += chunkLen;
  }
  if (songChunks.length === 0 || sampleChunks.length === 0) return null;
  const firstSong = songChunks[0];
  if (!firstSong) return null;
  const numChannels = firstSong.numChannels;
  const sampleNameToIdx = /* @__PURE__ */ new Map();
  for (let i = 0; i < sampleChunks.length; i++) {
    const s = sampleChunks[i];
    if (s && !sampleNameToIdx.has(s.name)) {
      sampleNameToIdx.set(s.name, i);
    }
  }
  const sampleMap = new Array(32).fill(-1);
  for (let i = 0; i < 31; i++) {
    const ref = firstSong.samples[i];
    if (!ref || ref.name === "") continue;
    const idx = sampleNameToIdx.get(ref.name);
    if (idx !== void 0) sampleMap[i + 1] = idx;
  }
  const musicEnd = firstSong.musicOffset + firstSong.musicSize;
  let musicPos = firstSong.musicOffset;
  const patterns = [];
  const orderList = [];
  let restartOrderIdx = 0;
  const chnStates = Array.from({ length: numChannels }, () => ({
    prevNote: 0,
    prevInstr: 0,
    prevEffTyp: 0,
    prevEff: 0,
    repeat: 0,
    repeatsLeft: 0
  }));
  let globalRepeatsLeft = 0;
  let patRows = Array.from(
    { length: numChannels },
    () => Array.from({ length: KM_PATTERN_LEN }, () => emptyCell())
  );
  let rowInPat = KM_PATTERN_LEN;
  let restartRow = 0;
  let restartPatternIdx = -1;
  function flushPattern() {
    const pat = patterns.length;
    const channels = patRows.map((rows, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch < 2 ? -50 : 50,
      // Amiga LRRL
      instrumentId: null,
      color: null,
      rows
    }));
    patterns.push({
      id: `pattern-${pat}`,
      name: `Pattern ${pat}`,
      length: KM_PATTERN_LEN,
      channels,
      importMetadata: {
        sourceFormat: "MUS",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: 0,
        originalInstrumentCount: sampleChunks.length
      }
    });
    orderList.push(pat);
  }
  while (globalRepeatsLeft > 0 || musicPos < musicEnd) {
    rowInPat++;
    if (rowInPat >= KM_PATTERN_LEN) {
      if (patterns.length > 0) ;
      flushPattern();
      patRows = Array.from(
        { length: numChannels },
        () => Array.from({ length: KM_PATTERN_LEN }, () => emptyCell())
      );
      rowInPat = 0;
    }
    for (let ch = 0; ch < numChannels; ch++) {
      const state = chnStates[ch];
      if (!state) continue;
      if (state.repeat > 0) {
        state.repeat--;
        globalRepeatsLeft--;
        const cell2 = (_a = patRows[ch]) == null ? void 0 : _a[rowInPat];
        if (cell2) {
          cell2.note = state.prevNote;
          cell2.instrument = state.prevInstr;
          cell2.effTyp = state.prevEffTyp;
          cell2.eff = state.prevEff;
        }
        continue;
      }
      if (musicPos >= musicEnd) continue;
      if (musicPos - firstSong.musicOffset === firstSong.restartPos) {
        restartOrderIdx = orderList.length - 1;
        restartRow = rowInPat;
        restartPatternIdx = patterns.length - 1;
      }
      const noteByte = u8(bytes, musicPos++);
      if (noteByte & 128) {
        state.repeat = noteByte & 127;
        globalRepeatsLeft += state.repeat;
        const cell2 = (_b = patRows[ch]) == null ? void 0 : _b[rowInPat];
        if (cell2) {
          cell2.note = state.prevNote;
          cell2.instrument = state.prevInstr;
          cell2.effTyp = state.prevEffTyp;
          cell2.eff = state.prevEff;
        }
        continue;
      }
      let xmNote = 0;
      if (noteByte > 0 && noteByte <= 36) {
        xmNote = noteByte + KM_NOTE_OFFSET;
      }
      if (musicPos >= musicEnd) continue;
      const instrByte = u8(bytes, musicPos++);
      const instrIdx = instrByte & 31;
      const reuseEff = !!(instrByte & 128);
      let effTyp = 0;
      let eff = 0;
      if (reuseEff) {
        effTyp = state.prevEffTyp;
        eff = state.prevEff;
      } else {
        if (musicPos + 2 > musicEnd) continue;
        const cmd = u8(bytes, musicPos++);
        const param = u8(bytes, musicPos++);
        if (cmd < KM_EFF_TRANS.length) {
          const [et, mask] = KM_EFF_TRANS[cmd] ?? [0, 0];
          effTyp = et;
          eff = mask ? mask | param & 15 : param;
          if (cmd === 18 && param >= 32) {
            effTyp = 15;
          }
        }
      }
      const globalSmpIdx = instrIdx > 0 ? sampleMap[instrIdx] : -1;
      const trackerInstr = globalSmpIdx >= 0 ? globalSmpIdx + 1 : 0;
      const cell = (_c = patRows[ch]) == null ? void 0 : _c[rowInPat];
      if (cell) {
        cell.note = xmNote;
        cell.instrument = trackerInstr;
        cell.effTyp = effTyp;
        cell.eff = eff;
      }
      state.prevNote = xmNote;
      state.prevInstr = trackerInstr;
      state.prevEffTyp = effTyp;
      state.prevEff = eff;
    }
  }
  if (rowInPat < KM_PATTERN_LEN - 1 || patterns.length === 0) {
    if (restartRow !== 0 && restartPatternIdx >= 0) {
      const lastPat = (_d = patRows[0]) == null ? void 0 : _d[rowInPat];
      if (lastPat) {
        lastPat.effTyp = 13;
        lastPat.eff = restartRow;
      }
    }
    flushPattern();
  }
  if (orderList.length === 0) return null;
  const instruments = [];
  for (let i = 0; i < sampleChunks.length; i++) {
    const sc = sampleChunks[i];
    if (!sc) continue;
    const id = i + 1;
    const name = sc.name || `Sample ${id}`;
    if (sc.size === 0 || sc.dataOffset + sc.size > bytes.length) {
      const kmSilentChipRam = {
        moduleBase: 0,
        moduleSize: bytes.length,
        instrBase: sc.headerOffset,
        instrSize: SMPL_HDR_SIZE + sc.size,
        sections: {}
      };
      const kmSilentInst = silentInstrument(id, name);
      kmSilentInst.uadeChipRam = kmSilentChipRam;
      instruments.push(kmSilentInst);
      continue;
    }
    const rawPcm = bytes.subarray(sc.dataOffset, sc.dataOffset + sc.size);
    const pcm8 = new Uint8Array(sc.size);
    for (let j = 0; j < sc.size; j++) {
      const s = rawPcm[j] ?? 0;
      pcm8[j] = (s < 128 ? s : s - 256) + 128 & 255;
    }
    let finetune = 0;
    let volume = 64;
    for (let s = 0; s < 31; s++) {
      const ref = firstSong.samples[s];
      if (ref && ref.name === sc.name) {
        const ft = ref.finetune & 15;
        finetune = MOD2XM_FINETUNE[ft] ?? 0;
        volume = Math.min(ref.volume, 64);
        break;
      }
    }
    const loopStart = sc.loopStart;
    const loopEnd = sc.size;
    const inst = createSamplerInstrument(
      id,
      name,
      pcm8,
      volume,
      SAMPLE_RATE,
      loopStart,
      loopEnd
    );
    if ((_e = inst.metadata) == null ? void 0 : _e.modPlayback) {
      inst.metadata.modPlayback.finetune = finetune;
      inst.metadata.modPlayback.periodMultiplier = AMIGA_PAL_FREQ;
    }
    inst.uadeChipRam = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase: sc.headerOffset,
      instrSize: SMPL_HDR_SIZE + sc.size,
      sections: {}
    };
    instruments.push(inst);
  }
  const songName = firstSong.name || filename.replace(/\.[^/.]+$/, "");
  const numFilePatterns = patterns.length * numChannels;
  const trackMap = [];
  const filePatternAddrs = [];
  const filePatternSizes = [];
  for (let p = 0; p < patterns.length; p++) {
    const chPats = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const filePatIdx = p * numChannels + ch;
      chPats.push(filePatIdx);
      filePatternAddrs.push(firstSong.musicOffset + filePatIdx);
      filePatternSizes.push(KM_PATTERN_LEN * 5);
    }
    trackMap.push(chPats);
  }
  const variableLayout = {
    formatId: "karlMorton",
    numChannels,
    numFilePatterns,
    rowsPerPattern: KM_PATTERN_LEN,
    moduleSize: bytes.length,
    encoder: karlMortonEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: songName,
    format: "MOD",
    patterns,
    instruments,
    songPositions: orderList,
    songLength: orderList.length,
    restartPosition: restartOrderIdx >= 0 ? restartOrderIdx : 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeVariableLayout: variableLayout
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
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
  isKarlMortonFormat,
  parseKarlMortonFile
};
