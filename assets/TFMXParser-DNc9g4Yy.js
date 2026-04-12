import { e as encodeTFMXCell } from "./TFMXEncoder-CCEY1ckI.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const TFMX_MIN_SIZE = 512;
const TFMX_SONG_SLOTS = 32;
const TFMX_TRACKSTEP_UNPACKED = 2048;
const TFMX_PATTERN_PTR_UNPACKED = 1024;
const TFMX_MACRO_PTR_UNPACKED = 1536;
const TFMX_TRACKSTEP_ENTRY_SIZE = 16;
const TFMX_TRACK_END = 255;
const TFMX_TRACK_HOLD = 128;
const NUM_CHANNELS = 8;
const MAX_PATTERN_POINTERS = 128;
const MAX_COMMANDS_PER_PATTERN = 512;
function u16BE(buf, off) {
  if (off + 1 >= buf.length) return 0;
  return buf[off] << 8 | buf[off + 1];
}
function u32BE(buf, off) {
  if (off + 3 >= buf.length) return 0;
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function findTFMXMagic(buf) {
  const limit = Math.min(512, buf.length - 10);
  for (let i = 0; i < limit; i++) {
    const b0 = buf[i];
    if (b0 !== 84 && b0 !== 116) continue;
    if (buf[i] === 84 && buf[i + 1] === 70 && buf[i + 2] === 77 && buf[i + 3] === 88 && buf[i + 4] === 45 && buf[i + 5] === 83 && buf[i + 6] === 79 && buf[i + 7] === 78 && buf[i + 8] === 71 && buf[i + 9] === 32) return i;
    if (buf[i] === 84 && buf[i + 1] === 70 && buf[i + 2] === 77 && buf[i + 3] === 88 && buf[i + 4] === 95 && buf[i + 5] === 83 && buf[i + 6] === 79 && buf[i + 7] === 78 && buf[i + 8] === 71) return i;
    if (buf[i] === 116 && buf[i + 1] === 102 && buf[i + 2] === 109 && buf[i + 3] === 120 && buf[i + 4] === 115 && buf[i + 5] === 111 && buf[i + 6] === 110 && buf[i + 7] === 103) return i;
    if (buf[i] === 84 && buf[i + 1] === 70 && buf[i + 2] === 77 && buf[i + 3] === 88 && buf[i + 4] === 32 && buf[i + 8] !== 71 && !(buf[i + 5] === 83 && buf[i + 6] === 79 && buf[i + 7] === 78)) return i;
  }
  return -1;
}
function isTFMXFile(buffer) {
  return findTFMXMagic(new Uint8Array(buffer)) >= 0;
}
function tfmxNoteToXM(noteIdx) {
  return Math.max(1, Math.min(96, (noteIdx & 63) + 13));
}
const MAX_MACRO_COMMANDS = 256;
function decodeTFMXMacro(buf, macroOffset, macroIndex) {
  const commands = [];
  let pos = macroOffset;
  for (let step = 0; step < MAX_MACRO_COMMANDS; step++) {
    if (pos + 4 > buf.length) break;
    const b0 = buf[pos];
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    const b3 = buf[pos + 3];
    const opcode = b0 & 63;
    const flags = b0 & 192;
    const raw = b0 << 24 | b1 << 16 | b2 << 8 | b3;
    commands.push({
      step,
      raw: raw >>> 0,
      fileOffset: pos,
      byte0: b0,
      byte1: b1,
      byte2: b2,
      byte3: b3,
      opcode,
      flags
    });
    pos += 4;
    if (opcode === 7) break;
  }
  return {
    index: macroIndex,
    fileOffset: macroOffset,
    length: commands.length,
    commands,
    name: `Macro ${macroIndex + 1}`
  };
}
function decodeTFMXPattern(buf, patDataOffset) {
  const commands = [];
  let pos = patDataOffset;
  for (let i = 0; i < MAX_COMMANDS_PER_PATTERN; i++) {
    if (pos + 4 > buf.length) break;
    const b0 = buf[pos];
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    const b3 = buf[pos + 3];
    const fileOffset = pos;
    pos += 4;
    if (b0 >= 240) {
      const cmdType = b0 & 15;
      if (cmdType === 0) {
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
          fileOffset
        });
        break;
      }
      if (cmdType === 4) {
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
          fileOffset
        });
        break;
      }
      if (cmdType === 3) {
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 15, eff: b1 + 1 & 255, effTyp2: 0, eff2: 0 },
          fileOffset
        });
        continue;
      }
      if (cmdType === 5) {
        commands.push({
          cell: { note: 97, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 },
          fileOffset
        });
        continue;
      }
      if (cmdType === 6) {
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 4, eff: (b1 & 15) << 4 | b3 & 15, effTyp2: 0, eff2: 0 },
          fileOffset
        });
        continue;
      }
      if (cmdType === 7) {
        commands.push({
          cell: { note: 0, instrument: 0, volume: 0, effTyp: 10, eff: b3, effTyp2: 0, eff2: 0 },
          fileOffset
        });
        continue;
      }
      commands.push({
        cell: { note: 0, instrument: 0, volume: 0, effTyp: cmdType, eff: b1, effTyp2: 0, eff2: 0 },
        fileOffset
      });
      continue;
    }
    if (b0 < 192) {
      const noteIdx2 = b0 & 63;
      const xmNote2 = tfmxNoteToXM(noteIdx2);
      const macro = b1;
      const relVol = b2 >> 4 & 15;
      const hasWait = (b0 & 128) !== 0;
      const waitOrDetune = b3;
      commands.push({
        cell: {
          note: xmNote2,
          instrument: macro + 1,
          // 1-based
          volume: relVol * 4,
          // 0-15 -> 0-60 (approx mapping to 0-64 range)
          effTyp: hasWait ? 15 : 0,
          // speed effect for wait value
          eff: hasWait ? waitOrDetune : 0,
          effTyp2: !hasWait && waitOrDetune !== 0 ? 14 : 0,
          // detune as fine effect
          eff2: !hasWait ? waitOrDetune : 0
        },
        fileOffset
      });
      continue;
    }
    const noteIdx = b0 & 63;
    const xmNote = tfmxNoteToXM(noteIdx);
    commands.push({
      cell: {
        note: xmNote,
        instrument: b1 > 0 ? b1 + 1 : 0,
        volume: (b2 >> 4 & 15) * 4,
        effTyp: 3,
        // portamento
        eff: b3,
        effTyp2: 0,
        eff2: 0
      },
      fileOffset
    });
  }
  return commands;
}
function decodeTFMXPatternNative(buf, patDataOffset) {
  const commands = [];
  let pos = patDataOffset;
  for (let i = 0; i < MAX_COMMANDS_PER_PATTERN; i++) {
    if (pos + 4 > buf.length) break;
    const b0 = buf[pos];
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    const b3 = buf[pos + 3];
    const fileOffset = pos;
    const raw = (b0 << 24 | b1 << 16 | b2 << 8 | b3) >>> 0;
    pos += 4;
    const base = { raw, fileOffset, byte0: b0, byte1: b1, byte2: b2, byte3: b3 };
    if (b0 >= 240) {
      const cmdNibble = b0 & 15;
      const typeMap = {
        0: "end",
        1: "loop",
        2: "jump",
        3: "wait",
        4: "stop",
        5: "keyup",
        6: "vibrato",
        7: "envelope"
      };
      const type = typeMap[cmdNibble] ?? "command";
      const cmd = {
        ...base,
        type,
        commandCode: cmdNibble,
        commandParam: b1
      };
      if (type === "wait") cmd.wait = b1 + 1;
      if (type === "vibrato") {
        cmd.commandParam = b1 << 8 | b3;
      }
      if (type === "envelope") {
        cmd.commandParam = b1 << 8 | b3;
      }
      commands.push(cmd);
      if (type === "end" || type === "stop") break;
      continue;
    }
    if (b0 < 192) {
      const hasWait = (b0 & 128) !== 0;
      const noteIdx2 = b0 & 63;
      const macro = b1;
      const relVol = b2 >> 4 & 15;
      commands.push({
        ...base,
        type: hasWait ? "noteWait" : "note",
        note: noteIdx2,
        macro,
        relVol,
        wait: hasWait ? b3 + 1 : void 0,
        detune: hasWait ? void 0 : b3
      });
      continue;
    }
    const noteIdx = b0 & 63;
    commands.push({
      ...base,
      type: "portamento",
      note: noteIdx,
      macro: b1 > 0 ? b1 : void 0,
      relVol: b2 >> 4 & 15,
      commandParam: b3
    });
  }
  return commands;
}
function parseTFMXFile(buffer, filename, subsong = 0) {
  var _a, _b;
  const buf = new Uint8Array(buffer);
  const h = findTFMXMagic(buf);
  if (h < 0) throw new Error("[TFMXParser] Not a TFMX file (no magic found)");
  if (buf.length < TFMX_MIN_SIZE) {
    throw new Error("[TFMXParser] File too small to be a valid TFMX module");
  }
  const songStarts = [];
  const songEnds = [];
  const songTempos = [];
  for (let i = 0; i < TFMX_SONG_SLOTS; i++) {
    songStarts.push(u16BE(buf, h + 256 + i * 2));
    songEnds.push(u16BE(buf, h + 320 + i * 2));
    songTempos.push(u16BE(buf, h + 384 + i * 2));
  }
  let trackstepOff = u32BE(buf, h + 464);
  let patPtrTable = u32BE(buf, h + 468);
  let macroPtrTable = u32BE(buf, h + 472);
  if (trackstepOff === 0) trackstepOff = h + TFMX_TRACKSTEP_UNPACKED;
  if (patPtrTable === 0) patPtrTable = h + TFMX_PATTERN_PTR_UNPACKED;
  if (macroPtrTable === 0) macroPtrTable = h + TFMX_MACRO_PTR_UNPACKED;
  const numPatternSlots = Math.min(
    Math.floor((macroPtrTable - patPtrTable) / 4),
    MAX_PATTERN_POINTERS
  );
  const patternPointers = [];
  for (let i = 0; i < numPatternSlots; i++) {
    const raw = u32BE(buf, patPtrTable + i * 4);
    patternPointers.push(raw);
  }
  const decodedPatterns = [];
  const nativePatterns = [];
  for (let i = 0; i < patternPointers.length; i++) {
    const ptr = patternPointers[i];
    if (ptr === 0 || ptr >= buf.length) {
      decodedPatterns.push([]);
      nativePatterns.push([]);
      continue;
    }
    decodedPatterns.push(decodeTFMXPattern(buf, ptr));
    nativePatterns.push(decodeTFMXPatternNative(buf, ptr));
  }
  const textLines = [];
  for (let line = 0; line < 6; line++) {
    const lineOff = h + 16 + line * 40;
    let text = "";
    for (let c = 0; c < 40 && lineOff + c < buf.length; c++) {
      const ch = buf[lineOff + c];
      text += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : " ";
    }
    textLines.push(text.trimEnd());
  }
  const clampedSong = Math.max(0, Math.min(TFMX_SONG_SLOTS - 1, subsong));
  let firstStep = songStarts[clampedSong];
  let lastStep = songEnds[clampedSong];
  const tempo = songTempos[clampedSong];
  if (firstStep > lastStep || firstStep > 16383 || lastStep > 16383) {
    firstStep = 0;
    lastStep = 0;
  }
  const nativeTracksteps = [];
  for (let stepIdx = firstStep; stepIdx <= lastStep; stepIdx++) {
    const stepOff = trackstepOff + stepIdx * TFMX_TRACKSTEP_ENTRY_SIZE;
    if (stepOff + TFMX_TRACKSTEP_ENTRY_SIZE > buf.length) break;
    const firstWord = buf[stepOff] << 8 | buf[stepOff + 1];
    if (firstWord === 61438) {
      const cmd = buf[stepOff + 2] << 8 | buf[stepOff + 3];
      const param = buf[stepOff + 4] << 8 | buf[stepOff + 5];
      nativeTracksteps.push({
        stepIndex: stepIdx,
        voices: [],
        isEFFE: true,
        effeCommand: cmd,
        effeParam: param
      });
      if (cmd === 0) break;
      continue;
    }
    const voices = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const hi = buf[stepOff + ch * 2];
      const lo = buf[stepOff + ch * 2 + 1];
      voices.push({
        patternNum: hi === TFMX_TRACK_END || hi >= 254 || hi === TFMX_TRACK_HOLD ? -1 : hi,
        transpose: lo > 127 ? lo - 256 : lo,
        // signed byte
        isHold: hi === TFMX_TRACK_HOLD,
        isStop: hi === TFMX_TRACK_END || hi >= 254
      });
    }
    nativeTracksteps.push({
      stepIndex: stepIdx,
      voices,
      isEFFE: false
    });
  }
  const trackerPatterns = [];
  const channelOffsetMaps = [];
  for (let stepIdx = firstStep; stepIdx <= lastStep; stepIdx++) {
    const stepOff = trackstepOff + stepIdx * TFMX_TRACKSTEP_ENTRY_SIZE;
    if (stepOff + TFMX_TRACKSTEP_ENTRY_SIZE > buf.length) break;
    const firstWord = buf[stepOff] << 8 | buf[stepOff + 1];
    if (firstWord === 61438) {
      const cmd = buf[stepOff + 2] << 8 | buf[stepOff + 3];
      if (cmd === 0) break;
      continue;
    }
    const voicePatNums = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const hi = buf[stepOff + ch * 2];
      if (hi === TFMX_TRACK_END || hi >= 254) {
        voicePatNums.push(-1);
      } else if (hi === TFMX_TRACK_HOLD) {
        voicePatNums.push(-1);
      } else {
        voicePatNums.push(hi);
      }
    }
    if (voicePatNums.every((v) => v === -1)) continue;
    const channelCommands = [];
    let maxRows = 0;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const patNum = voicePatNums[ch] ?? -1;
      if (patNum >= 0 && patNum < decodedPatterns.length && decodedPatterns[patNum].length > 0) {
        channelCommands.push(decodedPatterns[patNum]);
        maxRows = Math.max(maxRows, decodedPatterns[patNum].length);
      } else {
        channelCommands.push([]);
      }
    }
    if (maxRows === 0) maxRows = 1;
    const channelRows = Array.from({ length: NUM_CHANNELS }, () => []);
    const offsetMap = Array.from({ length: NUM_CHANNELS }, () => []);
    for (let row = 0; row < maxRows; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cmds = channelCommands[ch];
        if (row < cmds.length) {
          channelRows[ch].push(cmds[row].cell);
          offsetMap[ch].push(cmds[row].fileOffset);
        } else {
          channelRows[ch].push({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          });
          offsetMap[ch].push(-1);
        }
      }
    }
    channelOffsetMaps.push(offsetMap);
    trackerPatterns.push({
      id: `pattern-${trackerPatterns.length}`,
      name: `Pattern ${trackerPatterns.length + 1}`,
      length: maxRows,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: [-50, 50, 50, -50, -50, 50, 50, -50][ch] ?? 0,
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "TFMX",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: patternPointers.length,
        originalInstrumentCount: 0
      }
    });
  }
  if (trackerPatterns.length === 0) {
    const emptyRows = [{
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    }];
    channelOffsetMaps.push(Array.from({ length: NUM_CHANNELS }, () => [-1]));
    trackerPatterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: 1,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: [-50, 50, 50, -50, -50, 50, 50, -50][ch] ?? 0,
        instrumentId: null,
        color: null,
        rows: [...emptyRows]
      })),
      importMetadata: {
        sourceFormat: "TFMX",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: 0,
        originalInstrumentCount: 0
      }
    });
  }
  const tfmxTimingTable = [];
  let cumulativeJiffies = 0;
  for (let patIdx = 0; patIdx < trackerPatterns.length; patIdx++) {
    const pat = trackerPatterns[patIdx];
    const numRows = ((_a = pat.channels[0]) == null ? void 0 : _a.rows.length) ?? 0;
    for (let row = 0; row < numRows; row++) {
      tfmxTimingTable.push({ patternIndex: patIdx, row, cumulativeJiffies });
      const offsetMap = (_b = channelOffsetMaps[patIdx]) == null ? void 0 : _b[0];
      if (offsetMap && row < offsetMap.length && offsetMap[row] >= 0) {
        const cmdOff = offsetMap[row];
        if (cmdOff >= 0 && cmdOff + 3 < buf.length) {
          const b0 = buf[cmdOff];
          const b1 = buf[cmdOff + 1];
          const b3 = buf[cmdOff + 3];
          if (b0 >= 240 && (b0 & 15) === 3) {
            cumulativeJiffies += b1 + 1;
          } else if (b0 >= 128 && b0 < 192) {
            cumulativeJiffies += b3 + 1;
          } else {
            cumulativeJiffies += 1;
          }
        } else {
          cumulativeJiffies += 1;
        }
      } else {
        cumulativeJiffies += 1;
      }
    }
  }
  let initialBPM = 125;
  let initialSpeed = 6;
  if (tempo > 15) {
    initialBPM = Math.round(tempo * 2.5 / 24) || 125;
  } else if (tempo > 0) {
    initialBPM = 125;
    initialSpeed = Math.max(3, Math.min(8, tempo + 1));
  }
  const instruments = [];
  const macros = [];
  const MAX_INSTRUMENTS = 128;
  const MACRO_ENTRY_SIZE = 4;
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const ptrOff = macroPtrTable + i * MACRO_ENTRY_SIZE;
    if (ptrOff + MACRO_ENTRY_SIZE > buf.length) break;
    const macroAddr = u32BE(buf, ptrOff);
    if (macroAddr === 0 || macroAddr >= buf.length) continue;
    if (macroAddr >= 4278190080) break;
    if ((macroAddr & 3) !== 0) break;
    const macroDataSize = 64;
    const volModSeqData = new Uint8Array(macroDataSize);
    const sndModSeqData = new Uint8Array(macroDataSize);
    const maxRead = Math.min(macroDataSize, buf.length - macroAddr);
    for (let b = 0; b < maxRead; b++) volModSeqData[b] = buf[macroAddr + b];
    let nonZero = false;
    for (let b = 0; b < maxRead; b++) {
      if (volModSeqData[b] !== 0) {
        nonZero = true;
        break;
      }
    }
    if (!nonZero) continue;
    macros.push(decodeTFMXMacro(buf, macroAddr, i));
    const tfmxConfig = {
      sndSeqsCount: 1,
      sndModSeqData,
      volModSeqData,
      sampleCount: 0,
      sampleHeaders: new Uint8Array(0),
      sampleData: new Uint8Array(0)
    };
    const uadeChipRam = {
      moduleBase: 0,
      moduleSize: buf.length,
      instrBase: macroAddr,
      instrSize: macroDataSize,
      sections: {
        macroPtrTable,
        patPtrTable
      }
    };
    instruments.push({
      id: i + 1,
      name: `Macro ${i + 1}`,
      type: "synth",
      synthType: "TFMXSynth",
      tfmx: tfmxConfig,
      uadeChipRam,
      effects: [],
      volume: 64,
      pan: 0,
      // Index into tfmxNative.macros for the macro editor
      metadata: { tfmxMacroIndex: i }
    });
  }
  const uadePatternLayout = {
    formatId: "tfmx",
    patternDataFileOffset: patPtrTable,
    // not used directly (getCellFileOffset overrides)
    bytesPerCell: 4,
    rowsPerPattern: 1,
    // variable per pattern
    numChannels: NUM_CHANNELS,
    numPatterns: trackerPatterns.length,
    moduleSize: buf.length,
    encodeCell: encodeTFMXCell,
    getCellFileOffset: (pattern, row, channel) => {
      if (pattern < 0 || pattern >= channelOffsetMaps.length) return -1;
      const map = channelOffsetMaps[pattern];
      if (channel < 0 || channel >= map.length) return -1;
      const offsets = map[channel];
      if (row < 0 || row >= offsets.length) return -1;
      return offsets[row];
    }
  };
  const songName = (() => {
    const base = filename.split("/").pop() ?? filename;
    const lower = base.toLowerCase();
    for (const prefix of ["mdat.", "tfmx.", "tfx."]) {
      if (lower.startsWith(prefix)) return base.slice(prefix.length);
    }
    return base.replace(/\.[^/.]+$/, "");
  })();
  const tfmxNative = {
    songName,
    textLines,
    songStarts,
    songEnds,
    songTempos,
    tracksteps: nativeTracksteps,
    patterns: nativePatterns,
    patternPointers,
    numVoices: NUM_CHANNELS,
    activeSubsong: clampedSong,
    firstStep,
    lastStep,
    macros,
    macroPointerTableOffset: macroPtrTable
  };
  return {
    name: songName,
    format: "MOD",
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadePatternLayout,
    tfmxTimingTable,
    tfmxNative
  };
}
export {
  isTFMXFile,
  parseTFMXFile
};
