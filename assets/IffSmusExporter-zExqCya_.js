const DURATION_TABLE = [
  32,
  16,
  8,
  4,
  2,
  -1,
  -1,
  -1,
  48,
  24,
  12,
  6,
  3,
  -1,
  -1,
  -1
];
const DURATION_TO_INDEX = /* @__PURE__ */ new Map();
for (let i = 0; i < DURATION_TABLE.length; i++) {
  if (DURATION_TABLE[i] > 0) {
    DURATION_TO_INDEX.set(DURATION_TABLE[i], i);
  }
}
const EVENT_REST = 128;
const EVENT_INSTRUMENT = 129;
const EVENT_MARK = 255;
const TEMPO_TABLE = [
  64131,
  62757,
  61412,
  60096,
  58809,
  57548,
  56315,
  55108,
  53928,
  52772,
  51641,
  50535,
  49452,
  48392,
  47355,
  46340,
  45347,
  44376,
  43425,
  42494,
  41584,
  40693,
  39821,
  38967,
  38132,
  37315,
  36516,
  35733,
  34968,
  34218,
  33485,
  32768,
  32065,
  31378,
  30706,
  30048,
  29404,
  28774,
  28157,
  27554,
  26964,
  26386,
  25820,
  25267,
  24726,
  24196,
  23677,
  23170,
  22673,
  22188,
  21712,
  21247,
  20792,
  20346,
  19910,
  19483,
  19066,
  18657,
  18258,
  17866,
  17484,
  17109,
  16742,
  16384,
  16032,
  15689,
  15353,
  15024,
  14702,
  14387,
  14078,
  13777,
  13482,
  13193,
  12910,
  12633,
  12363,
  12098,
  11838,
  11585,
  11336,
  11094,
  10856,
  10623,
  10396,
  10173,
  9955,
  9741,
  9533,
  9328,
  9129,
  8933,
  8742,
  8554,
  8371,
  8192,
  8016,
  7844,
  7676,
  7512,
  7351,
  7193,
  7039,
  6888,
  6741,
  6596,
  6455,
  6316,
  6181,
  6049,
  5919,
  5792,
  5668,
  5547,
  5428,
  5311,
  5198,
  5086,
  4977,
  4870,
  4766,
  4664,
  4564,
  4466,
  4371,
  4277,
  4185,
  4096
];
function ticksToDurationIndex(ticks) {
  if (DURATION_TO_INDEX.has(ticks)) {
    return DURATION_TO_INDEX.get(ticks);
  }
  let bestIdx = 3;
  let bestDist = Infinity;
  for (let i = 0; i < DURATION_TABLE.length; i++) {
    if (DURATION_TABLE[i] < 0) continue;
    const dist = Math.abs(DURATION_TABLE[i] - ticks);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}
function bpmSpeedToRawTempo(bpm, speed) {
  if (bpm <= 0 || speed <= 0) return 8023;
  let bestRawTempo = 8023;
  let bestDist = Infinity;
  for (let idx = 0; idx < TEMPO_TABLE.length; idx++) {
    const tableVal = TEMPO_TABLE[idx];
    const tSpeed = tableVal >>> 12;
    if (tSpeed === 0) continue;
    const speedShifted = tSpeed << 12;
    const calculatedTempo = Math.floor(tableVal * 32768 / speedShifted);
    const ciaTimer = Math.floor(calculatedTempo * 11932 / 32768);
    if (ciaTimer === 0) continue;
    const resultBpm = Math.round(709379 * 5 / (2 * ciaTimer));
    const dist = Math.abs(resultBpm - bpm) + Math.abs(tSpeed - speed) * 10;
    if (dist < bestDist) {
      bestDist = dist;
      const quotient = TEMPO_TABLE[idx];
      bestRawTempo = Math.floor(235929600 / quotient);
    }
  }
  return Math.max(0, Math.min(65535, bestRawTempo));
}
function writeFourCC(buf, off, str) {
  for (let i = 0; i < 4; i++) {
    buf[off + i] = str.charCodeAt(i) & 255;
  }
}
function writeU32BE(buf, off, val) {
  buf[off] = val >>> 24 & 255;
  buf[off + 1] = val >>> 16 & 255;
  buf[off + 2] = val >>> 8 & 255;
  buf[off + 3] = val & 255;
}
function writeU16BE(buf, off, val) {
  buf[off] = val >>> 8 & 255;
  buf[off + 1] = val & 255;
}
function writeString(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function makeChunk(id, data) {
  const padded = (data.length & 1) !== 0;
  const chunkSize = 8 + data.length + (padded ? 1 : 0);
  const chunk = new Uint8Array(chunkSize);
  writeFourCC(chunk, 0, id);
  writeU32BE(chunk, 4, data.length);
  chunk.set(data, 8);
  return chunk;
}
async function exportIffSmus(song) {
  const warnings = [];
  const numChannels = Math.max(1, Math.min(4, song.numChannels));
  if (song.numChannels > 4) {
    warnings.push(`SMUS supports max 4 channels; truncating from ${song.numChannels} to 4`);
  }
  let songName = song.name || "Untitled";
  let author = "";
  songName = songName.replace(/\s*\[SMUS\]\s*$/, "");
  const authorMatch = songName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (authorMatch) {
    songName = authorMatch[1].trim();
    author = authorMatch[2].trim();
  }
  const nameBytes = new Uint8Array(songName.length);
  writeString(nameBytes, 0, songName, songName.length);
  const nameChunk = makeChunk("NAME", nameBytes);
  let authChunk = null;
  if (author.length > 0) {
    const authBytes = new Uint8Array(author.length);
    writeString(authBytes, 0, author, author.length);
    authChunk = makeChunk("AUTH", authBytes);
  }
  const rawTempo = bpmSpeedToRawTempo(song.initialBPM, song.initialSpeed);
  const shdrData = new Uint8Array(4);
  writeU16BE(shdrData, 0, rawTempo);
  shdrData[2] = 127;
  shdrData[3] = numChannels;
  const shdrChunk = makeChunk("SHDR", shdrData);
  const ins1Chunks = [];
  const numInstruments = Math.min(255, song.instruments.length);
  for (let i = 0; i < numInstruments; i++) {
    const inst = song.instruments[i];
    const instName = inst.name || `Instrument ${i + 1}`;
    const ins1Data = new Uint8Array(4 + instName.length);
    ins1Data[0] = i;
    ins1Data[1] = 0;
    ins1Data[2] = 0;
    ins1Data[3] = 0;
    writeString(ins1Data, 4, instName, instName.length);
    ins1Chunks.push(makeChunk("INS1", ins1Data));
  }
  const trakChunks = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const events = [];
    let lastInstr = -1;
    let i = 0;
    const flatRows = [];
    for (const posIdx of song.songPositions) {
      const pat = song.patterns[posIdx];
      if (!pat || ch >= pat.channels.length) continue;
      const channel = pat.channels[ch];
      for (let row = 0; row < pat.length; row++) {
        const cell = channel.rows[row];
        flatRows.push({
          note: (cell == null ? void 0 : cell.note) ?? 0,
          instrument: (cell == null ? void 0 : cell.instrument) ?? 0
        });
      }
    }
    while (i < flatRows.length) {
      const cell = flatRows[i];
      if (cell.note > 0 && cell.note <= 96) {
        if (cell.instrument > 0 && cell.instrument !== lastInstr) {
          events.push({ type: EVENT_INSTRUMENT, data: cell.instrument - 1 & 255 });
          lastInstr = cell.instrument;
        }
        let duration = 1;
        let j = i + 1;
        while (j < flatRows.length) {
          const next = flatRows[j];
          if (next.note !== 0 || next.instrument !== 0) break;
          duration++;
          j++;
        }
        const midiNote = Math.max(0, Math.min(127, cell.note + 11));
        const durIdx = ticksToDurationIndex(duration);
        events.push({ type: midiNote, data: durIdx & 15 });
        i = j;
      } else {
        let duration = 0;
        let j = i;
        while (j < flatRows.length) {
          const next = flatRows[j];
          if (next.note !== 0) break;
          if (next.instrument !== 0) break;
          duration++;
          j++;
        }
        if (duration === 0) {
          duration = 1;
          j = i + 1;
        }
        const durIdx = ticksToDurationIndex(duration);
        events.push({ type: EVENT_REST, data: durIdx & 15 });
        i = j;
      }
    }
    events.push({ type: EVENT_MARK, data: 255 });
    const trakData = new Uint8Array(events.length * 2);
    for (let e = 0; e < events.length; e++) {
      trakData[e * 2] = events[e].type & 255;
      trakData[e * 2 + 1] = events[e].data & 255;
    }
    trakChunks.push(makeChunk("TRAK", trakData));
  }
  let innerSize = 4;
  innerSize += nameChunk.length;
  if (authChunk) innerSize += authChunk.length;
  innerSize += shdrChunk.length;
  for (const ins of ins1Chunks) innerSize += ins.length;
  for (const trk of trakChunks) innerSize += trk.length;
  const totalSize = 8 + innerSize;
  const output = new Uint8Array(totalSize);
  let pos = 0;
  writeFourCC(output, pos, "FORM");
  pos += 4;
  writeU32BE(output, pos, innerSize);
  pos += 4;
  writeFourCC(output, pos, "SMUS");
  pos += 4;
  output.set(nameChunk, pos);
  pos += nameChunk.length;
  if (authChunk) {
    output.set(authChunk, pos);
    pos += authChunk.length;
  }
  output.set(shdrChunk, pos);
  pos += shdrChunk.length;
  for (const ins of ins1Chunks) {
    output.set(ins, pos);
    pos += ins.length;
  }
  for (const trk of trakChunks) {
    output.set(trk, pos);
    pos += trk.length;
  }
  const baseName = songName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "untitled";
  const filename = `${baseName}.smus`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportIffSmus
};
