function encodeTFMX7VCell(cell) {
  const buf = new Uint8Array(2);
  if (!cell.note || cell.note <= 0) return buf;
  const tfmxNote = Math.max(0, Math.min(63, cell.note - 1 | 0));
  buf[0] = tfmxNote & 127;
  if (cell.instrument && cell.instrument > 0) {
    buf[1] = cell.instrument & 31;
  }
  return buf;
}
const MIN_FILE_SIZE = 32;
const TFMX_TRACKTAB_STEP_SIZE_4V = 12;
const TFMX_TRACKTAB_STEP_SIZE_7V = 28;
const TFMX_SONGTAB_ENTRY_SIZE_4V = 6;
const TFMX_SONGTAB_ENTRY_SIZE_7V = 8;
const TFMX_SAMPLE_STRUCT_SIZE = 18 + 4 + 2 + 4 + 2;
const PATTERN_LENGTH = 64;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
const MAGIC_TFMX = (84 << 24 | 70 << 16 | 77 << 8 | 88) >>> 0;
const MAGIC_FIND1 = (48 << 24 | 129 << 16 | 65 << 8 | 250) >>> 0;
function checkTFMX7VSong(buf, songOff) {
  if (songOff + 20 > buf.length) return false;
  if (u32BE(buf, songOff) !== MAGIC_TFMX) return false;
  if (buf[songOff + 4] !== 0) return false;
  let a0 = songOff + 4;
  if (a0 + 2 > buf.length) return false;
  const w0 = u16BE(buf, a0);
  a0 += 2;
  if (a0 + 2 > buf.length) return false;
  const w1 = u16BE(buf, a0);
  a0 += 2;
  let d1 = 2 + w0 + w1 << 6 >>> 0;
  if (a0 + 2 > buf.length) return false;
  const w2 = u16BE(buf, a0);
  a0 += 2;
  let d2 = 1 + w2 >>> 0;
  if (a0 + 2 > buf.length) return false;
  const w3 = u16BE(buf, a0);
  a0 += 2;
  const d3 = Math.imul(1 + w3, 28) >>> 0;
  if (a0 + 2 > buf.length) return false;
  const w4 = u16BE(buf, a0);
  a0 += 2;
  d2 = Math.imul(d2, w4) >>> 0;
  d1 = d1 + d2 + d3 >>> 0;
  a0 += 2;
  if (a0 + 2 > buf.length) return false;
  const w5 = u16BE(buf, a0);
  a0 += 2;
  d2 = 1 + w5 << 3 >>> 0;
  d1 = d1 + d2 + 32 >>> 0;
  const checkOff = a0 + d1;
  if (checkOff + 32 > buf.length) return false;
  if (u32BE(buf, checkOff) !== 0) return false;
  const d2final = u16BE(buf, checkOff + 4);
  if (d2final === 0) return false;
  const d2times2 = d2final * 2 >>> 0;
  if (checkOff + 34 > buf.length) return false;
  const cmpVal = u32BE(buf, checkOff + 30);
  return d2times2 === cmpVal;
}
function findTFMX7VSongOffset(buf) {
  if (buf.length >= 4 && u16BE(buf, 0) === 24576) {
    if (2 + 2 > buf.length) return -1;
    const d1 = u16BE(buf, 2);
    if (d1 === 0 || d1 & 32768 || d1 & 1) return -1;
    let scanOff = 2 + d1;
    let found = -1;
    for (let i = 0; i <= 10; i++) {
      if (scanOff + 4 > buf.length) break;
      if (u32BE(buf, scanOff) === MAGIC_FIND1) {
        found = scanOff;
        break;
      }
      scanOff += 2;
    }
    if (found < 0) return -1;
    const afterFind = found + 4;
    if (afterFind + 2 > buf.length) return -1;
    const d1b = u16BE(buf, afterFind);
    if (d1b === 0 || d1b & 32768 || d1b & 1) return -1;
    const songOff = afterFind + d1b;
    return checkTFMX7VSong(buf, songOff) ? songOff : -1;
  }
  return checkTFMX7VSong(buf, 0) ? 0 : -1;
}
function isJochenHippel7VFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u16BE(buf, 0) === 24576) {
    if (2 + 2 > buf.length) return false;
    const d1 = u16BE(buf, 2);
    if (d1 === 0) return false;
    if (d1 & 32768) return false;
    if (d1 & 1) return false;
    let scanOff = 2 + d1;
    let found = -1;
    for (let i = 0; i <= 10; i++) {
      if (scanOff + 4 > buf.length) break;
      if (u32BE(buf, scanOff) === MAGIC_FIND1) {
        found = scanOff;
        break;
      }
      scanOff += 2;
    }
    if (found < 0) return false;
    const afterFind = found + 4;
    if (afterFind + 2 > buf.length) return false;
    const d1b = u16BE(buf, afterFind);
    if (d1b === 0) return false;
    if (d1b & 32768) return false;
    if (d1b & 1) return false;
    const songOff = afterFind + d1b;
    return checkTFMX7VSong(buf, songOff);
  }
  return checkTFMX7VSong(buf, 0);
}
function readTFMX7VLayout(buf, songOff) {
  const h = songOff;
  const numSndSeqs = u16BE(buf, h + 4) + 1;
  const numVolSeqs = u16BE(buf, h + 6) + 1;
  const numPatterns = u16BE(buf, h + 8) + 1;
  const numTrackSteps = u16BE(buf, h + 10) + 1;
  const numSongs = u16BE(buf, h + 16);
  const numSamples = Math.min(u16BE(buf, h + 18), 256);
  let offs = h + 32;
  const sndModSeqsOff = offs;
  offs += numSndSeqs * 64;
  const volModSeqsOff = offs;
  offs += numVolSeqs * 64;
  const patternsOff = offs;
  offs += numPatterns * PATTERN_LENGTH;
  const trackTableOff = offs;
  const tryStepSize = (stepSize, songtabSize) => {
    let p = trackTableOff + numTrackSteps * stepSize;
    const subSongTabOff = p;
    p += (numSongs + 1) * songtabSize;
    if (p >= buf.length) return null;
    const sampleHeadersOff = p;
    p += numSamples * TFMX_SAMPLE_STRUCT_SIZE;
    if (p > buf.length) return null;
    return { trackStepLen: stepSize, subSongTabOff, sampleHeadersOff, sampleDataOff: p };
  };
  const layout7V = tryStepSize(TFMX_TRACKTAB_STEP_SIZE_7V, TFMX_SONGTAB_ENTRY_SIZE_7V);
  const layout4V = tryStepSize(TFMX_TRACKTAB_STEP_SIZE_4V, TFMX_SONGTAB_ENTRY_SIZE_4V);
  const chosen = layout7V ?? layout4V;
  if (!chosen) {
    throw new Error("TFMX-7V: layout did not fit in buffer");
  }
  return {
    songOff,
    numSndSeqs,
    numVolSeqs,
    numPatterns,
    numTrackSteps,
    numSongs,
    numSamples,
    sndModSeqsOff,
    volModSeqsOff,
    patternsOff,
    trackTableOff,
    ...chosen,
    voices: chosen === layout7V ? 7 : 4
  };
}
function extractSamples(buf, sampleHeadersOff, numSamples, sampleDataOff) {
  const headerBlockSize = numSamples * TFMX_SAMPLE_STRUCT_SIZE;
  const sampleHeaders = buf.slice(sampleHeadersOff, sampleHeadersOff + headerBlockSize);
  const sampleData = buf.slice(sampleDataOff);
  return { sampleHeaders, sampleData };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function tfmxNoteToXM(tfmxNote, transpose) {
  if (tfmxNote === 0 || tfmxNote === 1) return 0;
  const t = transpose << 24 >> 24;
  let n = tfmxNote + t | 0;
  if (n <= 1) return 0;
  if (n > 95) n = 95;
  return n + 1;
}
function decodeTFMX7VPattern(buf, patternsBase, trackStepBuf, trackColumnSize, numChannels) {
  const rows = Array.from({ length: numChannels }, () => {
    const arr = [];
    for (let r = 0; r < 32; r++) arr.push(emptyCell());
    return arr;
  });
  for (let voice = 0; voice < numChannels; voice++) {
    const colOff = voice * trackColumnSize;
    const pt = trackStepBuf[colOff] | 0;
    const tr = trackStepBuf[colOff + 1] << 24 >> 24;
    const st = trackStepBuf[colOff + 2] << 24 >> 24;
    const patOff = patternsBase + pt * PATTERN_LENGTH;
    if (patOff < 0 || patOff + PATTERN_LENGTH > buf.length) continue;
    for (let row = 0; row < 32; row++) {
      const noteByte = buf[patOff + row * 2];
      const infoByte = buf[patOff + row * 2 + 1];
      const noteVal = noteByte & 127;
      if (noteVal === 0) continue;
      const cell = rows[voice][row];
      cell.note = tfmxNoteToXM(noteVal, tr);
      if ((noteByte & 128) === 0) {
        const instr = (infoByte & 31) + st & 255;
        cell.instrument = instr > 0 ? instr : 0;
      }
    }
  }
  return rows;
}
function parseJochenHippel7VFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isJochenHippel7VFormat(buf)) throw new Error("Not a Jochen Hippel 7V module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^(hip7|s7g)\./i, "") || baseName;
  const songOff = findTFMX7VSongOffset(buf);
  if (songOff < 0) {
    throw new Error("TFMX-7V: could not locate song header");
  }
  const layout = readTFMX7VLayout(buf, songOff);
  const { sampleHeaders, sampleData } = extractSamples(
    buf,
    layout.sampleHeadersOff,
    layout.numSamples,
    layout.sampleDataOff
  );
  const sndModPool = buf.slice(layout.sndModSeqsOff, layout.sndModSeqsOff + layout.numSndSeqs * 64);
  const instruments = [];
  for (let i = 0; i < layout.numVolSeqs; i++) {
    const volSeqAbsOff = layout.volModSeqsOff + i * 64;
    const volModSeqData = buf.slice(volSeqAbsOff, volSeqAbsOff + 64);
    let nonZero = false;
    for (let b = 0; b < volModSeqData.length; b++) {
      if (volModSeqData[b] !== 0) {
        nonZero = true;
        break;
      }
    }
    if (!nonZero) continue;
    const tfmxConfig = {
      sndSeqsCount: layout.numSndSeqs,
      sndModSeqData: sndModPool,
      volModSeqData,
      sampleCount: layout.numSamples,
      sampleHeaders,
      sampleData
    };
    const uadeChipRam = {
      moduleBase: 0,
      moduleSize: buf.length,
      // Per-instrument chip RAM base = the absolute offset of this VolModSeq.
      // setVolByte writes to instrBase + N (vol bytes 0..63), setSndByte writes
      // to instrBase + 64 + N which is wrong for 7V because SndModSeq is a
      // SHARED pool, not contiguous with VolModSeq. We expose a special
      // metadata field below so the editor can compute the correct address.
      instrBase: volSeqAbsOff,
      instrSize: 64,
      sections: {
        volModSeqsBase: layout.volModSeqsOff,
        sndModSeqsBase: layout.sndModSeqsOff,
        sampleHeadersBase: layout.sampleHeadersOff,
        sampleDataBase: layout.sampleDataOff,
        patternsBase: layout.patternsOff,
        trackTableBase: layout.trackTableOff
      }
    };
    instruments.push({
      id: i + 1,
      name: `Instrument ${i + 1}`,
      type: "synth",
      synthType: "TFMXSynth",
      tfmx: tfmxConfig,
      uadeChipRam,
      effects: [],
      volume: 64,
      pan: 0
    });
  }
  let firstStep = 0;
  let lastStep = layout.numTrackSteps - 1;
  if (layout.subSongTabOff + 4 <= buf.length) {
    firstStep = u16BE(buf, layout.subSongTabOff + 0);
    lastStep = u16BE(buf, layout.subSongTabOff + 2);
  }
  if (firstStep < 0 || firstStep >= layout.numTrackSteps) firstStep = 0;
  if (lastStep < firstStep || lastStep >= layout.numTrackSteps) {
    lastStep = layout.numTrackSteps - 1;
  }
  const trackColumnSize = layout.trackStepLen / layout.voices | 0;
  const channelPan = [-50, 50, 50, -50, -50, 50, 50];
  const trackerPatterns = [];
  const songPositions = [];
  for (let step = firstStep; step <= lastStep; step++) {
    const stepOff = layout.trackTableOff + step * layout.trackStepLen;
    if (stepOff + layout.trackStepLen > buf.length) break;
    const trackStepBuf = buf.slice(stepOff, stepOff + layout.trackStepLen);
    const channelRows = decodeTFMX7VPattern(
      buf,
      layout.patternsOff,
      trackStepBuf,
      trackColumnSize,
      layout.voices
    );
    const patIdx = trackerPatterns.length;
    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx + 1} (step ${step})`,
      length: 32,
      channels: Array.from({ length: layout.voices }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: channelPan[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows: channelRows[ch]
      })),
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: layout.voices,
        originalPatternCount: layout.numPatterns,
        originalInstrumentCount: instruments.length
      }
    });
    songPositions.push(patIdx);
  }
  if (trackerPatterns.length === 0) {
    const emptyRows = Array.from({ length: 32 }, () => emptyCell());
    trackerPatterns.push({
      id: "pattern-0",
      name: "Pattern 0",
      length: 32,
      channels: Array.from({ length: layout.voices }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: channelPan[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows: emptyRows.map((c) => ({ ...c }))
      })),
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: layout.voices,
        originalPatternCount: layout.numPatterns,
        originalInstrumentCount: instruments.length
      }
    });
    songPositions.push(0);
  }
  const uadePatternLayout = {
    formatId: "tfmx7v",
    patternDataFileOffset: layout.patternsOff,
    bytesPerCell: 2,
    rowsPerPattern: 32,
    numChannels: layout.voices,
    numPatterns: trackerPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeTFMX7VCell,
    getCellFileOffset: (pattern, row, channel) => {
      if (pattern < 0 || pattern >= trackerPatterns.length) return -1;
      if (row < 0 || row >= 32) return -1;
      if (channel < 0 || channel >= layout.voices) return -1;
      const step = firstStep + pattern;
      const stepOff = layout.trackTableOff + step * layout.trackStepLen;
      if (stepOff + layout.trackStepLen > buf.length) return -1;
      const pt = buf[stepOff + channel * trackColumnSize];
      const patAbs = layout.patternsOff + pt * PATTERN_LENGTH;
      const cellAbs = patAbs + row * 2;
      if (cellAbs + 2 > buf.length) return -1;
      return cellAbs;
    }
  };
  return {
    name: `${moduleName} [Jochen Hippel 7V]`,
    format: "MOD",
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: layout.voices,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
export {
  isJochenHippel7VFormat,
  parseJochenHippel7VFile
};
