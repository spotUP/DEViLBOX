import { c5 as registerVariableEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeFuturePlayerPattern(rows, _channel) {
  const bytes = [];
  let i = 0;
  while (i < rows.length) {
    const cell = rows[i];
    const note = cell.note ?? 0;
    const fpNote = note >= 1 && note <= 96 ? note : 0;
    let duration = 1;
    while (i + duration < rows.length) {
      const next = rows[i + duration];
      if ((next.note ?? 0) !== 0 || (next.instrument ?? 0) !== 0 || (next.effTyp ?? 0) !== 0 || (next.eff ?? 0) !== 0) {
        break;
      }
      duration++;
    }
    const effTyp = cell.effTyp ?? 0;
    const eff = cell.eff ?? 0;
    if (effTyp === 3 && eff > 0) {
      bytes.push(132);
      bytes.push(0);
      bytes.push(0);
      bytes.push(eff & 255);
    }
    bytes.push(fpNote);
    if (duration > 127) {
      bytes.push(128 | duration & 127);
    } else {
      bytes.push(duration & 255);
    }
    i += duration;
  }
  bytes.push(128);
  bytes.push(0);
  return new Uint8Array(bytes);
}
const futurePlayerEncoder = {
  formatId: "futurePlayer",
  encodePattern: encodeFuturePlayerPattern
};
registerVariableEncoder(futurePlayerEncoder);
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function rd8(code, ptr) {
  return ptr < code.length ? code[ptr] : 0;
}
function rd32(code, ptr) {
  return ptr + 3 < code.length ? u32BE(code, ptr) : 0;
}
function rd16(code, ptr) {
  return ptr + 1 < code.length ? u16BE(code, ptr) : 0;
}
function isFuturePlayerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 68) return false;
  return u32BE(buf, 0) === 1011 && buf[20] !== 0 && u32BE(buf, 32) === 1895779957 && u32BE(buf, 36) === 1177440332 && u32BE(buf, 40) === 1096369490 && u32BE(buf, 64) !== 0;
}
function stripHunkHeader(buf) {
  if (buf.length < 20 || u32BE(buf, 0) !== 1011) return buf;
  const numHunks = u32BE(buf, 8);
  let offset = 20 + numHunks * 4;
  if (offset + 8 <= buf.length && u32BE(buf, offset) === 1001) {
    const codeSize = u32BE(buf, offset + 4) * 4;
    offset += 8;
    return buf.subarray(offset, offset + codeSize);
  }
  return buf;
}
function fpNoteToXM(fpNote) {
  if (fpNote === 0 || fpNote > 96) return 0;
  return fpNote;
}
function linearizeVoice(code, startPos, maxRows, instrumentMap) {
  const rows = [];
  const st = {
    seqPos: startPos,
    callStack: [],
    loopAddrs: [],
    loopCounts: [],
    currentInstr: 0,
    ended: false
  };
  let safetyCounter = 0;
  const MAX_ITERATIONS = 1e5;
  while (rows.length < maxRows && !st.ended && safetyCounter < MAX_ITERATIONS) {
    safetyCounter++;
    const byte0 = rd8(code, st.seqPos);
    st.seqPos++;
    if (byte0 & 128) {
      const cmdNum = (byte0 << 2 & 255) >> 2;
      const arg = rd8(code, st.seqPos);
      st.seqPos++;
      switch (cmdNum) {
        case 0:
          if (st.callStack.length > 0) {
            st.seqPos = st.callStack.pop();
          } else {
            st.ended = true;
          }
          break;
        case 1: {
          const instrPtr = rd32(code, st.seqPos);
          st.seqPos += 4;
          if (!instrumentMap.has(instrPtr)) {
            instrumentMap.set(instrPtr, instrumentMap.size + 1);
          }
          st.currentInstr = instrumentMap.get(instrPtr);
          break;
        }
        case 2:
          st.seqPos += 4;
          break;
        case 3:
          break;
        case 4: {
          const rate = rd16(code, st.seqPos);
          st.seqPos += 2;
          if (rows.length > 0 && rate > 0) {
            const last = rows[rows.length - 1];
            if (last.effTyp === 0 && last.eff === 0) {
              last.effTyp = 3;
              last.eff = Math.min(255, rate & 255);
            }
          }
          break;
        }
        case 5:
          break;
        case 6: {
          st.callStack.push(st.seqPos + 4);
          const targetPtr = rd32(code, st.seqPos);
          const seqData = rd32(code, targetPtr + 8);
          st.seqPos = seqData;
          break;
        }
        case 7: {
          const targetPtr2 = rd32(code, st.seqPos);
          const seqData2 = rd32(code, targetPtr2 + 8);
          st.seqPos = seqData2;
          break;
        }
        case 8: {
          st.loopAddrs.push(st.seqPos);
          st.loopCounts.push(arg);
          break;
        }
        case 9: {
          if (st.loopCounts.length > 0) {
            const idx = st.loopCounts.length - 1;
            st.loopCounts[idx]--;
            if (st.loopCounts[idx] > 0 && st.loopAddrs.length > idx) {
              st.seqPos = st.loopAddrs[idx];
            } else {
              st.loopCounts.pop();
              st.loopAddrs.pop();
            }
          }
          break;
        }
        case 10: {
          if (st.loopAddrs.length > 0) {
            st.seqPos = st.loopAddrs[st.loopAddrs.length - 1];
          }
          break;
        }
        case 11:
          break;
        case 12:
          break;
        case 13:
          st.ended = true;
          break;
        case 14:
          break;
        default:
          st.ended = true;
          break;
      }
      continue;
    }
    const note = byte0;
    const dur = rd8(code, st.seqPos);
    st.seqPos++;
    const duration = dur & 128 ? dur & 127 : dur;
    const row = {
      note: fpNoteToXM(note),
      instrument: note > 0 ? st.currentInstr : 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    };
    rows.push(row);
    for (let d = 1; d < duration && rows.length < maxRows; d++) {
      rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
    }
  }
  while (rows.length < maxRows) {
    rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  }
  return rows;
}
function readCString(code, ptr, maxLen = 64) {
  if (ptr === 0 || ptr >= code.length) return "";
  let s = "";
  for (let i = 0; i < maxLen && ptr + i < code.length; i++) {
    const c = code[ptr + i];
    if (c === 0) break;
    if (c >= 32 && c < 127) s += String.fromCharCode(c);
  }
  return s.trim();
}
function parseFuturePlayerFile(buffer, filename) {
  const rawBuf = new Uint8Array(buffer);
  if (!isFuturePlayerFormat(rawBuf)) {
    throw new Error("Not a Future Player module");
  }
  const code = stripHunkHeader(rawBuf);
  if (code.length < 44 || u32BE(code, 0) !== 1895779957) {
    throw new Error("Invalid Future Player code section");
  }
  const songNamePtr = rd32(code, 12);
  const authorNamePtr = rd32(code, 16);
  const songName = readCString(code, songNamePtr);
  const authorName = readCString(code, authorNamePtr);
  const baseName = (filename.split("/").pop() ?? filename).split("\\").pop() ?? filename;
  const moduleName = songName || baseName.replace(/^fp\./i, "").replace(/\.fp$/i, "") || baseName;
  const subsongs = [];
  let scan = 32;
  while (scan + 8 <= code.length) {
    const songDataPtr = rd32(code, scan);
    if (songDataPtr === 0) break;
    const speedVal = rd16(code, scan + 4);
    const voiceSeqPtrs = [];
    for (let i = 0; i < 4; i++) {
      const blockPtr = rd32(code, songDataPtr + 8 + i * 4);
      if (blockPtr !== 0 && blockPtr + 8 < code.length) {
        voiceSeqPtrs.push(rd32(code, blockPtr + 8));
      } else {
        voiceSeqPtrs.push(0);
      }
    }
    let tickSpeed = rd8(code, songDataPtr + 24) & 7;
    if (tickSpeed === 0) tickSpeed = 8;
    subsongs.push({ songDataPtr, speedVal, voiceSeqPtrs, tickSpeed });
    scan += 8;
  }
  if (subsongs.length === 0) {
    throw new Error("No subsongs found");
  }
  const sub = subsongs[0];
  const instrumentMap = /* @__PURE__ */ new Map();
  const ROWS_PER_PATTERN = 64;
  const voiceRows = [];
  let maxVoiceLen = 0;
  for (let ch = 0; ch < 4; ch++) {
    if (sub.voiceSeqPtrs[ch] !== 0) {
      const rows = linearizeVoice(code, sub.voiceSeqPtrs[ch], 4096, instrumentMap);
      let lastNonEmpty = rows.length - 1;
      while (lastNonEmpty > 0 && rows[lastNonEmpty].note === 0 && rows[lastNonEmpty].effTyp === 0) {
        lastNonEmpty--;
      }
      voiceRows.push(rows.slice(0, lastNonEmpty + 1));
      maxVoiceLen = Math.max(maxVoiceLen, lastNonEmpty + 1);
    } else {
      voiceRows.push([]);
    }
  }
  for (let ch = 0; ch < 4; ch++) {
    while (voiceRows[ch].length < maxVoiceLen) {
      voiceRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
    }
  }
  const numPatterns = Math.max(1, Math.ceil(maxVoiceLen / ROWS_PER_PATTERN));
  const patterns = [];
  const songPositions = [];
  for (let pidx = 0; pidx < numPatterns; pidx++) {
    const startRow = pidx * ROWS_PER_PATTERN;
    const patLen = Math.min(ROWS_PER_PATTERN, maxVoiceLen - startRow);
    const channels = Array.from({ length: 4 }, (_, ch) => {
      const rows = [];
      for (let r = 0; r < patLen; r++) {
        const srcRow = voiceRows[ch][startRow + r];
        rows.push(srcRow || { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }
      while (rows.length < ROWS_PER_PATTERN) {
        rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows
      };
    });
    patterns.push({
      id: `pattern-${pidx}`,
      name: `Pattern ${pidx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: "FuturePlayer",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instrumentMap.size
      }
    });
    songPositions.push(pidx);
  }
  function extractInstrumentConfig(instrPtr) {
    if (instrPtr === 0 || instrPtr + 16 > code.length) return null;
    const sampInfoPtr = rd32(code, instrPtr + 8);
    if (sampInfoPtr === 0 || sampInfoPtr + 14 > code.length) return null;
    const wtFlag = rd8(code, sampInfoPtr + 8);
    const isWavetable = wtFlag !== 0;
    const lenWords = isWavetable ? 0 : rd16(code, sampInfoPtr + 4);
    const sampleSize = lenWords * 2;
    const detailPtr = rd32(code, instrPtr + 12);
    if (detailPtr === 0 || detailPtr + 58 > code.length) {
      return {
        meta: { isWavetable, sampleSize },
        config: {
          isWavetable,
          volume: 64,
          attackRate: 16,
          attackPeak: 255,
          decayRate: 4,
          sustainLevel: 128,
          sustainRate: 0,
          sustainTarget: 128,
          releaseRate: 8,
          pitchMod1Delay: 0,
          pitchMod1Shift: 0,
          pitchMod1Mode: 0,
          pitchMod1Negate: false,
          hasPitchMod1: false,
          pitchMod2Delay: 0,
          pitchMod2Shift: 0,
          pitchMod2Mode: 0,
          pitchMod2Negate: false,
          hasPitchMod2: false,
          sampleMod1Delay: 0,
          sampleMod1Shift: 0,
          sampleMod1Mode: 0,
          hasSampleMod1: false,
          sampleMod2Delay: 0,
          sampleMod2Shift: 0,
          sampleMod2Mode: 0,
          hasSampleMod2: false,
          sampleSize
        }
      };
    }
    const config = {
      isWavetable,
      detailPtr,
      volume: rd8(code, detailPtr + 8),
      attackRate: rd8(code, detailPtr + 18),
      attackPeak: rd8(code, detailPtr + 19),
      decayRate: rd8(code, detailPtr + 20),
      sustainLevel: rd8(code, detailPtr + 21),
      sustainRate: rd8(code, detailPtr + 22),
      sustainTarget: rd8(code, detailPtr + 23),
      releaseRate: rd8(code, detailPtr + 24),
      // Pitch mod 1
      hasPitchMod1: rd32(code, detailPtr + 26) !== 0,
      pitchMod1Shift: rd8(code, detailPtr + 30),
      pitchMod1Delay: rd8(code, detailPtr + 31),
      pitchMod1Mode: rd8(code, detailPtr + 32),
      pitchMod1Negate: rd8(code, detailPtr + 33) !== 0,
      // Pitch mod 2
      hasPitchMod2: rd32(code, detailPtr + 34) !== 0,
      pitchMod2Shift: rd8(code, detailPtr + 38),
      pitchMod2Delay: rd8(code, detailPtr + 39),
      pitchMod2Mode: rd8(code, detailPtr + 40),
      pitchMod2Negate: rd8(code, detailPtr + 41) !== 0,
      // Sample mod 1
      hasSampleMod1: rd32(code, detailPtr + 42) !== 0,
      sampleMod1Shift: rd8(code, detailPtr + 46),
      sampleMod1Delay: rd8(code, detailPtr + 47),
      sampleMod1Mode: rd8(code, detailPtr + 48),
      // Sample mod 2
      hasSampleMod2: rd32(code, detailPtr + 50) !== 0,
      sampleMod2Shift: rd8(code, detailPtr + 54),
      sampleMod2Delay: rd8(code, detailPtr + 55),
      sampleMod2Mode: rd8(code, detailPtr + 56),
      sampleSize
    };
    return { meta: { isWavetable, sampleSize }, config };
  }
  const instruments = [];
  instrumentMap.forEach((id, instrPtr) => {
    if (instrPtr === 0) return;
    const extracted = extractInstrumentConfig(instrPtr);
    if (!extracted) return;
    const { meta, config: fpConfig } = extracted;
    if (!meta.isWavetable && meta.sampleSize === 0) return;
    const typeLabel = meta.isWavetable ? "Synth" : "Sample";
    const sizeLabel = meta.sampleSize > 0 ? ` (${meta.sampleSize}B)` : "";
    instruments.push({
      id,
      name: `${typeLabel} ${id}${sizeLabel}`,
      type: "synth",
      synthType: "FuturePlayerSynth",
      effects: [],
      volume: -6,
      pan: 0,
      futurePlayer: fpConfig,
      metadata: { fpInstrPtr: instrPtr, fpIsWavetable: meta.isWavetable, fpSampleSize: meta.sampleSize }
    });
  });
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "Future Player",
      type: "synth",
      synthType: "FuturePlayerSynth",
      effects: [],
      volume: -6,
      pan: 0
    });
  }
  const initialSpeed = sub.tickSpeed;
  const initialBPM = 125;
  const displayName = authorName ? `${moduleName} by ${authorName} [Future Player]` : `${moduleName} [Future Player]`;
  const voiceStreamAddrs = sub.voiceSeqPtrs.map((ptr) => {
    const hdrCode = stripHunkHeader(rawBuf);
    const hdrOffset = rawBuf.length - hdrCode.length;
    return hdrOffset + ptr;
  });
  const voiceStreamSizes = voiceRows.map((rows) => {
    let nonEmpty = 0;
    for (const r of rows) {
      if (r.note > 0 || r.effTyp > 0) nonEmpty++;
    }
    return Math.max(nonEmpty * 4, 64);
  });
  const trackMap = [];
  for (let pidx = 0; pidx < numPatterns; pidx++) {
    trackMap.push([0, 1, 2, 3]);
  }
  const uadeVariableLayout = {
    formatId: "futurePlayer",
    numChannels: 4,
    numFilePatterns: 4,
    // one file pattern per voice stream
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: rawBuf.length,
    encoder: {
      formatId: "futurePlayer",
      encodePattern: encodeFuturePlayerPattern
    },
    filePatternAddrs: voiceStreamAddrs,
    filePatternSizes: voiceStreamSizes,
    trackMap
  };
  return {
    name: displayName,
    format: "FuturePlayer",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    futurePlayerFileData: buffer.slice(0),
    uadeVariableLayout
  };
}
export {
  isFuturePlayerFormat,
  parseFuturePlayerFile
};
