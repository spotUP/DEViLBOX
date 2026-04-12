const MIN_FILE_SIZE = 260;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_CELL = 4;
const NUM_SAMPLES = 31;
const PVP_PERIODS = [
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
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function periodToNote(period) {
  if (period === 0) return 0;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < PVP_PERIODS.length; i++) {
    const dist = Math.abs(PVP_PERIODS[i] - period);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return 0;
  const note = bestIdx + 13;
  return note >= 1 && note <= 96 ? note : 0;
}
function isPeterVerswyvelenPackerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const base = i * 8;
    if ((u16BE(buf, base) & 32768) !== 0) return false;
    const w1 = u16BE(buf, base + 2);
    if (w1 > 64) return false;
    if ((w1 & 32768) !== 0) return false;
    if ((u16BE(buf, base + 4) & 32768) !== 0) return false;
    if ((u16BE(buf, base + 6) & 32768) !== 0) return false;
  }
  const patCount = u16BE(buf, 248);
  if (patCount === 0) return false;
  if ((patCount & 32768) !== 0) return false;
  const songLen = u16BE(buf, 250);
  if (songLen === 0) return false;
  if ((songLen & 32768) !== 0) return false;
  if ((songLen & 1) !== 0) return false;
  const val252 = u16BE(buf, 252);
  if (songLen >= val252) return false;
  const limit = u16BE(buf, 254);
  if (limit === 0) return false;
  if ((limit & 32768) !== 0) return false;
  if (patCount >= 2) {
    const stepCount = patCount - 2;
    const stepTableEnd = 256 + stepCount * 2;
    if (buf.length < stepTableEnd) return false;
    for (let i = 0; i < stepCount; i++) {
      const s = u16BE(buf, 256 + i * 2);
      if ((s & 32768) !== 0) return false;
      if ((s & 1) !== 0) return false;
      if (s > limit) return false;
      if (i < stepCount - 1) {
        const next = u16BE(buf, 258 + i * 2);
        if (s > next) return false;
      }
    }
  }
  return true;
}
function parseCell(buf, off) {
  const b0 = buf[off];
  const b1 = buf[off + 1];
  const b2 = buf[off + 2];
  const b3 = buf[off + 3];
  const instrument = b0 & 240 | b2 >> 4 & 15;
  const period = (b0 & 15) << 8 | b1;
  const effTyp = b2 & 15;
  const eff = b3;
  return { period, instrument, effTyp, eff };
}
function extractPVPPatterns(buf, patCount, songLen) {
  const stepCount = patCount >= 2 ? patCount - 2 : 0;
  const stepTableStart = 256;
  const patternDataStart = stepTableStart + stepCount * 2;
  const stepEntries = [];
  for (let i = 0; i < stepCount; i++) {
    stepEntries.push(u16BE(buf, stepTableStart + i * 2));
  }
  const uniqueOffsets = [];
  const offsetToPatIdx = /* @__PURE__ */ new Map();
  for (const off of stepEntries) {
    if (!offsetToPatIdx.has(off)) {
      offsetToPatIdx.set(off, uniqueOffsets.length);
      uniqueOffsets.push(off);
    }
  }
  const numPositions = Math.floor(songLen / 2);
  const songPositions = [];
  for (let i = 0; i < numPositions && i < stepEntries.length; i++) {
    songPositions.push(offsetToPatIdx.get(stepEntries[i]) ?? 0);
  }
  if (songPositions.length === 0) songPositions.push(0);
  const patternSize = ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
  const patterns = [];
  let maxInstrument = 0;
  for (let p = 0; p < uniqueOffsets.length; p++) {
    const dataOff = patternDataStart + uniqueOffsets[p];
    if (dataOff + patternSize > buf.length) continue;
    const channels = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows = [];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const cellOff = dataOff + (r * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        if (cellOff + BYTES_PER_CELL > buf.length) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const cell = parseCell(buf, cellOff);
        const note = periodToNote(cell.period);
        if (cell.instrument > maxInstrument) maxInstrument = cell.instrument;
        rows.push({
          note,
          instrument: cell.instrument,
          volume: 0,
          effTyp: cell.effTyp,
          eff: cell.eff,
          effTyp2: 0,
          eff2: 0
        });
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
        rows
      });
    }
    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: ROWS_PER_PATTERN,
      channels
    });
  }
  if (patterns.length === 0) return null;
  let totalNotes = 0;
  for (const pat of patterns) {
    for (const ch of pat.channels) {
      for (const row of ch.rows) {
        if (row.note > 0 && row.note < 97) totalNotes++;
      }
    }
  }
  if (totalNotes === 0) return null;
  return { patterns, songPositions, instrumentCount: maxInstrument };
}
function parsePeterVerswyvelenPackerFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isPeterVerswyvelenPackerFormat(buf)) throw new Error("Not a Peter Verswyvelen Packer module");
  const baseName = (filename.split("/").pop() ?? filename).split("\\").pop() ?? filename;
  const moduleName = baseName.replace(/^pvp\./i, "") || baseName;
  const patCount = u16BE(buf, 248);
  const songLen = u16BE(buf, 250);
  const instruments = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const base = i * 8;
    const length = u16BE(buf, base) * 2;
    const volume = u16BE(buf, base + 2);
    if (length > 0) {
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: Math.min(64, volume),
        pan: 0
      });
    }
  }
  let patterns = [];
  let songPositions = [0];
  const extracted = extractPVPPatterns(buf, patCount, songLen);
  if (extracted) {
    patterns = extracted.patterns;
    songPositions = extracted.songPositions;
    while (instruments.length < extracted.instrumentCount) {
      instruments.push({
        id: instruments.length + 1,
        name: `Sample ${instruments.length + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  if (patterns.length === 0) {
    const emptyRows = Array.from({ length: ROWS_PER_PATTERN }, () => ({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    }));
    patterns = [{
      id: "pattern-0",
      name: "Pattern 0",
      length: ROWS_PER_PATTERN,
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
        rows: emptyRows.map((r) => ({ ...r }))
      }))
    }];
    songPositions = [0];
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
  }
  const extractInfo = patterns.length > 1 ? ` (${patterns.length} pat, ${instruments.length} smp)` : "";
  return {
    name: `${moduleName} [Peter Verswyvelen Packer]${extractInfo}`,
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
    uadeEditableFileName: filename
  };
}
export {
  isPeterVerswyvelenPackerFormat,
  parsePeterVerswyvelenPackerFile
};
