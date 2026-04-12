import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const NUM_CHANNELS = 4;
const MAX_EVENTS_PER_PATTERN = 512;
const MAX_STEPS_PER_CHANNEL = 256;
const RJP_PERIODS = [
  // Octave 1
  453,
  480,
  508,
  538,
  570,
  604,
  640,
  678,
  720,
  762,
  808,
  856,
  // Octave 2
  226,
  240,
  254,
  269,
  285,
  302,
  320,
  339,
  360,
  381,
  404,
  428,
  // Octave 3
  113,
  120,
  127,
  135,
  143,
  151,
  160,
  170,
  180,
  190,
  202,
  214
];
const PT_PERIODS = [
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
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function isRJPFormat(buf) {
  if (buf.length < 16) return false;
  if (buf[0] !== 82 || buf[1] !== 74 || buf[2] !== 80) return false;
  if (buf[4] !== 83 || buf[5] !== 77 || buf[6] !== 79 || buf[7] !== 68) return false;
  return true;
}
function parseChunks(buf) {
  if (buf.length < 36) return null;
  let off = 8;
  const chunks = [];
  for (let i = 0; i < 7; i++) {
    if (off + 4 > buf.length) return null;
    const size = u32BE(buf, off);
    const dataOff = off + 4;
    if (dataOff + size > buf.length) return null;
    chunks.push({ offset: dataOff, size });
    off = dataOff + size;
  }
  return {
    sampleDescs: chunks[0],
    envelopes: chunks[1],
    subsongs: chunks[2],
    stepPtrs: chunks[3],
    patternPtrs: chunks[4],
    stepData: chunks[5],
    patternData: chunks[6]
  };
}
function rjpNoteToXM(rjpNote) {
  if (rjpNote === 0) return 0;
  if (rjpNote < 0 || rjpNote >= RJP_PERIODS.length) return 0;
  const period = RJP_PERIODS[rjpNote];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx + 1 + 12;
}
function decodePatternEvents(buf, baseOff, chunkEnd) {
  const events = [];
  let pos = baseOff;
  while (pos < chunkEnd && events.length < MAX_EVENTS_PER_PATTERN) {
    const eventStart = pos;
    let note = 0;
    let instrument = 0;
    let speed = 0;
    let vibrato = false;
    let pitchSlide = false;
    let noteFileOffset = pos;
    let endOfPattern = false;
    while (pos < chunkEnd) {
      const b = buf[pos];
      if (b < 128) {
        noteFileOffset = pos;
        note = rjpNoteToXM(b);
        pos++;
        break;
      }
      const cmd = (b & 126) >> 1;
      pos++;
      switch (cmd) {
        case 0:
          endOfPattern = true;
          break;
        case 1:
          vibrato = true;
          break;
        case 2:
          if (pos < chunkEnd) {
            speed = buf[pos];
            pos++;
          }
          break;
        case 3:
          if (pos < chunkEnd) pos++;
          break;
        case 4:
          if (pos < chunkEnd) {
            const instrByte = buf[pos];
            if (instrByte > 0) {
              instrument = instrByte;
            }
            pos++;
          }
          break;
        case 5:
          if (pos + 1 < chunkEnd) pos += 2;
          break;
        case 6:
          pitchSlide = true;
          if (pos + 4 < chunkEnd) pos += 5;
          break;
      }
      if (endOfPattern) break;
    }
    if (endOfPattern) break;
    if (note > 0 || instrument > 0 || speed > 0) {
      events.push({
        note,
        instrument,
        speed,
        vibrato,
        pitchSlide,
        fileOffset: noteFileOffset,
        eventBytes: pos - eventStart
      });
    }
  }
  return events;
}
function parseStepSequence(buf, stepDataOff, stepDataEnd) {
  const steps = [];
  let pos = stepDataOff;
  while (pos < stepDataEnd && steps.length < MAX_STEPS_PER_CHANNEL) {
    const b = buf[pos];
    if (b === 0) break;
    steps.push({ patternIndex: b, stepDataFileOffset: pos });
    pos++;
  }
  return steps;
}
async function parseRJPFile(buffer, filename, companionFiles) {
  var _a;
  const buf = new Uint8Array(buffer);
  if (!isRJPFormat(buf)) {
    throw new Error("Not a Richard Joseph Player module");
  }
  const version = buf[3];
  const chunks = parseChunks(buf);
  if (!chunks) {
    throw new Error("Failed to parse RJP chunk structure");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^rjp\./i, "").replace(/\.(sng|rjp)$/i, "") || baseName;
  const numSamples = Math.min(chunks.sampleDescs.size >>> 5, 256);
  let smpBuf = null;
  if (companionFiles) {
    const songBase = baseName.replace(/^rjp\./i, "").replace(/\.(sng|rjp)$/i, "");
    const candidates = [
      `SMP.${songBase}`,
      `smp.${songBase}`,
      `${songBase}.ins`,
      `${songBase}.INS`,
      "SMP.set",
      "smp.set"
    ];
    for (const cand of candidates) {
      for (const [key, val] of companionFiles) {
        const keyBase = key.split("/").pop() ?? key;
        if (keyBase.toLowerCase() === cand.toLowerCase()) {
          smpBuf = new Uint8Array(val);
          break;
        }
      }
      if (smpBuf) break;
    }
  }
  const instruments = [];
  for (let i = 0; i < numSamples; i++) {
    const descBase = chunks.sampleDescs.offset + i * 32;
    if (descBase + 32 > buf.length) break;
    const smpOffset = u32BE(buf, descBase);
    const loopStartW = u16BE(buf, descBase + 16);
    const oneShotW = u16BE(buf, descBase + 18);
    const loopLenW = u16BE(buf, descBase + 20);
    const loopStart = loopStartW * 2;
    const loopEnd = loopStart + loopLenW * 2;
    const lengthBytes = (oneShotW + loopLenW) * 2;
    if (smpBuf && smpOffset + lengthBytes <= smpBuf.length && lengthBytes > 2) {
      const pcm = smpBuf.slice(smpOffset, smpOffset + lengthBytes);
      instruments.push(
        createSamplerInstrument(
          i + 1,
          `Sample ${i + 1}`,
          pcm,
          64,
          // full volume
          8287,
          // Amiga C-3 rate
          loopStart,
          loopEnd
        )
      );
    } else {
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0,
        metadata: {
          rjpSample: {
            loopStart,
            loopSize: loopLenW * 2,
            hasLoop: loopLenW > 1,
            lengthBytes
          }
        }
      });
    }
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "Sample 1",
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const numSubsongs = Math.min(chunks.subsongs.size >>> 2, 256);
  const patterns = [];
  const songPositions = [];
  const cellOffsetMap = /* @__PURE__ */ new Map();
  if (numSubsongs > 0 && chunks.stepPtrs.size >= 4 && chunks.patternPtrs.size >= 4) {
    let selectedSubsong = 0;
    for (let s = 0; s < numSubsongs; s++) {
      const off = chunks.subsongs.offset + s * 4;
      if (buf[off] !== 0 || buf[off + 1] !== 0 || buf[off + 2] !== 0 || buf[off + 3] !== 0) {
        selectedSubsong = s;
        break;
      }
    }
    const subsongOff = chunks.subsongs.offset + selectedSubsong * 4;
    const stepIndices = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      stepIndices.push(buf[subsongOff + ch]);
    }
    const channelSteps = [];
    const stepDataEnd = chunks.stepData.offset + chunks.stepData.size;
    const numStepPtrs = chunks.stepPtrs.size >>> 2;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const stepIdx = stepIndices[ch];
      if (stepIdx === 0 || stepIdx > numStepPtrs) {
        channelSteps.push([]);
        continue;
      }
      const ptrOff = chunks.stepPtrs.offset + stepIdx * 4;
      if (ptrOff + 4 > buf.length) {
        channelSteps.push([]);
        continue;
      }
      const stepOffset = u32BE(buf, ptrOff);
      const absStepOff = chunks.stepData.offset + stepOffset;
      if (absStepOff >= stepDataEnd) {
        channelSteps.push([]);
        continue;
      }
      channelSteps.push(parseStepSequence(buf, absStepOff, stepDataEnd));
    }
    const numSteps = Math.max(1, ...channelSteps.map((s) => s.length));
    const numPatPtrs = chunks.patternPtrs.size >>> 2;
    const patDataEnd = chunks.patternData.offset + chunks.patternData.size;
    const decodedPatterns = /* @__PURE__ */ new Map();
    for (let step = 0; step < numSteps; step++) {
      const channelRows = [[], [], [], []];
      let maxRows = 0;
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const chStep = channelSteps[ch][step];
        if (!chStep) continue;
        const patIdx = chStep.patternIndex;
        if (patIdx >= numPatPtrs) continue;
        let events = decodedPatterns.get(patIdx);
        if (!events) {
          const patPtrOff = chunks.patternPtrs.offset + patIdx * 4;
          if (patPtrOff + 4 > buf.length) continue;
          const patOffset = u32BE(buf, patPtrOff);
          const absPatOff = chunks.patternData.offset + patOffset;
          if (absPatOff >= patDataEnd) continue;
          events = decodePatternEvents(buf, absPatOff, patDataEnd);
          decodedPatterns.set(patIdx, events);
        }
        const rows = [];
        for (const evt of events) {
          let effTyp = 0;
          let eff = 0;
          if (evt.speed > 0) {
            effTyp = 15;
            eff = evt.speed & 255;
          } else if (evt.vibrato) {
            effTyp = 4;
            eff = 64;
          } else if (evt.pitchSlide) {
            effTyp = 3;
            eff = 32;
          }
          rows.push({
            note: evt.note,
            instrument: evt.instrument,
            volume: 0,
            effTyp,
            eff,
            effTyp2: 0,
            eff2: 0
          });
          const key = `${step}:${rows.length - 1}:${ch}`;
          cellOffsetMap.set(key, {
            fileOffset: evt.fileOffset,
            byteLen: 1
            // note byte is always 1 byte
          });
        }
        channelRows[ch] = rows;
        if (rows.length > maxRows) maxRows = rows.length;
      }
      if (maxRows === 0) maxRows = 1;
      let patLen = 16;
      if (maxRows <= 16) patLen = 16;
      else if (maxRows <= 32) patLen = 32;
      else if (maxRows <= 64) patLen = 64;
      else if (maxRows <= 128) patLen = 128;
      else patLen = Math.min(256, maxRows + 15 >>> 4 << 4);
      const emptyCell = {
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      };
      const channels = Array.from({ length: NUM_CHANNELS }, (_, ch) => {
        const rows = channelRows[ch];
        const paddedRows = [];
        for (let r = 0; r < patLen; r++) {
          paddedRows.push(r < rows.length ? rows[r] : { ...emptyCell });
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
          rows: paddedRows
        };
      });
      patterns.push({
        id: `pattern-${step}`,
        name: `Pattern ${step}`,
        length: patLen,
        channels,
        importMetadata: {
          sourceFormat: "MOD",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: NUM_CHANNELS,
          originalPatternCount: numSteps,
          originalInstrumentCount: numSamples
        }
      });
      songPositions.push(step);
    }
  }
  if (patterns.length === 0) {
    const emptyRows = Array.from({ length: 64 }, () => ({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    }));
    patterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: 64,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: emptyRows
      })),
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: 1,
        originalInstrumentCount: numSamples
      }
    });
    songPositions.push(0);
  }
  const uadePatternLayout = {
    formatId: "richardJoseph",
    patternDataFileOffset: chunks.patternData.offset,
    bytesPerCell: 1,
    // note byte only (commands are preceding prefix bytes)
    rowsPerPattern: ((_a = patterns[0]) == null ? void 0 : _a.length) ?? 64,
    numChannels: NUM_CHANNELS,
    numPatterns: patterns.length,
    moduleSize: buf.length,
    encodeCell: (cell) => {
      if (cell.note === 0) {
        return new Uint8Array([142]);
      }
      const ptIdx = cell.note - 12 - 1;
      if (ptIdx < 0 || ptIdx >= PT_PERIODS.length) {
        return new Uint8Array([142]);
      }
      const ptPeriod = PT_PERIODS[ptIdx];
      let bestRjp = 0;
      let bestDist = Infinity;
      for (let i = 0; i < RJP_PERIODS.length; i++) {
        const d = Math.abs(RJP_PERIODS[i] - ptPeriod);
        if (d < bestDist) {
          bestDist = d;
          bestRjp = i;
        }
      }
      return new Uint8Array([bestRjp]);
    },
    getCellFileOffset: (pattern, row, channel) => {
      const key = `${pattern}:${row}:${channel}`;
      const entry = cellOffsetMap.get(key);
      return (entry == null ? void 0 : entry.fileOffset) ?? -1;
    }
  };
  return {
    name: `${moduleName} [Richard Joseph v${version}] (${numSamples} smp, ${numSubsongs} sub)`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
export {
  isRJPFormat,
  parseRJPFile
};
