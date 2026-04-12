import { c7 as amigaNoteToXM } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIN_FILE_SIZE = 1701;
const MAX_INSTRUMENTS = 36;
function findJeroenTelScanPos(buf) {
  const limit = 40;
  for (let pos = 0; pos + 3 < limit && pos + 3 < buf.length; pos += 2) {
    if (buf[pos] === 2 && buf[pos + 1] === 57 && buf[pos + 2] === 0 && buf[pos + 3] === 1) {
      return pos;
    }
  }
  return -1;
}
function readLong(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function readWord(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function scanJTDataPointers(buf) {
  const len = buf.length;
  let pos = 0;
  while (pos + 9 < len) {
    if (readLong(buf, pos) === 335602434) break;
    pos += 2;
  }
  if (pos + 9 >= len) return null;
  const d7 = readLong(buf, pos + 6);
  let pos2 = pos;
  while (pos2 + 3 < len) {
    if (readLong(buf, pos2) === 56099624) break;
    pos2 += 2;
  }
  if (pos2 + 3 >= len) return null;
  const origin = d7 - pos2 & 4294967295;
  let posR = 0;
  while (posR + 3 < len) {
    const v = readLong(buf, posR);
    if (v === 2990276863 || v === 201392383) break;
    posR += 2;
  }
  if (posR + 3 >= len) return null;
  let pos3 = posR;
  while (pos3 + 5 < len) {
    if (readWord(buf, pos3) === 9852) {
      pos3 += 2;
      break;
    }
    pos3++;
  }
  if (pos3 + 3 >= len) return null;
  const trackTableAbs = readLong(buf, pos3);
  pos3 += 4;
  const trackTableOff = trackTableAbs - origin & 4294967295;
  let pos4 = pos3;
  while (pos4 + 5 < len) {
    if (readWord(buf, pos4) === 18937) {
      pos4 += 2;
      break;
    }
    pos4++;
  }
  if (pos4 + 3 >= len) return null;
  const sampleTableAbs = readLong(buf, pos4);
  pos4 += 4;
  const sampleTableOff = sampleTableAbs - origin & 4294967295;
  let pos5 = pos4;
  while (pos5 + 7 < len) {
    if (readLong(buf, pos5) === 2500220) break;
    pos5 += 2;
  }
  if (pos5 + 7 >= len) return null;
  pos5 += 4;
  pos5 += 4;
  let pos6 = pos5;
  while (pos6 + 1 < len) {
    if (readWord(buf, pos6) === 9204) break;
    pos6++;
  }
  if (pos6 < 4 || pos6 + 1 >= len) return null;
  const subsongTableAbs = readLong(buf, pos6 - 4);
  const subsongTableOff = subsongTableAbs - origin & 4294967295;
  if (trackTableOff >= len || sampleTableOff >= len || subsongTableOff >= len) {
    return null;
  }
  return { origin, trackTableOff, subsongTableOff, sampleTableOff };
}
function parseJTTrack(buf, trackOff) {
  const entries = [];
  let pos = trackOff;
  const len = buf.length;
  const MAX_ENTRIES = 512;
  while (pos < len && entries.length < MAX_ENTRIES) {
    let d3 = buf[pos];
    let volume = 0;
    if (d3 >= 224) {
      pos++;
      if (pos >= len) break;
      volume = buf[pos];
      pos++;
      if (pos >= len) break;
      d3 = buf[pos];
    }
    const duration = d3 & 31;
    const glide = (d3 & 32) !== 0;
    const typeBits = d3 & 192;
    if (d3 >= 192) {
      pos++;
      if (pos >= len || buf[pos] === 255) break;
      entries.push({ duration, note: 0, instrument: 0, volume, slide: 0 });
      continue;
    }
    let note = 0;
    let instrument = 0;
    let slide = 0;
    if (typeBits === 64) {
      pos++;
      if (pos >= len) break;
      slide = buf[pos];
      pos++;
      if (pos >= len) break;
      note = buf[pos];
    } else if (typeBits === 128) {
      pos++;
      if (pos >= len) break;
      const instrByte = buf[pos];
      instrument = instrByte;
      pos++;
      if (pos >= len) break;
      const nextByte = buf[pos];
      if (nextByte & 128) {
        volume = nextByte & 127;
        pos++;
        if (pos >= len) break;
      }
      note = buf[pos];
    } else {
      pos++;
      if (pos >= len) break;
      note = buf[pos];
    }
    if (glide && slide === 0) {
      slide = 1;
    }
    entries.push({ duration, note, instrument, volume, slide });
    pos++;
    if (pos >= len || buf[pos] === 255) break;
  }
  return entries;
}
function isJeroenTelFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    const baseName = (filename.split("/").pop() ?? filename).toLowerCase();
    const hasPrefix = baseName.startsWith("jt.") || baseName.startsWith("mon_old.");
    const hasExtension = baseName.endsWith(".jt");
    if (!hasPrefix && !hasExtension) {
      return false;
    }
  }
  if (buf.length < MIN_FILE_SIZE) return false;
  const scanPos = findJeroenTelScanPos(buf);
  if (scanPos === -1) return false;
  if (scanPos + 11 >= buf.length) return false;
  if (buf[scanPos + 8] !== 102) return false;
  const d1 = buf[scanPos + 9];
  if (d1 === 0 || d1 >= 128) return false;
  if (buf[scanPos + 10] !== 78 || buf[scanPos + 11] !== 117) return false;
  const checkOff = scanPos + 12;
  if (checkOff + 3 >= buf.length) return false;
  const word0 = buf[checkOff] << 8 | buf[checkOff + 1];
  if (word0 === 19001) {
    for (let i = 1; i <= 4; i++) {
      const off = checkOff + i * 18;
      if (off + 1 >= buf.length) return false;
      const w = buf[off] << 8 | buf[off + 1];
      if (w !== 19001) return false;
    }
  } else {
    const long0 = (buf[checkOff] << 24 | buf[checkOff + 1] << 16 | buf[checkOff + 2] << 8 | buf[checkOff + 3]) >>> 0;
    if (long0 !== 2013272121) return false;
  }
  return true;
}
async function parseJeroenTelFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isJeroenTelFormat(buffer, filename)) {
    throw new Error("Not a Jeroen Tel module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^jt\./i, "").replace(/^mon_old\./i, "") || baseName;
  const scanPos = findJeroenTelScanPos(buf);
  const rawInstrumentCount = buf[scanPos + 9];
  const numInstruments = Math.min(rawInstrumentCount, MAX_INSTRUMENTS);
  const instruments = [];
  for (let i = 0; i < numInstruments; i++) {
    instruments.push({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
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
  const ptrs = scanJTDataPointers(buf);
  const patterns = [];
  const songPositions = [];
  if (ptrs) {
    const subsongOff = ptrs.subsongTableOff;
    const voiceSeqOffs = [];
    for (let v = 0; v < 4; v++) {
      if (subsongOff + v * 4 + 3 >= buf.length) {
        voiceSeqOffs.push(0);
        continue;
      }
      const abs = readLong(buf, subsongOff + v * 4);
      voiceSeqOffs.push(abs - ptrs.origin & 4294967295);
    }
    let speed1 = 6;
    if (subsongOff + 17 < buf.length) {
      speed1 = buf[subsongOff + 16] || 6;
    }
    const voiceSteps = [[], [], [], []];
    for (let v = 0; v < 4; v++) {
      let seqOff = voiceSeqOffs[v];
      if (seqOff >= buf.length) continue;
      let transpose = 0;
      const MAX_STEPS = 256;
      let stepCount = 0;
      while (seqOff < buf.length && stepCount < MAX_STEPS) {
        const b = buf[seqOff];
        if (b === 255 || b === 254) break;
        if (b >= 128) {
          transpose = b - 192 | 0;
          seqOff++;
          continue;
        }
        voiceSteps[v].push({ trackIndex: b, transpose });
        seqOff++;
        stepCount++;
      }
    }
    const numSteps = Math.max(1, ...voiceSteps.map((s) => s.length));
    for (let step = 0; step < numSteps; step++) {
      const channelRows = [[], [], [], []];
      let maxRows = 0;
      for (let ch = 0; ch < 4; ch++) {
        const vstep = voiceSteps[ch][step];
        if (!vstep) continue;
        const tpOff = ptrs.trackTableOff + vstep.trackIndex * 4;
        if (tpOff + 3 >= buf.length) continue;
        const trackAbs = readLong(buf, tpOff);
        const trackFileOff = trackAbs - ptrs.origin & 4294967295;
        if (trackFileOff >= buf.length) continue;
        const entries = parseJTTrack(buf, trackFileOff);
        const rows = [];
        for (const entry of entries) {
          const noteVal = entry.note > 0 ? amigaNoteToXM(entry.note + vstep.transpose) : 0;
          const clampedNote = noteVal > 0 ? Math.max(1, Math.min(96, noteVal)) : 0;
          rows.push({
            note: clampedNote,
            instrument: entry.instrument > 0 ? entry.instrument + 1 : 0,
            volume: entry.volume > 0 ? 16 + Math.min(entry.volume, 64) : 0,
            effTyp: entry.slide > 0 ? 3 : 0,
            eff: entry.slide > 0 ? Math.min(entry.slide, 255) : 0,
            effTyp2: 0,
            eff2: 0
          });
          for (let d = 1; d < Math.max(1, entry.duration); d++) {
            rows.push({
              note: 0,
              instrument: 0,
              volume: 0,
              effTyp: 0,
              eff: 0,
              effTyp2: 0,
              eff2: 0
            });
          }
        }
        channelRows[ch] = rows;
        if (rows.length > maxRows) maxRows = rows.length;
      }
      if (maxRows === 0) maxRows = 64;
      let patLen = 64;
      if (maxRows <= 16) patLen = 16;
      else if (maxRows <= 32) patLen = 32;
      else if (maxRows <= 64) patLen = 64;
      else if (maxRows <= 128) patLen = 128;
      else patLen = 128;
      const emptyCell = {
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0
      };
      const channels = Array.from({ length: 4 }, (_, ch) => {
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
      const pattern = {
        id: `pattern-${step}`,
        name: `Pattern ${step}`,
        length: patLen,
        channels,
        importMetadata: {
          sourceFormat: "MOD",
          sourceFile: filename,
          importedAt: (/* @__PURE__ */ new Date()).toISOString(),
          originalChannelCount: 4,
          originalPatternCount: numSteps,
          originalInstrumentCount: numInstruments
        }
      };
      patterns.push(pattern);
      songPositions.push(step);
    }
    if (patterns.length > 0) {
      return {
        name: `${moduleName} [Jeroen Tel] (${numInstruments} smp)`,
        format: "MOD",
        patterns,
        instruments,
        songPositions,
        songLength: songPositions.length,
        restartPosition: 0,
        numChannels: 4,
        initialSpeed: speed1,
        initialBPM: 125,
        linearPeriods: false,
        uadeEditableFileData: buffer.slice(0),
        uadeEditableFileName: filename
      };
    }
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
  const fallbackPattern = {
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
      originalInstrumentCount: numInstruments
    }
  };
  return {
    name: `${moduleName} [Jeroen Tel] (${numInstruments} smp)`,
    format: "MOD",
    patterns: [fallbackPattern],
    instruments,
    songPositions: [0],
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
  isJeroenTelFormat,
  parseJeroenTelFile
};
