import { b$ as registerPatternEncoder, c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeSoundFactoryCell(cell) {
  const out = new Uint8Array(3);
  const xmNote = cell.note ?? 0;
  if (xmNote > 0 && xmNote <= 96) {
    const noteByte = xmNote - 13;
    if (noteByte >= 0 && noteByte <= 127) {
      out[0] = noteByte;
    } else {
      out[0] = 0;
    }
    out[1] = 0;
    out[2] = 1;
  } else {
    out[0] = 128;
    out[1] = 0;
    out[2] = 1;
  }
  return out;
}
registerPatternEncoder("soundFactory", () => encodeSoundFactoryCell);
const HEADER_SIZE = 276;
const PAL_CLOCK = 3546895;
const Op = {
  Pause: 128,
  SetVolume: 129,
  SetFineTune: 130,
  UseInstrument: 131,
  DefineInstrument: 132,
  Return: 133,
  GoSub: 134,
  Goto: 135,
  For: 136,
  Next: 137,
  FadeOut: 138,
  Nop: 139,
  Request: 140,
  Loop: 141,
  End: 142,
  FadeIn: 143,
  SetAdsr: 144,
  OneShot: 145,
  Looping: 146,
  Vibrato: 147,
  Arpeggio: 148,
  Phasing: 149,
  Portamento: 150,
  Tremolo: 151,
  Filter: 152,
  StopAndPause: 153,
  Led: 154,
  WaitForRequest: 155,
  SetTranspose: 156
};
function u8(buf, off) {
  return buf[off];
}
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function s32BE(buf, off) {
  const v = buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3];
  return v | 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function periodToFreq(period) {
  if (period <= 0) return 8287;
  return Math.round(PAL_CLOCK / (2 * period));
}
function psfNoteToXm(noteByte) {
  if (noteByte > 127) return 0;
  const xmNote = noteByte + 13;
  return Math.max(1, Math.min(96, xmNote));
}
function isSoundFactoryFormat(bytes) {
  if (bytes.length < HEADER_SIZE) return false;
  const moduleLength = u32BE(bytes, 0);
  if (moduleLength > bytes.length) return false;
  for (let i = 0; i < 16; i++) {
    if (u8(bytes, 4 + i) > 15) return false;
  }
  let minOffset = 4294967295;
  for (let i = 0; i < 4 * 16; i++) {
    const offset = u32BE(bytes, 20 + i * 4);
    if (offset > bytes.length) return false;
    if (offset > 0 && offset < minOffset) minOffset = offset;
  }
  if (minOffset !== HEADER_SIZE) return false;
  return true;
}
function findInstruments(opcodes, startOffset, visitedOffsets, instruments) {
  let offset = startOffset;
  const maxOffset = opcodes.length;
  while (offset < maxOffset) {
    if (visitedOffsets.has(offset)) return;
    visitedOffsets.add(offset);
    const opcode = u8(opcodes, offset++);
    if (opcode < 128) {
      offset += 2;
      continue;
    }
    switch (opcode) {
      case Op.Next:
      case Op.Nop:
      case Op.Request:
      case Op.OneShot:
      case Op.Looping:
        break;
      case Op.SetVolume:
      case Op.SetFineTune:
      case Op.UseInstrument:
      case Op.For:
      case Op.FadeOut:
      case Op.FadeIn:
      case Op.Led:
      case Op.WaitForRequest:
      case Op.SetTranspose:
        offset += 1;
        break;
      case Op.Pause:
      case Op.StopAndPause:
        offset += 2;
        break;
      case Op.Portamento:
      case Op.Tremolo:
      case Op.Filter: {
        if (offset >= maxOffset) return;
        const enable = u8(opcodes, offset++) !== 0;
        if (enable) offset += 3;
        break;
      }
      case Op.Arpeggio: {
        if (offset >= maxOffset) return;
        const enable = u8(opcodes, offset++) !== 0;
        if (enable) offset += 1;
        break;
      }
      case Op.Vibrato:
      case Op.Phasing: {
        if (offset >= maxOffset) return;
        const enable = u8(opcodes, offset++) !== 0;
        if (enable) offset += 4;
        break;
      }
      case Op.SetAdsr: {
        if (offset + 3 >= maxOffset) return;
        offset += 3;
        const releaseEnabled = u8(opcodes, offset++) !== 0;
        if (releaseEnabled) offset += 1;
        break;
      }
      case Op.DefineInstrument: {
        if (offset + 3 > maxOffset) return;
        offset++;
        const wordCount = u16BE(opcodes, offset);
        offset += 2;
        const instrOffset = offset;
        if (!instruments.has(instrOffset) && instrOffset + 4 <= maxOffset) {
          const instr = fetchInstrument(opcodes, instrOffset);
          instruments.set(instrOffset, instr);
        }
        const remaining = wordCount * 2 - 4;
        if (remaining > 0) offset += remaining;
        break;
      }
      case Op.Return:
        return;
      case Op.GoSub: {
        if (offset + 4 > maxOffset) return;
        const rel = s32BE(opcodes, offset);
        offset += 4;
        const target = offset + rel >>> 0;
        if (target < maxOffset && !visitedOffsets.has(target)) {
          findInstruments(opcodes, target, visitedOffsets, instruments);
        }
        break;
      }
      case Op.Goto: {
        if (offset + 4 > maxOffset) return;
        const rel = s32BE(opcodes, offset);
        offset += 4;
        offset = offset + rel >>> 0;
        if (visitedOffsets.has(offset)) return;
        break;
      }
      case Op.Loop:
      case Op.End:
        return;
    }
  }
}
function fetchInstrument(opcodes, offset) {
  let off = offset;
  const maxOff = opcodes.length;
  const sampleLength = off + 2 <= maxOff ? u16BE(opcodes, off) : 0;
  off += 2;
  const samplingPeriod = off + 2 <= maxOff ? u16BE(opcodes, off) : 0;
  off += 2;
  const effectByte = off < maxOff ? u8(opcodes, off++) : 0;
  off += 3;
  off += 4;
  off += 4;
  off += 4;
  off += 4;
  off += 2;
  off += 3;
  off += 1;
  off += 4;
  const dataLen = sampleLength * 2;
  let sampleData;
  if (dataLen > 0 && off + dataLen <= maxOff) {
    sampleData = new Int8Array(dataLen);
    for (let i = 0; i < dataLen; i++) {
      sampleData[i] = opcodes[off + i] < 128 ? opcodes[off + i] : opcodes[off + i] - 256;
    }
  } else {
    sampleData = new Int8Array(0);
  }
  return { offset, sampleLength, samplingPeriod, effectByte, sampleData, name: "" };
}
function parseSoundFactoryFile(bytes, filename) {
  if (!isSoundFactoryFormat(bytes)) return null;
  const moduleLength = u32BE(bytes, 0);
  const songInfoList = [];
  const voiceCounts = [];
  for (let i = 0; i < 16; i++) {
    voiceCounts.push(u8(bytes, 4 + i));
  }
  const rawOffsets = [];
  for (let i = 0; i < 16; i++) {
    const row = [];
    for (let ch = 0; ch < 4; ch++) {
      row.push(u32BE(bytes, 20 + (i * 4 + ch) * 4));
    }
    rawOffsets.push(row);
  }
  let offsetIdx = 0;
  for (let i = 0; i < 16; i++) {
    const ch = voiceCounts[i];
    if (ch === 0) {
      offsetIdx++;
      continue;
    }
    const row = rawOffsets[offsetIdx++];
    const relOffsets = row.map((o) => o > 0 ? o - HEADER_SIZE : 0);
    songInfoList.push({
      enabledChannels: ch,
      opcodeStartOffsets: relOffsets
    });
  }
  if (songInfoList.length === 0) return null;
  const opcodeLen = moduleLength > HEADER_SIZE ? moduleLength - HEADER_SIZE : 0;
  if (opcodeLen === 0 || HEADER_SIZE + opcodeLen > bytes.length) return null;
  const opcodes = bytes.slice(HEADER_SIZE, HEADER_SIZE + opcodeLen);
  const instruments = /* @__PURE__ */ new Map();
  const visitedOffsets = /* @__PURE__ */ new Set();
  for (const song of songInfoList) {
    for (let ch = 0; ch < 4; ch++) {
      const startOffset = song.opcodeStartOffsets[ch];
      if (startOffset < opcodeLen) {
        findInstruments(opcodes, startOffset, visitedOffsets, instruments);
      }
    }
  }
  const instrArray = [];
  const instrOffsetToId = /* @__PURE__ */ new Map();
  let instrIdCounter = 1;
  for (const [offset, instr] of instruments) {
    instrArray.push(instr);
    instrOffsetToId.set(offset, instrIdCounter++);
  }
  const instrConfigs = [];
  for (let idx = 0; idx < instrArray.length; idx++) {
    const instr = instrArray[idx];
    const id = idx + 1;
    const isOneShot = (instr.effectByte & 1) !== 0;
    if (instr.sampleData.length > 0) {
      const rawPcm = new Uint8Array(instr.sampleData.length);
      for (let i = 0; i < instr.sampleData.length; i++) {
        rawPcm[i] = instr.sampleData[i] + 128 & 255;
      }
      const c3Rate = instr.samplingPeriod > 0 ? periodToFreq(instr.samplingPeriod) : periodToFreq(214);
      const loopStart = isOneShot ? 0 : 0;
      const loopEnd = isOneShot ? 0 : rawPcm.length;
      instrConfigs.push(
        createSamplerInstrument(id, `Instrument ${id}`, rawPcm, 64, c3Rate, loopStart, loopEnd)
      );
    } else {
      instrConfigs.push({
        id,
        name: `Instrument ${id}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  function extractNotesFromVoice(startOffset) {
    const events = [];
    let offset = startOffset;
    let currentInstrId = 0;
    let currentVolume = 64;
    const callStack = [];
    const forStack = [];
    const visitedNote = /* @__PURE__ */ new Set();
    let steps = 0;
    while (offset < opcodes.length && steps < 65536) {
      steps++;
      const opcode = u8(opcodes, offset++);
      if (opcode < 128) {
        if (visitedNote.has(offset - 1)) {
          break;
        }
        if (offset + 2 > opcodes.length) break;
        const noteFileOff = HEADER_SIZE + (offset - 1);
        const duration = u16BE(opcodes, offset);
        offset += 2;
        const xmNote = psfNoteToXm(opcode);
        events.push({ note: xmNote, instrId: currentInstrId, volume: currentVolume, duration, fileOffset: noteFileOff });
        continue;
      }
      switch (opcode) {
        case Op.Pause:
        case Op.StopAndPause: {
          if (offset + 2 > opcodes.length) return events;
          const pauseFileOff = HEADER_SIZE + (offset - 1);
          const dur = u16BE(opcodes, offset);
          offset += 2;
          events.push({ note: 0, instrId: 0, volume: 0, duration: dur, fileOffset: pauseFileOff });
          if (opcode === Op.StopAndPause) return events;
          break;
        }
        case Op.SetVolume:
          if (offset < opcodes.length) currentVolume = Math.min(64, u8(opcodes, offset++));
          break;
        case Op.SetFineTune:
        case Op.UseInstrument: {
          if (offset < opcodes.length) {
            const slot = u8(opcodes, offset++);
            if (opcode === Op.UseInstrument) {
              if (slot < instrArray.length) {
                currentInstrId = slot + 1;
              }
            }
          }
          break;
        }
        case Op.DefineInstrument: {
          if (offset + 3 > opcodes.length) return events;
          offset++;
          const wordCount = u16BE(opcodes, offset);
          offset += 2;
          const instrOffset = offset;
          currentInstrId = instrOffsetToId.get(instrOffset) ?? currentInstrId;
          const remaining = wordCount * 2 - 4;
          if (remaining > 0) offset += remaining;
          break;
        }
        case Op.Return:
          if (callStack.length > 0) {
            offset = callStack.pop();
          } else {
            return events;
          }
          break;
        case Op.GoSub: {
          if (offset + 4 > opcodes.length) return events;
          const rel = s32BE(opcodes, offset);
          offset += 4;
          callStack.push(offset);
          offset = offset - 4 + rel >>> 0;
          break;
        }
        case Op.Goto: {
          if (offset + 4 > opcodes.length) return events;
          const rel = s32BE(opcodes, offset);
          offset += 4;
          offset = offset - 4 + rel >>> 0;
          break;
        }
        case Op.For: {
          if (offset < opcodes.length) {
            const count = u8(opcodes, offset++);
            forStack.push({ count, returnOffset: offset });
          }
          break;
        }
        case Op.Next: {
          if (forStack.length > 0) {
            const top = forStack[forStack.length - 1];
            top.count--;
            if (top.count > 0) {
              offset = top.returnOffset;
            } else {
              forStack.pop();
            }
          }
          break;
        }
        case Op.Loop:
          return events;
        case Op.End:
          return events;
        case Op.Nop:
        case Op.Request:
        case Op.OneShot:
        case Op.Looping:
          break;
        case Op.FadeOut:
        case Op.FadeIn:
        case Op.Led:
        case Op.WaitForRequest:
        case Op.SetTranspose:
          if (offset < opcodes.length) offset++;
          break;
        case Op.Portamento:
        case Op.Tremolo:
        case Op.Filter: {
          if (offset >= opcodes.length) return events;
          const enable = u8(opcodes, offset++) !== 0;
          if (enable) offset += 3;
          break;
        }
        case Op.Arpeggio: {
          if (offset >= opcodes.length) return events;
          const enable = u8(opcodes, offset++) !== 0;
          if (enable) offset += 1;
          break;
        }
        case Op.Vibrato:
        case Op.Phasing: {
          if (offset >= opcodes.length) return events;
          const enable = u8(opcodes, offset++) !== 0;
          if (enable) offset += 4;
          break;
        }
        case Op.SetAdsr: {
          if (offset + 3 >= opcodes.length) return events;
          offset += 3;
          const releaseEnabled = u8(opcodes, offset++) !== 0;
          if (releaseEnabled) offset += 1;
          break;
        }
      }
    }
    return events;
  }
  const song0 = songInfoList[0];
  const NUM_CHANNELS = 4;
  const ROWS_PER_PATTERN = 64;
  const AMIGA_PAN = [-50, 50, 50, -50];
  const channelEvents = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const startOff = song0.opcodeStartOffsets[ch];
    const enabled = (song0.enabledChannels & 1 << ch) !== 0;
    if (enabled && startOff < opcodes.length) {
      channelEvents.push(extractNotesFromVoice(startOff));
    } else {
      channelEvents.push([]);
    }
  }
  function eventsToRows(events) {
    const rows = [];
    const offsets = [];
    for (const ev of events) {
      rows.push({
        note: ev.note,
        instrument: ev.instrId,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      });
      offsets.push(ev.fileOffset);
      for (let d = 1; d < ev.duration; d++) {
        rows.push(emptyCell());
        offsets.push(-1);
      }
    }
    if (rows.length === 0) {
      rows.push(emptyCell());
      offsets.push(-1);
    }
    return { rows, offsets };
  }
  const flatResults = channelEvents.map(eventsToRows);
  const flatChannelRows = flatResults.map((r) => r.rows);
  const flatChannelOffsets = flatResults.map((r) => r.offsets);
  const maxRows = Math.max(...flatChannelRows.map((r) => r.length), 1);
  const numPatterns = Math.ceil(maxRows / ROWS_PER_PATTERN);
  const trackerPatterns = [];
  for (let p = 0; p < numPatterns; p++) {
    const startRow = p * ROWS_PER_PATTERN;
    const endRow = Math.min(startRow + ROWS_PER_PATTERN, maxRows);
    const patLen = endRow - startRow;
    const channelRows = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = [];
      const src = flatChannelRows[ch];
      for (let r = 0; r < patLen; r++) {
        const globalRow = startRow + r;
        rows.push(globalRow < src.length ? src[globalRow] : emptyCell());
      }
      channelRows.push(rows);
    }
    trackerPatterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: patLen,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: AMIGA_PAN[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "PSF",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instrConfigs.length
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, NUM_CHANNELS, ROWS_PER_PATTERN));
  }
  const moduleName = filename.replace(/\.[^/.]+$/, "");
  const uadePatternLayout = {
    formatId: "soundFactory",
    patternDataFileOffset: HEADER_SIZE,
    // opcodes start at HEADER_SIZE
    bytesPerCell: 3,
    // note(1) + duration(2) or pause(1) + duration(2)
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: NUM_CHANNELS,
    numPatterns: trackerPatterns.length,
    moduleSize: bytes.byteLength,
    encodeCell: encodeSoundFactoryCell,
    getCellFileOffset: (pattern, row, channel) => {
      const globalRow = pattern * ROWS_PER_PATTERN + row;
      if (channel < 0 || channel >= flatChannelOffsets.length) return -1;
      const offsets = flatChannelOffsets[channel];
      if (globalRow < 0 || globalRow >= offsets.length) return -1;
      return offsets[globalRow];
    }
  };
  return {
    name: moduleName,
    format: "PSF",
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeEmptyPattern(filename, numChannels, rowCount) {
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: rowCount,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rowCount }, () => emptyCell())
    })),
    importMetadata: {
      sourceFormat: "PSF",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0
    }
  };
}
export {
  isSoundFactoryFormat,
  parseSoundFactoryFile
};
