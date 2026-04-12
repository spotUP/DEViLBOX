function writeU8(buf, off, val) {
  buf[off] = val & 255;
}
function writeS8(buf, off, val) {
  buf[off] = val < 0 ? val + 256 & 255 : val & 255;
}
function writeU16BE(buf, off, val) {
  buf[off] = val >> 8 & 255;
  buf[off + 1] = val & 255;
}
function writeU32BE(buf, off, val) {
  buf[off] = val >>> 24 & 255;
  buf[off + 1] = val >>> 16 & 255;
  buf[off + 2] = val >>> 8 & 255;
  buf[off + 3] = val & 255;
}
function writeString(buf, off, str, len) {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 255 : 0;
  }
}
const SM1_PERIODS = [
  0,
  5760,
  5424,
  5120,
  4832,
  4560,
  4304,
  4064,
  3840,
  3616,
  3424,
  3232,
  3048,
  2880,
  2712,
  2560,
  2416,
  2280,
  2152,
  2032,
  1920,
  1808,
  1712,
  1616,
  1524,
  1440,
  1356,
  1280,
  1208,
  1140,
  1076,
  1016,
  960,
  904,
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
  452,
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
  127
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
function xmNoteToSM1(xmNote) {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const ptIdx = xmNote - 13;
  if (ptIdx < 0 || ptIdx >= PT_PERIODS.length) return 0;
  const period = PT_PERIODS[ptIdx];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 1; i < SM1_PERIODS.length; i++) {
    const d = Math.abs(SM1_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}
async function exportSidMon1(song) {
  const warnings = [];
  const CHANNELS = 4;
  const ROWS_PER_PATTERN = 16;
  const waveformTable = [];
  const waveformMap = /* @__PURE__ */ new Map();
  function addWaveform(wave) {
    const key = wave.join(",");
    const existing = waveformMap.get(key);
    if (existing !== void 0) return existing;
    const idx = waveformTable.length;
    const arr = new Int8Array(32);
    for (let i = 0; i < 32; i++) {
      arr[i] = wave[i] ?? 0;
    }
    waveformTable.push(arr);
    waveformMap.set(key, idx);
    return idx;
  }
  const defaultWave = [
    127,
    100,
    71,
    41,
    9,
    -22,
    -53,
    -82,
    -108,
    -127,
    -127,
    -127,
    -108,
    -82,
    -53,
    -22,
    9,
    41,
    71,
    100,
    127,
    100,
    71,
    41,
    9,
    -22,
    -53,
    -82,
    -108,
    -127,
    -127,
    -127
  ];
  addWaveform(defaultWave);
  const maxInstruments = Math.min(63, song.instruments.length);
  const instrRecords = [];
  for (let i = 0; i < maxInstruments; i++) {
    const inst = song.instruments[i];
    const sm1 = inst == null ? void 0 : inst.sidmon1;
    if (sm1) {
      const mainWaveIdx = addWaveform(sm1.mainWave ?? defaultWave);
      if (sm1.phaseShift && sm1.phaseShift > 0 && sm1.phaseWave) {
        addWaveform(sm1.phaseWave);
      }
      let rawFinetune = 0;
      if (sm1.finetune !== void 0 && sm1.finetune > 0) {
        rawFinetune = Math.round(sm1.finetune / 67);
        if (rawFinetune > 15) rawFinetune = 15;
      }
      let phaseShift = sm1.phaseShift ?? 0;
      if (phaseShift > 0 && sm1.phaseWave) {
        phaseShift = addWaveform(sm1.phaseWave);
      }
      instrRecords.push({
        waveform: mainWaveIdx,
        arpeggio: sm1.arpeggio ?? new Array(16).fill(0),
        attackSpeed: sm1.attackSpeed ?? 0,
        attackMax: sm1.attackMax ?? 0,
        decaySpeed: sm1.decaySpeed ?? 0,
        decayMin: sm1.decayMin ?? 0,
        sustain: sm1.sustain ?? 0,
        releaseSpeed: sm1.releaseSpeed ?? 0,
        releaseMin: sm1.releaseMin ?? 0,
        phaseShift,
        phaseSpeed: sm1.phaseSpeed ?? 0,
        finetune: rawFinetune,
        pitchFall: sm1.pitchFall ?? 0
      });
    } else {
      warnings.push(`Instrument ${i + 1} has no SidMon1 config; using defaults.`);
      instrRecords.push({
        waveform: 0,
        arpeggio: new Array(16).fill(0),
        attackSpeed: 8,
        attackMax: 64,
        decaySpeed: 4,
        decayMin: 32,
        sustain: 0,
        releaseSpeed: 4,
        releaseMin: 0,
        phaseShift: 0,
        phaseSpeed: 0,
        finetune: 0,
        pitchFall: 0
      });
    }
  }
  if (instrRecords.length === 0) {
    instrRecords.push({
      waveform: 0,
      arpeggio: new Array(16).fill(0),
      attackSpeed: 8,
      attackMax: 64,
      decaySpeed: 4,
      decayMin: 32,
      sustain: 0,
      releaseSpeed: 4,
      releaseMin: 0,
      phaseShift: 0,
      phaseSpeed: 0,
      finetune: 0,
      pitchFall: 0
    });
  }
  const patternBlocks = [];
  const patternBlockMap = /* @__PURE__ */ new Map();
  const emptyBlock = Array.from({ length: ROWS_PER_PATTERN }, () => ({
    note: 0,
    sample: 0,
    effect: 0,
    param: 0,
    speed: 0
  }));
  patternBlocks.push(emptyBlock);
  patternBlockMap.set(serializeBlock(emptyBlock), 0);
  function serializeBlock(block) {
    return block.map((r) => `${r.note},${r.sample},${r.effect},${r.param},${r.speed}`).join("|");
  }
  function addPatternBlock(block) {
    const key = serializeBlock(block);
    const existing = patternBlockMap.get(key);
    if (existing !== void 0) return existing;
    const idx = patternBlocks.length;
    patternBlocks.push(block);
    patternBlockMap.set(key, idx);
    return idx;
  }
  const trackTable = [];
  const songLen = Math.min(128, song.songPositions.length);
  for (let step = 0; step < songLen; step++) {
    const patIdx = song.songPositions[step] ?? 0;
    const pat = song.patterns[patIdx];
    for (let ch = 0; ch < CHANNELS; ch++) {
      const channel = pat == null ? void 0 : pat.channels[ch];
      const rows = [];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const cell = channel == null ? void 0 : channel.rows[r];
        if (!cell || cell.note === 0 && cell.instrument === 0) {
          rows.push({ note: 0, sample: 0, effect: 0, param: 0, speed: 0 });
        } else {
          const sm1Note = xmNoteToSM1(cell.note ?? 0);
          rows.push({
            note: sm1Note,
            sample: (cell.instrument ?? 0) & 255,
            effect: 0,
            param: 0,
            speed: 0
          });
        }
      }
      while (rows.length < ROWS_PER_PATTERN) {
        rows.push({ note: 0, sample: 0, effect: 0, param: 0, speed: 0 });
      }
      const blockIdx = addPatternBlock(rows);
      trackTable.push({ pattern: blockIdx, transpose: 0 });
    }
  }
  const numWaveforms = waveformTable.length;
  const numInstruments = instrRecords.length;
  const numPatternBlocks = patternBlocks.length;
  const numTracks = trackTable.length;
  const waveformDataSize = numWaveforms * 32;
  const instrumentDataSize = numInstruments * 32;
  const patternDataSize = numPatternBlocks * ROWS_PER_PATTERN * 5;
  const patternPtrsSize = (numPatternBlocks + 1) * 4;
  const trackDataSize = numTracks * 6;
  const PREAMBLE_SIZE = 8;
  const OFFSET_TABLE_SIZE = 44;
  const ID_STRING_SIZE = 32;
  const HEADER_SIZE = PREAMBLE_SIZE + OFFSET_TABLE_SIZE + ID_STRING_SIZE;
  const position = PREAMBLE_SIZE + OFFSET_TABLE_SIZE;
  const trackDataRelOffset = HEADER_SIZE - position;
  const instrDataRelOffset = trackDataRelOffset + trackDataSize;
  const waveDataRelOffset = instrDataRelOffset + instrumentDataSize;
  const waveDataEndRelOffset = waveDataRelOffset + waveformDataSize;
  const patDataRelOffset = waveDataEndRelOffset;
  const patDataEndRelOffset = patDataRelOffset + patternDataSize;
  const patPtrsRelOffset = patDataEndRelOffset;
  const patPtrsEndRelOffset = patPtrsRelOffset + patternPtrsSize;
  const totalSize = position + patPtrsEndRelOffset;
  const output = new Uint8Array(totalSize);
  output[0] = 65;
  output[1] = 250;
  writeU16BE(output, 2, position - 2);
  output[4] = 209;
  output[5] = 232;
  output[6] = 255;
  output[7] = 212;
  writeU32BE(output, position - 44, trackDataRelOffset);
  writeU32BE(output, position - 40, trackDataRelOffset + 1 * 6);
  writeU32BE(output, position - 36, trackDataRelOffset + 2 * 6);
  writeU32BE(output, position - 32, trackDataRelOffset + 3 * 6);
  writeU32BE(output, position - 28, instrDataRelOffset);
  writeU32BE(output, position - 24, waveDataRelOffset);
  writeU32BE(output, position - 20, waveDataEndRelOffset);
  writeU32BE(output, position - 16, waveDataEndRelOffset);
  writeU32BE(output, position - 12, patDataRelOffset);
  writeU32BE(output, position - 8, patDataEndRelOffset);
  writeU32BE(output, position - 4, patPtrsEndRelOffset);
  writeString(output, position, " SID-MON BY R.v.VLIET  (c) 1988 ", 32);
  let off = position + trackDataRelOffset;
  for (const track of trackTable) {
    writeU32BE(output, off, track.pattern);
    writeU8(output, off + 4, 0);
    writeS8(output, off + 5, track.transpose);
    off += 6;
  }
  off = position + instrDataRelOffset;
  for (const rec of instrRecords) {
    writeU32BE(output, off, rec.waveform);
    for (let k = 0; k < 16; k++) {
      writeU8(output, off + 4 + k, rec.arpeggio[k] ?? 0);
    }
    writeU8(output, off + 20, rec.attackSpeed);
    writeU8(output, off + 21, rec.attackMax);
    writeU8(output, off + 22, rec.decaySpeed);
    writeU8(output, off + 23, rec.decayMin);
    writeU8(output, off + 24, rec.sustain);
    writeU8(output, off + 25, 0);
    writeU8(output, off + 26, rec.releaseSpeed);
    writeU8(output, off + 27, rec.releaseMin);
    writeU8(output, off + 28, rec.phaseShift);
    writeU8(output, off + 29, rec.phaseSpeed);
    writeU8(output, off + 30, rec.finetune);
    writeS8(output, off + 31, rec.pitchFall);
    off += 32;
  }
  off = position + waveDataRelOffset;
  for (const wave of waveformTable) {
    for (let b = 0; b < 32; b++) {
      writeS8(output, off + b, wave[b]);
    }
    off += 32;
  }
  off = position + patDataRelOffset;
  for (const block of patternBlocks) {
    for (let r = 0; r < ROWS_PER_PATTERN; r++) {
      const row = block[r];
      writeU8(output, off, row.note);
      writeU8(output, off + 1, row.sample);
      writeU8(output, off + 2, row.effect);
      writeU8(output, off + 3, row.param);
      writeU8(output, off + 4, row.speed);
      off += 5;
    }
  }
  off = position + patPtrsRelOffset;
  writeU32BE(output, off, 0);
  off += 4;
  for (let i = 0; i < numPatternBlocks; i++) {
    const byteOffset = i * ROWS_PER_PATTERN * 5;
    writeU32BE(output, off, byteOffset);
    off += 4;
  }
  const baseName = (song.name || "untitled").replace(/\s*\[SidMon 1\.0\]\s*$/, "").replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename: `${baseName || "untitled"}.sid1`,
    warnings
  };
}
export {
  exportSidMon1
};
