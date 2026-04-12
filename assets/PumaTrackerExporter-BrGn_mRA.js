const HEADER_SIZE = 80;
const ORDER_ENTRY_SIZE = 14;
const NUM_ROWS = 32;
function encodeCell(cell) {
  const row = { noteX2: 0, instrEffect: 0, param: 0 };
  const note = cell.note ?? 0;
  if (note > 0) {
    row.noteX2 = Math.max(0, (note - 12) * 2);
    if (row.noteX2 <= 0) row.noteX2 = 2;
    if (row.noteX2 > 254) row.noteX2 = 254;
  }
  const instr = (cell.instrument ?? 0) & 31;
  let effType = 0;
  let param = 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  switch (effTyp) {
    case 12:
      effType = 1;
      param = Math.min(eff, 64);
      break;
    case 2:
      effType = 2;
      param = eff;
      break;
    case 1:
      effType = 3;
      param = eff;
      break;
  }
  row.instrEffect = instr & 31 | (effType & 7) << 5;
  row.param = param;
  return row;
}
function rowsEqual(a, b) {
  return a.noteX2 === b.noteX2 && a.instrEffect === b.instrEffect && a.param === b.param;
}
function rleEncodePattern(rows) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const current = rows[i];
    let runLen = 1;
    while (i + runLen < rows.length && runLen < NUM_ROWS - i && rowsEqual(current, rows[i + runLen])) {
      runLen++;
    }
    out.push(current.noteX2, current.instrEffect, current.param, runLen);
    i += runLen;
  }
  return new Uint8Array(out);
}
function extractOriginalData(originalData) {
  const view = new DataView(originalData);
  const bytes = new Uint8Array(originalData);
  const numInstruments = view.getUint16(16, false);
  const sampleEntries = [];
  for (let i = 0; i < 10; i++) {
    const offset = view.getUint32(20 + i * 4, false);
    const length = view.getUint16(60 + i * 2, false) * 2;
    if (offset > 0 && length > 0 && offset < bytes.length) {
      const avail = Math.min(length, bytes.length - offset);
      sampleEntries.push({ offset, length, data: bytes.slice(offset, offset + avail) });
    } else {
      sampleEntries.push({ offset: 0, length: 0, data: new Uint8Array(0) });
    }
  }
  const numOrders = view.getUint16(12, false) + 1;
  const numPatterns = view.getUint16(14, false);
  let pos = HEADER_SIZE + numOrders * ORDER_ENTRY_SIZE;
  for (let p = 0; p < numPatterns; p++) {
    pos += 4;
    let row = 0;
    while (row < NUM_ROWS && pos + 4 <= bytes.length) {
      const runLen = bytes[pos + 3];
      if (!runLen) break;
      row += runLen;
      pos += 4;
    }
  }
  pos += 4;
  const instrStart = pos;
  for (let ins = 0; ins < numInstruments; ins++) {
    pos += 4;
    while (pos + 4 <= bytes.length) {
      const cmd = bytes[pos];
      pos += 4;
      if (cmd === 176 || cmd === 224) break;
    }
    pos += 4;
    while (pos + 4 <= bytes.length) {
      const cmd = bytes[pos];
      if (cmd === 176 || cmd === 224) {
        pos += 4;
        break;
      }
      if (bytes[pos] === 105 && bytes[pos + 1] === 110 && bytes[pos + 2] === 115 && bytes[pos + 3] === 116) break;
      pos += 4;
    }
  }
  pos += 4;
  const instrData = bytes.slice(instrStart, Math.min(pos, bytes.length));
  return { instrData, sampleEntries, numInstruments };
}
function exportPumaTrackerFile(song) {
  var _a;
  const originalData = song.pumaTrackerFileData;
  if (!originalData) {
    throw new Error("PumaTracker export requires original file data");
  }
  const { instrData, sampleEntries, numInstruments } = extractOriginalData(originalData);
  const numOrders = song.songLength;
  const rawPatterns = [];
  const rawPatternMap = /* @__PURE__ */ new Map();
  const orderEntries = [];
  for (let ord = 0; ord < numOrders; ord++) {
    const patIdx = song.songPositions[ord] ?? 0;
    const pat = song.patterns[patIdx];
    const patternIndices = [];
    let speed = 6;
    if (pat) {
      const ch0Row0 = (_a = pat.channels[0]) == null ? void 0 : _a.rows[0];
      if (ch0Row0 && (ch0Row0.effTyp ?? 0) === 15) {
        speed = ch0Row0.eff ?? 6;
      }
    }
    for (let ch = 0; ch < 4; ch++) {
      const channelData = pat == null ? void 0 : pat.channels[ch];
      const rows = [];
      for (let row = 0; row < NUM_ROWS; row++) {
        const cell = (channelData == null ? void 0 : channelData.rows[row]) ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 };
        const cellForEncode = ch === 0 && row === 0 && (cell.effTyp ?? 0) === 15 ? { ...cell, effTyp: 0, eff: 0 } : cell;
        rows.push(encodeCell(cellForEncode));
      }
      const hash = rows.map((r) => `${r.noteX2}:${r.instrEffect}:${r.param}`).join(",");
      let rawIdx = rawPatternMap.get(hash);
      if (rawIdx === void 0) {
        rawIdx = rawPatterns.length;
        rawPatternMap.set(hash, rawIdx);
        rawPatterns.push(rows);
      }
      patternIndices.push(rawIdx);
    }
    orderEntries.push({ patternIndices, speed });
  }
  const numPatterns = rawPatterns.length;
  const encodedPatterns = rawPatterns.map(rleEncodePattern);
  let patternDataSize = 0;
  for (const ep of encodedPatterns) {
    patternDataSize += 4 + ep.length;
  }
  patternDataSize += 4;
  const dataBeforeSamples = HEADER_SIZE + numOrders * ORDER_ENTRY_SIZE + patternDataSize + instrData.length;
  const newSampleOffsets = [];
  let samplePos = dataBeforeSamples;
  for (let i = 0; i < 10; i++) {
    if (sampleEntries[i].length > 0) {
      newSampleOffsets.push(samplePos);
      samplePos += sampleEntries[i].data.length;
    } else {
      newSampleOffsets.push(0);
    }
  }
  const totalSize = samplePos;
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  let pos = 0;
  const nameStr = (song.name || "").slice(0, 12);
  for (let i = 0; i < 12; i++) {
    buf[pos++] = i < nameStr.length ? nameStr.charCodeAt(i) & 255 : 0;
  }
  view.setUint16(pos, numOrders - 1, false);
  pos += 2;
  view.setUint16(pos, numPatterns, false);
  pos += 2;
  view.setUint16(pos, numInstruments, false);
  pos += 2;
  view.setUint16(pos, 0, false);
  pos += 2;
  for (let i = 0; i < 10; i++) {
    view.setUint32(pos, newSampleOffsets[i], false);
    pos += 4;
  }
  for (let i = 0; i < 10; i++) {
    view.setUint16(pos, Math.floor(sampleEntries[i].length / 2), false);
    pos += 2;
  }
  for (let ord = 0; ord < numOrders; ord++) {
    const entry = orderEntries[ord];
    for (let ch = 0; ch < 4; ch++) {
      buf[pos++] = entry.patternIndices[ch];
      buf[pos++] = 0;
      buf[pos++] = 0;
    }
    buf[pos++] = entry.speed;
    buf[pos++] = 0;
  }
  for (let p = 0; p < numPatterns; p++) {
    buf[pos++] = 112;
    buf[pos++] = 97;
    buf[pos++] = 116;
    buf[pos++] = 116;
    buf.set(encodedPatterns[p], pos);
    pos += encodedPatterns[p].length;
  }
  buf[pos++] = 112;
  buf[pos++] = 97;
  buf[pos++] = 116;
  buf[pos++] = 116;
  buf.set(instrData, pos);
  pos += instrData.length;
  for (let i = 0; i < 10; i++) {
    if (sampleEntries[i].data.length > 0) {
      buf.set(sampleEntries[i].data, pos);
      pos += sampleEntries[i].data.length;
    }
  }
  return buf;
}
export {
  exportPumaTrackerFile
};
