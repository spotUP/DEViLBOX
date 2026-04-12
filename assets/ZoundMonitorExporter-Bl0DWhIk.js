const NUM_SAMPLE_SLOTS = 16;
const ROWS_PER_PART = 32;
const SAMPLE_DESC_SIZE = 54;
const BYTES_PER_TABLE_ENTRY = 16;
const BYTES_PER_PART = 128;
function writeU8(buf, off, val) {
  buf[off] = val & 255;
}
function writeU16BE(buf, off, val) {
  buf[off] = val >>> 8 & 255;
  buf[off + 1] = val & 255;
}
function writeU32BE(buf, off, val) {
  buf[off] = val >>> 24 & 255;
  buf[off + 1] = val >>> 16 & 255;
  buf[off + 2] = val >>> 8 & 255;
  buf[off + 3] = val & 255;
}
function writeString(buf, off, str, maxLen) {
  for (let i = 0; i < maxLen; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
function xmNoteToZM(xmNote) {
  if (xmNote === 0) return 0;
  if (xmNote === 97) return 63;
  const zm = xmNote - 12;
  if (zm < 1 || zm > 36) return 0;
  return zm;
}
function xmEffectToZM(effTyp, eff) {
  switch (effTyp) {
    case 0:
      if (eff !== 0) return { control: 1, param: eff };
      return { control: 0, param: 0 };
    case 1:
      return { control: 2, param: 256 - Math.min(eff, 255) & 255 };
    case 2:
      return { control: 2, param: Math.min(eff, 255) };
    case 3:
      return { control: 3, param: eff };
    default:
      return { control: 0, param: 0 };
  }
}
async function exportZoundMonitor(song) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const warnings = [];
  const numChannels = Math.min(song.numChannels ?? 4, 4);
  if (numChannels < 4) {
    warnings.push(`Song has ${numChannels} channels; padding to 4 for ZoundMonitor.`);
  }
  const songPositions = song.songPositions.length > 0 ? song.songPositions : song.patterns.map((_, i) => i);
  const maxPatternIdx = Math.max(0, ...songPositions);
  const numPatterns = Math.min(256, maxPatternIdx + 1);
  const numParts = numPatterns * 4;
  if (numParts > 256) {
    warnings.push(`Too many parts (${numParts}); capping at 256.`);
  }
  const clampedNumParts = Math.min(256, numParts);
  const startTab = songPositions.length > 0 ? songPositions[0] : 0;
  const endTab = songPositions.length > 0 ? songPositions[songPositions.length - 1] + 1 : numPatterns;
  const loadPathStr = "df0:Samples\0";
  const loadPathBytes = new TextEncoder().encode(loadPathStr);
  const headerSize = 5;
  const sampleTableSize = NUM_SAMPLE_SLOTS * SAMPLE_DESC_SIZE;
  const tableDataSize = numPatterns * BYTES_PER_TABLE_ENTRY;
  const partDataSize = clampedNumParts * BYTES_PER_PART;
  const totalSize = headerSize + sampleTableSize + tableDataSize + partDataSize + loadPathBytes.length;
  const output = new Uint8Array(totalSize);
  writeU8(output, 0, numPatterns - 1);
  writeU8(output, 1, clampedNumParts - 1);
  writeU8(output, 2, Math.min(startTab, 255));
  writeU8(output, 3, Math.min(endTab, 255));
  writeU8(output, 4, Math.max(1, song.initialSpeed ?? 6));
  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const off = 5 + i * SAMPLE_DESC_SIZE;
    const inst = i < song.instruments.length ? song.instruments[i] : null;
    if (inst) {
      writeU32BE(output, off, 0);
      const name = inst.name || `Sample ${i + 1}`;
      writeString(output, off + 4, name, 40);
      const defaultVol = ((_b = (_a = inst.metadata) == null ? void 0 : _a.modPlayback) == null ? void 0 : _b.defaultVolume) ?? 64;
      writeU8(output, off + 44, Math.min(defaultVol, 64));
      const sampleLen = ((_c = inst.sample) == null ? void 0 : _c.audioBuffer) ? Math.floor(new DataView(inst.sample.audioBuffer).getUint32(40, true) / 4) : 0;
      const lenWords = ((_d = inst.metadata) == null ? void 0 : _d.modPlayback) ? Math.floor((((_e = inst.sample) == null ? void 0 : _e.loopEnd) ?? 0) / 2) || sampleLen : sampleLen;
      writeU16BE(output, off + 46, lenWords & 65535);
      const loopStart = ((_f = inst.sample) == null ? void 0 : _f.loopStart) ?? 0;
      const loopEnd = ((_g = inst.sample) == null ? void 0 : _g.loopEnd) ?? 0;
      const replen = loopEnd > loopStart ? Math.floor((loopEnd - loopStart) / 2) : 1;
      writeU16BE(output, off + 48, replen & 65535);
      writeU16BE(output, off + 50, Math.floor(loopStart / 2) & 65535);
    }
  }
  const tableDataStart = 5 + NUM_SAMPLE_SLOTS * SAMPLE_DESC_SIZE;
  for (let t = 0; t < numPatterns; t++) {
    for (let v = 0; v < 4; v++) {
      const off = tableDataStart + t * BYTES_PER_TABLE_ENTRY + v * 4;
      const partIdx = Math.min(t * 4 + v, clampedNumParts - 1);
      writeU8(output, off, partIdx);
      writeU8(output, off + 1, 0);
      writeU8(output, off + 2, 0);
      writeU8(output, off + 3, 0);
    }
  }
  const partDataStart = tableDataStart + numPatterns * BYTES_PER_TABLE_ENTRY;
  for (let t = 0; t < numPatterns; t++) {
    const pat = t < song.patterns.length ? song.patterns[t] : null;
    for (let ch = 0; ch < 4; ch++) {
      const partIdx = t * 4 + ch;
      if (partIdx >= clampedNumParts) break;
      const channel = pat == null ? void 0 : pat.channels[ch];
      for (let row = 0; row < ROWS_PER_PART; row++) {
        const off = partDataStart + partIdx * BYTES_PER_PART + row * 4;
        if (!channel || row >= (((_h = channel.rows) == null ? void 0 : _h.length) ?? 0)) {
          writeU32BE(output, off, 0);
          continue;
        }
        const cell = channel.rows[row];
        const note = (cell == null ? void 0 : cell.note) ?? 0;
        const instr = (cell == null ? void 0 : cell.instrument) ?? 0;
        const effTyp = (cell == null ? void 0 : cell.effTyp) ?? 0;
        const eff = (cell == null ? void 0 : cell.eff) ?? 0;
        const vol = (cell == null ? void 0 : cell.volume) ?? 0;
        const zmNote = xmNoteToZM(note);
        const { control, param } = xmEffectToZM(effTyp, eff);
        let volAdd = 0;
        if (vol >= 16 && vol <= 80) {
          volAdd = vol - 16 - 64;
        }
        const volAddByte = volAdd < 0 ? 256 + volAdd & 255 : volAdd & 255;
        const sampleNum = instr & 15;
        const word = (zmNote & 63) << 24 | (sampleNum & 15) << 20 | (control & 15) << 16 | (volAddByte & 255) << 8 | param & 255;
        writeU32BE(output, off, word);
      }
    }
  }
  output.set(loadPathBytes, partDataStart + clampedNumParts * BYTES_PER_PART);
  const expectedOffset = numPatterns * 16 + clampedNumParts * 128 + 869;
  const loadPathsOffset = partDataStart + clampedNumParts * BYTES_PER_PART;
  if (expectedOffset !== loadPathsOffset) {
    warnings.push(
      `Detection offset mismatch: expected ${expectedOffset}, got ${loadPathsOffset}. File may not pass isZoundMonitorFormat check.`
    );
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_.-]/g, "_");
  const filename = baseName.toLowerCase().endsWith(".sng") ? baseName : `${baseName}.sng`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportZoundMonitor
};
