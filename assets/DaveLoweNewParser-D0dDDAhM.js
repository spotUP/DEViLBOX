import { c2 as createSamplerInstrument, c3 as periodToNoteIndex, c7 as amigaNoteToXM } from "./main-BbV5VyEH.js";
import { daveLoweEncoder } from "./DaveLoweParser-kVqiosPY.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SAMPLE_DESC_SIZE = 14;
const CMD_SET_INSTRUMENT = 4;
const CMD_SEQ_ADVANCE = 8;
const CMD_SET_VOL_ENV = 12;
const CMD_REST = 32;
const CMD_NOTE_THRESHOLD = 100;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function getFirstCheckOffset(buf) {
  if (buf.length < 32) return -1;
  const word0 = u16BE(buf, 0);
  if (word0 === 8) return 8;
  if (word0 === 4) {
    const long24 = u32BE(buf, 24);
    return long24 !== 0 ? 4 : 8;
  }
  return -1;
}
function isDaveLoweNewFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const tableOff = getFirstCheckOffset(buf);
  if (tableOff === -1) return false;
  const endOff = tableOff + 4 * 4;
  if (endOff > buf.length) return false;
  for (let i = 0; i < 4; i++) {
    const base = tableOff + i * 4;
    const hiWord = u16BE(buf, base);
    const loWord = u16BE(buf, base + 2);
    if (hiWord !== 0) return false;
    if (loWord >= 32768) return false;
    if (loWord === 0) return false;
    if ((loWord & 1) !== 0) return false;
  }
  return true;
}
function parseCommandStream(buf, fileOff) {
  const events = [];
  let pos = fileOff;
  const end = buf.length - 1;
  while (pos < end) {
    const word = u16BE(buf, pos);
    pos += 2;
    if (word > CMD_NOTE_THRESHOLD) {
      if (pos + 2 > buf.length) break;
      const duration = u16BE(buf, pos);
      pos += 2;
      events.push({ type: "note", period: word, duration });
    } else if (word === CMD_SET_INSTRUMENT) {
      if (pos + 4 > buf.length) break;
      const ptr = u32BE(buf, pos);
      pos += 4;
      events.push({ type: "setInstrument", ptr });
    } else if (word === CMD_SET_VOL_ENV) {
      if (pos + 4 > buf.length) break;
      const ptr = u32BE(buf, pos);
      pos += 4;
      events.push({ type: "setVolEnv", ptr });
    } else if (word === CMD_REST) {
      if (pos + 2 > buf.length) break;
      const duration = u16BE(buf, pos);
      pos += 2;
      events.push({ type: "rest", duration });
    } else if (word === CMD_SEQ_ADVANCE) {
      events.push({ type: "seqAdvance" });
      break;
    } else if (word === 0) {
      break;
    } else {
      break;
    }
  }
  return { events, byteSize: pos - fileOff };
}
function eventsToRows(events, instrPtrToId) {
  const rows = [];
  let currentInstr = 0;
  let totalTicks = 0;
  for (const ev of events) {
    if (ev.type === "setInstrument") {
      const id = instrPtrToId.get(ev.ptr) ?? 0;
      if (id > 0) currentInstr = id;
    } else if (ev.type === "note") {
      const noteIdx = periodToNoteIndex(ev.period);
      const xmNote = amigaNoteToXM(noteIdx);
      rows.push({ note: xmNote, instrument: currentInstr, volume: 0, effTyp: 0, eff: 0 });
      for (let t = 1; t < ev.duration; t++) {
        rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
      }
      totalTicks += ev.duration;
    } else if (ev.type === "rest") {
      for (let t = 0; t < ev.duration; t++) {
        rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
      }
      totalTicks += ev.duration;
    }
  }
  return { rows, totalTicks };
}
function parseDaveLoweNewFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isDaveLoweNewFormat(buf)) {
    throw new Error("Not a Dave Lowe New module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^dln\./i, "").replace(/\.dln$/i, "") || baseName;
  const tableOff = getFirstCheckOffset(buf);
  const channelListPtrs = [];
  for (let ch = 0; ch < 4; ch++) {
    channelListPtrs.push(u32BE(buf, tableOff + ch * 4));
  }
  const channelPositionLists = [[], [], [], []];
  for (let ch = 0; ch < 4; ch++) {
    const listOff = channelListPtrs[ch];
    if (listOff === 0 || listOff >= buf.length) continue;
    let pos = listOff;
    while (pos + 4 <= buf.length) {
      const ptr = u32BE(buf, pos);
      if (ptr === 0) break;
      if (ptr > 1 && ptr < buf.length) {
        channelPositionLists[ch].push(ptr);
      } else {
        break;
      }
      pos += 4;
    }
  }
  const numPositions = Math.max(...channelPositionLists.map((l) => l.length), 1);
  const uniqueSections = /* @__PURE__ */ new Map();
  const allSectionPtrs = [];
  const trackMap = [];
  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const chPats = [];
    for (let ch = 0; ch < 4; ch++) {
      const sectionPtr = posIdx < channelPositionLists[ch].length ? channelPositionLists[ch][posIdx] : 0;
      if (sectionPtr === 0) {
        chPats.push(-1);
      } else {
        if (!uniqueSections.has(sectionPtr)) {
          uniqueSections.set(sectionPtr, allSectionPtrs.length);
          allSectionPtrs.push(sectionPtr);
        }
        chPats.push(uniqueSections.get(sectionPtr));
      }
    }
    trackMap.push(chPats);
  }
  const sectionEvents = /* @__PURE__ */ new Map();
  const sectionBytes = /* @__PURE__ */ new Map();
  const instrPtrs = /* @__PURE__ */ new Set();
  for (const sectionPtr of allSectionPtrs) {
    if (sectionPtr >= buf.length) {
      sectionEvents.set(sectionPtr, []);
      sectionBytes.set(sectionPtr, 0);
      continue;
    }
    const { events, byteSize } = parseCommandStream(buf, sectionPtr);
    sectionEvents.set(sectionPtr, events);
    sectionBytes.set(sectionPtr, byteSize);
    for (const ev of events) {
      if (ev.type === "setInstrument" && ev.ptr > 0) {
        instrPtrs.add(ev.ptr);
      }
    }
  }
  const sortedInstrPtrs = [...instrPtrs].sort((a, b) => a - b);
  const instrPtrToId = /* @__PURE__ */ new Map();
  const instruments = [];
  for (let i = 0; i < sortedInstrPtrs.length; i++) {
    const descOff = sortedInstrPtrs[i];
    instrPtrToId.set(descOff, i + 1);
    if (descOff + SAMPLE_DESC_SIZE > buf.length) {
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
      continue;
    }
    const loopType = u16BE(buf, descOff + 0);
    const sampleAddr = u32BE(buf, descOff + 2);
    const sampleLen = u16BE(buf, descOff + 6);
    const loopOff = u32BE(buf, descOff + 8);
    const loopLen = u16BE(buf, descOff + 12);
    const lenBytes = sampleLen * 2;
    if (sampleAddr === 0 || lenBytes === 0 || sampleAddr + lenBytes > buf.length) {
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
      continue;
    }
    const pcm = new Uint8Array(lenBytes);
    for (let k = 0; k < lenBytes; k++) pcm[k] = buf[sampleAddr + k];
    const loopStartRel = loopType > 0 && loopOff >= sampleAddr ? loopOff - sampleAddr : 0;
    const loopStart = loopType > 0 ? loopStartRel : 0;
    const loopEnd = loopType > 0 ? loopStartRel + loopLen * 2 : 0;
    instruments.push(createSamplerInstrument(
      i + 1,
      `DLN Sample ${i + 1}`,
      pcm,
      64,
      8287,
      loopStart,
      loopEnd
    ));
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
  const sectionRows = /* @__PURE__ */ new Map();
  for (const sectionPtr of allSectionPtrs) {
    const events = sectionEvents.get(sectionPtr) ?? [];
    const { rows } = eventsToRows(events, instrPtrToId);
    sectionRows.set(sectionPtr, rows);
  }
  const patterns = [];
  const songPositions = [];
  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    let maxRows = 1;
    for (let ch = 0; ch < 4; ch++) {
      const sectionPtr = posIdx < channelPositionLists[ch].length ? channelPositionLists[ch][posIdx] : 0;
      if (sectionPtr > 0) {
        const rows = sectionRows.get(sectionPtr) ?? [];
        maxRows = Math.max(maxRows, rows.length);
      }
    }
    maxRows = Math.min(maxRows, 256);
    if (maxRows === 0) maxRows = 1;
    const channels = [];
    for (let ch = 0; ch < 4; ch++) {
      const sectionPtr = posIdx < channelPositionLists[ch].length ? channelPositionLists[ch][posIdx] : 0;
      const sRows = sectionPtr > 0 ? sectionRows.get(sectionPtr) ?? [] : [];
      const trackerRows = [];
      for (let r = 0; r < maxRows; r++) {
        if (r < sRows.length) {
          trackerRows.push({
            note: sRows[r].note,
            instrument: sRows[r].instrument,
            volume: sRows[r].volume,
            effTyp: sRows[r].effTyp,
            eff: sRows[r].eff,
            effTyp2: 0,
            eff2: 0
          });
        } else {
          trackerRows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
      }
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: trackerRows
      });
    }
    patterns.push({
      id: `pattern-${posIdx}`,
      name: `Pattern ${posIdx}`,
      length: maxRows,
      channels,
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPositions,
        originalInstrumentCount: instruments.length
      }
    });
    songPositions.push(posIdx);
  }
  const filePatternAddrs = [];
  const filePatternSizes = [];
  for (const sectionPtr of allSectionPtrs) {
    filePatternAddrs.push(sectionPtr);
    filePatternSizes.push(sectionBytes.get(sectionPtr) ?? 0);
  }
  const variableLayout = {
    formatId: "daveLowe",
    numChannels: 4,
    numFilePatterns: allSectionPtrs.length,
    rowsPerPattern: patterns.map((p) => p.length),
    moduleSize: buf.length,
    encoder: daveLoweEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap
  };
  return {
    name: `${moduleName} [Dave Lowe New]`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 1,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadeVariableLayout: variableLayout
  };
}
export {
  isDaveLoweNewFormat,
  parseDaveLoweNewFile
};
