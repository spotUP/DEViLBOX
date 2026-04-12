import { c2 as createSamplerInstrument, c3 as periodToNoteIndex, c7 as amigaNoteToXM } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const HUNK_HEADER = 1011;
const CODE_BASE = 32;
const PTR_TABLE_OFF = 12;
const SAMPLE_DESC_SIZE = 14;
const CMD_SET_INSTRUMENT = 4;
const CMD_SEQ_ADVANCE = 8;
const CMD_SET_VOL_ENV = 12;
const CMD_REST = 32;
const CMD_NOTE_THRESHOLD = 100;
const MOD_PERIODS = [
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
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function readNullStr(buf, off, maxLen) {
  let s = "";
  for (let i = 0; i < maxLen && off + i < buf.length; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    if (c < 32 || c > 126) return "";
    s += String.fromCharCode(c);
  }
  return s;
}
function isDaveLoweFormat(buf) {
  if (buf.length < 44) return false;
  if (u32BE(buf, 0) !== HUNK_HEADER) return false;
  if (u32BE(buf, 32) !== 1895779957) return false;
  if (buf[36] !== 85 || buf[37] !== 78 || buf[38] !== 67 || buf[39] !== 76) return false;
  if (buf[40] !== 69 || buf[41] !== 65 || buf[42] !== 82 || buf[43] !== 84) return false;
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
      events.push({ type: "setInstrument", sampleInfoPtr: ptr });
    } else if (word === CMD_SET_VOL_ENV) {
      if (pos + 4 > buf.length) break;
      const ptr = u32BE(buf, pos);
      pos += 4;
      events.push({ type: "setVolEnv", envPtr: ptr });
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
function eventsToRows(events, sampleInfoBase) {
  const rows = [];
  let currentInstr = 0;
  let totalTicks = 0;
  for (const ev of events) {
    switch (ev.type) {
      case "setInstrument": {
        if (sampleInfoBase > 0) {
          const idx = Math.floor((ev.sampleInfoPtr - sampleInfoBase) / SAMPLE_DESC_SIZE);
          if (idx >= 0) currentInstr = idx + 1;
        }
        break;
      }
      case "setVolEnv":
        break;
      case "note": {
        const noteIdx = periodToNoteIndex(ev.period);
        const xmNote = amigaNoteToXM(noteIdx);
        rows.push({
          note: xmNote,
          instrument: currentInstr,
          volume: 0,
          effTyp: 0,
          eff: 0
        });
        for (let t = 1; t < ev.duration; t++) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
        }
        totalTicks += ev.duration;
        break;
      }
      case "rest": {
        for (let t = 0; t < ev.duration; t++) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
        }
        totalTicks += ev.duration;
        break;
      }
    }
  }
  return { rows, totalTicks };
}
function encodeRowsToStream(rows, _channel) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const cell = rows[i];
    const note = cell.note ?? 0;
    if (note > 0) {
      let duration = 1;
      while (i + duration < rows.length && (rows[i + duration].note ?? 0) === 0 && (rows[i + duration].instrument ?? 0) === 0) {
        duration++;
      }
      const periodIdx = note - 13;
      const period = periodIdx >= 0 && periodIdx < MOD_PERIODS.length ? MOD_PERIODS[periodIdx] : 0;
      if (period > 0) {
        out.push(period >> 8 & 255, period & 255);
        out.push(duration >> 8 & 255, duration & 255);
      }
      i += duration;
    } else {
      let duration = 0;
      while (i + duration < rows.length && (rows[i + duration].note ?? 0) === 0) {
        duration++;
      }
      if (duration > 0) {
        out.push(0, CMD_REST);
        out.push(duration >> 8 & 255, duration & 255);
        i += duration;
      } else {
        i++;
      }
    }
  }
  out.push(0, CMD_SEQ_ADVANCE);
  return new Uint8Array(out);
}
const daveLoweEncoder = {
  formatId: "daveLowe",
  encodePattern: encodeRowsToStream
};
async function parseDaveLoweFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isDaveLoweFormat(buf)) {
    throw new Error("Not a Dave Lowe module");
  }
  const ptrBase = CODE_BASE + PTR_TABLE_OFF;
  const sampleInfoPtr = u32BE(buf, ptrBase + 16);
  const endSampleInfo = u32BE(buf, ptrBase + 20);
  const firstSubsongPtr = u32BE(buf, ptrBase + 32);
  const metaBase = ptrBase + 36;
  const songNamePtr = u32BE(buf, metaBase + 0);
  const authorNamePtr = u32BE(buf, metaBase + 4);
  const embeddedTitle = songNamePtr > 0 ? readNullStr(buf, CODE_BASE + songNamePtr, 64) : "";
  const embeddedAuthor = authorNamePtr > 0 ? readNullStr(buf, CODE_BASE + authorNamePtr, 64) : "";
  const baseName = filename.split("/").pop() ?? filename;
  const filenameDerived = baseName.replace(/^dl\./i, "").replace(/\.(dl|dl_deli)$/i, "") || baseName;
  const moduleName = embeddedTitle.trim() || filenameDerived;
  const instruments = [];
  let numSamples = 0;
  if (sampleInfoPtr > 0 && endSampleInfo > sampleInfoPtr) {
    numSamples = Math.floor((endSampleInfo - sampleInfoPtr) / SAMPLE_DESC_SIZE);
    const sampleBase = CODE_BASE + sampleInfoPtr;
    for (let i = 0; i < numSamples; i++) {
      const descOff = sampleBase + i * SAMPLE_DESC_SIZE;
      if (descOff + SAMPLE_DESC_SIZE > buf.length) break;
      const loopType = u16BE(buf, descOff + 0);
      const sampleAddr = u32BE(buf, descOff + 2);
      const sampleLen = u16BE(buf, descOff + 6);
      const loopOff = u32BE(buf, descOff + 8);
      const loopLen = u16BE(buf, descOff + 12);
      const lenBytes = sampleLen * 2;
      const pcmFileOff = CODE_BASE + sampleAddr;
      if (sampleAddr === 0 || lenBytes === 0 || pcmFileOff + lenBytes > buf.length) {
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
      for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmFileOff + k];
      const loopStartRel = loopType > 0 && loopOff >= sampleAddr ? loopOff - sampleAddr : 0;
      const loopStart = loopType > 0 ? loopStartRel : 0;
      const loopEnd = loopType > 0 ? loopStartRel + loopLen * 2 : 0;
      instruments.push(createSamplerInstrument(
        i + 1,
        embeddedAuthor ? `${embeddedAuthor} ${i + 1}` : `DL Sample ${i + 1}`,
        pcm,
        64,
        8287,
        loopStart,
        loopEnd
      ));
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
  const channelPositionLists = [[], [], [], []];
  const patterns = [];
  const songPositions = [];
  if (firstSubsongPtr > 0) {
    const subsongTableOff = CODE_BASE + firstSubsongPtr;
    const channelListPtrs = [];
    for (let ch = 0; ch < 4; ch++) {
      const off = subsongTableOff + ch * 4;
      if (off + 4 > buf.length) {
        channelListPtrs.push(0);
      } else {
        channelListPtrs.push(u32BE(buf, off));
      }
    }
    for (let ch = 0; ch < 4; ch++) {
      if (channelListPtrs[ch] === 0) continue;
      const listOff = CODE_BASE + channelListPtrs[ch];
      let pos = listOff;
      while (pos + 4 <= buf.length) {
        const ptr = u32BE(buf, pos);
        if (ptr === 0) break;
        channelPositionLists[ch].push(ptr);
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
    const sectionRows = /* @__PURE__ */ new Map();
    const sectionBytes = /* @__PURE__ */ new Map();
    for (const sectionPtr of allSectionPtrs) {
      const fileOff = CODE_BASE + sectionPtr;
      if (fileOff >= buf.length) {
        sectionRows.set(sectionPtr, []);
        sectionBytes.set(sectionPtr, 0);
        continue;
      }
      const { events, byteSize } = parseCommandStream(buf, fileOff);
      const { rows } = eventsToRows(events, sampleInfoPtr);
      sectionRows.set(sectionPtr, rows);
      sectionBytes.set(sectionPtr, byteSize);
    }
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
          originalInstrumentCount: numSamples
        }
      });
      songPositions.push(posIdx);
    }
    const filePatternAddrs = [];
    const filePatternSizes = [];
    for (const sectionPtr of allSectionPtrs) {
      filePatternAddrs.push(CODE_BASE + sectionPtr);
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
    const result = {
      name: `${moduleName} [Dave Lowe]`,
      format: "MOD",
      patterns,
      instruments,
      songPositions,
      songLength: songPositions.length,
      restartPosition: 0,
      numChannels: 4,
      initialSpeed: 1,
      // 1 tick per row — durations are already expanded
      initialBPM: 125,
      linearPeriods: false,
      uadeEditableFileData: buffer.slice(0),
      uadeEditableFileName: filename,
      uadeVariableLayout: variableLayout
    };
    return result;
  }
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
    channels: Array.from({ length: 4 }, (_, ch) => ({
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
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length
    }
  });
  songPositions.push(0);
  return {
    name: `${moduleName} [Dave Lowe]`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  daveLoweEncoder,
  isDaveLoweFormat,
  parseDaveLoweFile
};
