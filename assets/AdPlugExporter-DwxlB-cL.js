const RAD_HEADER = "RAD by REALiTY!!";
const RAD_VERSION = 16;
const OPL2_CHANNELS = 9;
const OPL_CHIP_TYPES = /* @__PURE__ */ new Set([2, 23, 26]);
const OPL_SYNTH_TYPES = /* @__PURE__ */ new Set(["FurnaceOPL", "FurnaceOPLL", "FurnaceOPL4"]);
function canExportRAD(song) {
  return song.instruments.some((inst) => isOPLInstrument(inst));
}
function isOPLInstrument(inst) {
  if (inst.synthType === "OPL3" && inst.opl3) return true;
  if (OPL_SYNTH_TYPES.has(inst.synthType)) return true;
  if (inst.furnace) {
    if (OPL_CHIP_TYPES.has(inst.furnace.chipType)) return true;
    if (inst.furnace.chipType === 11) return true;
  }
  return false;
}
function encodeOPLInstrument(config) {
  const bytes = new Uint8Array(11);
  const mod = config.operators[0] || createDefaultOperator();
  const car = config.operators[1] || createDefaultOperator();
  bytes[0] = encodeCharByte(mod);
  bytes[1] = encodeKslTl(mod);
  bytes[2] = encodeArDr(mod);
  bytes[3] = encodeSlRr(mod);
  bytes[4] = (mod.ws ?? 0) & 7;
  bytes[5] = encodeCharByte(car);
  bytes[6] = encodeKslTl(car);
  bytes[7] = encodeArDr(car);
  bytes[8] = encodeSlRr(car);
  bytes[9] = (car.ws ?? 0) & 7;
  const fb = (config.feedback & 7) << 1;
  const cnt = config.algorithm & 1;
  bytes[10] = fb | cnt;
  return bytes;
}
function encodeCharByte(op) {
  return (op.am ? 1 : 0) << 7 | (op.vib ? 1 : 0) << 6 | (op.sus ? 1 : 0) << 5 | (op.ksr ? 1 : 0) << 4 | op.mult & 15;
}
function encodeKslTl(op) {
  const ksl = (op.ksl ?? 0) & 3;
  const tl = op.tl & 63;
  return ksl << 6 | tl;
}
function encodeArDr(op) {
  return (op.ar & 15) << 4 | op.dr & 15;
}
function encodeSlRr(op) {
  return (op.sl & 15) << 4 | op.rr & 15;
}
function createDefaultOperator() {
  return {
    enabled: true,
    mult: 1,
    tl: 63,
    ar: 15,
    dr: 0,
    d2r: 0,
    sl: 15,
    rr: 15,
    dt: 0,
    am: false,
    vib: false,
    sus: false,
    ksr: false,
    ksl: 0,
    ws: 0
  };
}
function encodeOPL3Instrument(o) {
  const bytes = new Uint8Array(11);
  bytes[0] = ((o.op1Tremolo ?? 0) & 1) << 7 | ((o.op1Vibrato ?? 0) & 1) << 6 | ((o.op1SustainHold ?? 0) & 1) << 5 | ((o.op1KSR ?? 0) & 1) << 4 | (o.op1Multi ?? 0) & 15;
  bytes[1] = ((o.op2Tremolo ?? 0) & 1) << 7 | ((o.op2Vibrato ?? 0) & 1) << 6 | ((o.op2SustainHold ?? 0) & 1) << 5 | ((o.op2KSR ?? 0) & 1) << 4 | (o.op2Multi ?? 0) & 15;
  bytes[2] = ((o.op1KSL ?? 0) & 3) << 6 | (o.op1Level ?? 0) & 63;
  bytes[3] = ((o.op2KSL ?? 0) & 3) << 6 | (o.op2Level ?? 0) & 63;
  bytes[4] = ((o.op1Attack ?? 0) & 15) << 4 | (o.op1Decay ?? 0) & 15;
  bytes[5] = ((o.op2Attack ?? 0) & 15) << 4 | (o.op2Decay ?? 0) & 15;
  bytes[6] = ((o.op1Sustain ?? 0) & 15) << 4 | (o.op1Release ?? 0) & 15;
  bytes[7] = ((o.op2Sustain ?? 0) & 15) << 4 | (o.op2Release ?? 0) & 15;
  bytes[8] = (o.op1Waveform ?? 0) & 7;
  bytes[9] = (o.op2Waveform ?? 0) & 7;
  bytes[10] = ((o.feedback ?? 0) & 7) << 1 | (o.connection ?? 0) & 1;
  return bytes;
}
function encodePatternData(song, patternIndex, instrumentMap) {
  var _a;
  const data = [];
  const pat = song.patterns[patternIndex];
  if (!pat) return [0];
  const numRows = pat.length || 64;
  const numCh = Math.min(pat.channels.length, OPL2_CHANNELS);
  let emptyRows = 0;
  for (let row = 0; row < numRows; row++) {
    const rowEvents = [];
    for (let ch = 0; ch < numCh; ch++) {
      const cell = (_a = pat.channels[ch]) == null ? void 0 : _a.rows[row];
      if (!cell) continue;
      const hasNote = cell.note > 0 && cell.note <= 97;
      const hasInst = cell.instrument > 0;
      const radEffect = cell.effTyp > 0 ? mapXmEffectToRAD(cell.effTyp, cell.eff) : null;
      const hasEffect = radEffect !== null;
      if (!hasNote && !hasInst && !hasEffect) continue;
      let chanByte = ch & 15;
      if (hasNote) chanByte |= 128;
      if (hasInst) chanByte |= 64;
      if (hasEffect) chanByte |= 16;
      rowEvents.push(chanByte);
      if (hasNote) {
        if (cell.note === 97) {
          rowEvents.push(15);
        } else {
          const semitone = (cell.note - 1) % 12 + 1;
          const octave = Math.floor((cell.note - 1) / 12);
          rowEvents.push((octave & 7) << 4 | semitone & 15);
        }
      }
      if (hasInst) {
        const radInst = instrumentMap.get(cell.instrument) ?? cell.instrument;
        rowEvents.push(radInst & 255);
      }
      if (hasEffect) {
        rowEvents.push(radEffect);
      }
    }
    if (rowEvents.length === 0) {
      emptyRows++;
      continue;
    }
    data.push(emptyRows & 63);
    emptyRows = 0;
    data.push(...rowEvents);
    data.push(0);
  }
  data.push(0);
  return data;
}
function mapXmEffectToRAD(effTyp, eff) {
  const param = eff & 15;
  switch (effTyp) {
    case 1:
      return 1 << 4 | param;
    // Portamento up
    case 2:
      return 2 << 4 | param;
    // Portamento down
    case 3:
      return 3 << 4 | param;
    // Tone portamento
    case 5:
      return 5 << 4 | param;
    // Vol slide + tone porta
    case 10:
      return 10 << 4 | param;
    // Volume slide
    case 12:
      return 12 << 4 | eff >> 2;
    // Set volume (scale 0-63 → 0-15)
    case 13:
      return 13 << 4 | param;
    // Pattern break
    case 15:
      return 15 << 4 | Math.min(15, eff);
    // Set speed
    default:
      return null;
  }
}
function exportToRAD(song) {
  const encoder = new TextEncoder();
  const instrumentMap = /* @__PURE__ */ new Map();
  const oplInstrumentBytes = [];
  let radIndex = 1;
  for (let i = 0; i < song.instruments.length; i++) {
    const inst = song.instruments[i];
    if (!isOPLInstrument(inst)) continue;
    const xmIndex = inst.id || i + 1;
    instrumentMap.set(xmIndex, radIndex);
    let bytes;
    if (inst.opl3) {
      bytes = encodeOPL3Instrument(inst.opl3);
    } else if (inst.furnace) {
      bytes = encodeOPLInstrument(inst.furnace);
    } else {
      bytes = new Uint8Array(11);
    }
    oplInstrumentBytes.push({ radIndex, bytes });
    radIndex++;
  }
  const sections = [];
  const headerBytes = encoder.encode(RAD_HEADER);
  for (let i = 0; i < 16; i++) {
    sections.push(i < headerBytes.length ? headerBytes[i] : 0);
  }
  sections.push(RAD_VERSION);
  const desc = encoder.encode(song.name || "DEViLBOX Export");
  for (let i = 0; i < desc.length; i++) sections.push(desc[i]);
  sections.push(0);
  const speed = Math.max(1, Math.min(255, song.initialSpeed || 6));
  sections.push(speed);
  sections.push(oplInstrumentBytes.length & 255);
  for (const { radIndex: idx, bytes: instBytes } of oplInstrumentBytes) {
    sections.push(idx & 255);
    for (let j = 0; j < instBytes.length; j++) sections.push(instBytes[j]);
  }
  const orderLen = Math.min(128, song.songPositions.length);
  sections.push(orderLen & 255);
  for (let i = 0; i < orderLen; i++) {
    sections.push((song.songPositions[i] ?? 0) & 255);
  }
  const usedPatterns = /* @__PURE__ */ new Set();
  for (let i = 0; i < orderLen; i++) {
    usedPatterns.add(song.songPositions[i] ?? 0);
  }
  for (const patIdx of Array.from(usedPatterns).sort((a, b) => a - b)) {
    sections.push(patIdx & 255);
    const patData = encodePatternData(song, patIdx, instrumentMap);
    sections.push(...patData);
  }
  const output = new Uint8Array(sections);
  return output.buffer;
}
const IMF_RATE = 560;
const OPL_CH_TO_OP_OFFSET = [
  [0, 3],
  [1, 4],
  [2, 5],
  // Ch 0-2
  [8, 11],
  [9, 12],
  [10, 13],
  // Ch 3-5
  [16, 19],
  [17, 20],
  [18, 21]
  // Ch 6-8
];
const OPL_FNUM = [
  343,
  363,
  385,
  408,
  432,
  458,
  // C  C# D  D# E  F
  485,
  514,
  544,
  577,
  611,
  647
  // F# G  G# A  A# B
];
function canExportIMF(song) {
  return song.instruments.some((inst) => isOPLInstrument(inst));
}
function exportToIMF(song) {
  var _a;
  const records = [];
  const speed = song.initialSpeed || 6;
  const bpm = song.initialBPM || 125;
  const ticksPerRow = speed;
  const rowDelayTicks = Math.round(IMF_RATE * 60 / (bpm * ticksPerRow * 4));
  const instRegs = /* @__PURE__ */ new Map();
  for (const inst of song.instruments) {
    if (inst.opl3) {
      instRegs.set(inst.id, encodeOPL3Instrument(inst.opl3));
    } else if (inst.furnace) {
      instRegs.set(inst.id, encodeOPLInstrument(inst.furnace));
    }
  }
  const chanInst = new Array(9).fill(0);
  function writeReg(reg, val, delay) {
    records.push(reg & 255, val & 255, delay & 255, delay >> 8 & 255);
  }
  function programInstrument(ch, regs) {
    const [modOff, carOff] = OPL_CH_TO_OP_OFFSET[ch];
    writeReg(32 + modOff, regs[0], 0);
    writeReg(32 + carOff, regs[1], 0);
    writeReg(64 + modOff, regs[2], 0);
    writeReg(64 + carOff, regs[3], 0);
    writeReg(96 + modOff, regs[4], 0);
    writeReg(96 + carOff, regs[5], 0);
    writeReg(128 + modOff, regs[6], 0);
    writeReg(128 + carOff, regs[7], 0);
    writeReg(224 + modOff, regs[8], 0);
    writeReg(224 + carOff, regs[9], 0);
    writeReg(192 + ch, regs[10], 0);
  }
  function noteOn(ch, note) {
    if (note < 1 || note > 96) return;
    const semitone = (note - 1) % 12;
    const octave = Math.min(7, Math.floor((note - 1) / 12));
    const fnum = OPL_FNUM[semitone];
    writeReg(160 + ch, fnum & 255, 0);
    writeReg(176 + ch, 32 | (octave & 7) << 2 | fnum >> 8 & 3, 0);
  }
  function noteOff(ch) {
    writeReg(176 + ch, 0, 0);
  }
  for (const patIdx of song.songPositions) {
    const pat = song.patterns[patIdx];
    if (!pat) continue;
    const numCh = Math.min(pat.channels.length, 9);
    const numRows = pat.length || 64;
    for (let row = 0; row < numRows; row++) {
      for (let ch = 0; ch < numCh; ch++) {
        const cell = (_a = pat.channels[ch]) == null ? void 0 : _a.rows[row];
        if (!cell) continue;
        if (cell.instrument > 0 && cell.instrument !== chanInst[ch]) {
          const regs = instRegs.get(cell.instrument);
          if (regs) {
            programInstrument(ch, regs);
            chanInst[ch] = cell.instrument;
          }
        }
        if (cell.note === 97) {
          noteOff(ch);
        } else if (cell.note > 0 && cell.note <= 96) {
          noteOff(ch);
          noteOn(ch, cell.note);
        }
      }
      if (records.length >= 4) {
        const lastIdx = records.length - 2;
        const delay = rowDelayTicks;
        records[lastIdx] = delay & 255;
        records[lastIdx + 1] = delay >> 8 & 255;
      } else {
        writeReg(0, 0, rowDelayTicks);
      }
    }
  }
  const dataLen = records.length;
  const output = new Uint8Array(2 + dataLen);
  output[0] = dataLen & 255;
  output[1] = dataLen >> 8 & 255;
  for (let i = 0; i < dataLen; i++) output[2 + i] = records[i];
  return output.buffer;
}
const RAW_MAGIC = "RAWADATA";
const RAW_DEFAULT_CLOCK = 65535;
function canExportRAW(song) {
  return song.instruments.some((inst) => isOPLInstrument(inst));
}
function exportToRAW(song) {
  var _a;
  const encoder = new TextEncoder();
  const records = [];
  const speed = song.initialSpeed || 6;
  const bpm = song.initialBPM || 125;
  const timerHz = 1193180 / RAW_DEFAULT_CLOCK;
  const rowsPerSec = bpm * 2 / (5 * speed);
  const ticksPerRow = Math.max(1, Math.round(timerHz / rowsPerSec));
  const instRegs = /* @__PURE__ */ new Map();
  for (const inst of song.instruments) {
    if (inst.opl3) {
      instRegs.set(inst.id, encodeOPL3Instrument(inst.opl3));
    } else if (inst.furnace) {
      instRegs.set(inst.id, encodeOPLInstrument(inst.furnace));
    }
  }
  const chanInst = new Array(9).fill(0);
  function writeRegPair(reg, val) {
    records.push(val & 255, reg & 255);
  }
  function writeDelay(ticks) {
    while (ticks > 0) {
      const d = Math.min(256, ticks);
      records.push(d - 1, 0);
      ticks -= d;
    }
  }
  function programInstrumentRaw(ch, regs) {
    const [modOff, carOff] = OPL_CH_TO_OP_OFFSET[ch];
    writeRegPair(32 + modOff, regs[0]);
    writeRegPair(32 + carOff, regs[1]);
    writeRegPair(64 + modOff, regs[2]);
    writeRegPair(64 + carOff, regs[3]);
    writeRegPair(96 + modOff, regs[4]);
    writeRegPair(96 + carOff, regs[5]);
    writeRegPair(128 + modOff, regs[6]);
    writeRegPair(128 + carOff, regs[7]);
    writeRegPair(224 + modOff, regs[8]);
    writeRegPair(224 + carOff, regs[9]);
    writeRegPair(192 + ch, regs[10]);
  }
  function noteOnRaw(ch, note) {
    if (note < 1 || note > 96) return;
    const semitone = (note - 1) % 12;
    const octave = Math.min(7, Math.floor((note - 1) / 12));
    const fnum = OPL_FNUM[semitone];
    writeRegPair(160 + ch, fnum & 255);
    writeRegPair(176 + ch, 32 | (octave & 7) << 2 | fnum >> 8 & 3);
  }
  function noteOffRaw(ch) {
    writeRegPair(176 + ch, 0);
  }
  for (const patIdx of song.songPositions) {
    const pat = song.patterns[patIdx];
    if (!pat) continue;
    const numCh = Math.min(pat.channels.length, 9);
    const numRows = pat.length || 64;
    for (let row = 0; row < numRows; row++) {
      for (let ch = 0; ch < numCh; ch++) {
        const cell = (_a = pat.channels[ch]) == null ? void 0 : _a.rows[row];
        if (!cell) continue;
        if (cell.instrument > 0 && cell.instrument !== chanInst[ch]) {
          const regs = instRegs.get(cell.instrument);
          if (regs) {
            programInstrumentRaw(ch, regs);
            chanInst[ch] = cell.instrument;
          }
        }
        if (cell.note === 97) {
          noteOffRaw(ch);
        } else if (cell.note > 0 && cell.note <= 96) {
          noteOffRaw(ch);
          noteOnRaw(ch, cell.note);
        }
      }
      writeDelay(ticksPerRow);
    }
  }
  records.push(255, 255);
  const magicBytes = encoder.encode(RAW_MAGIC);
  const output = new Uint8Array(8 + 2 + records.length);
  output.set(magicBytes, 0);
  output[8] = RAW_DEFAULT_CLOCK & 255;
  output[9] = RAW_DEFAULT_CLOCK >> 8 & 255;
  for (let i = 0; i < records.length; i++) output[10 + i] = records[i];
  return output.buffer;
}
const ADPLUG_FORMAT_EXTENSIONS = {
  rad: ".rad",
  imf: ".imf",
  raw: ".raw"
};
function exportAdPlug(song, format = "rad") {
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = ADPLUG_FORMAT_EXTENSIONS[format];
  const warnings = [];
  let buf;
  switch (format) {
    case "imf":
      buf = exportToIMF(song);
      break;
    case "raw":
      buf = exportToRAW(song);
      break;
    case "rad":
    default:
      buf = exportToRAD(song);
      break;
  }
  const numOpl = song.instruments.filter((i) => isOPLInstrument(i)).length;
  if (numOpl === 0) {
    warnings.push("No OPL instruments found — exported file may be empty");
  }
  return {
    data: new Blob([new Uint8Array(buf)], { type: "application/octet-stream" }),
    filename: `${baseName}${ext}`,
    warnings
  };
}
export {
  canExportIMF,
  canExportRAD,
  canExportRAW,
  exportAdPlug,
  exportToIMF,
  exportToRAD,
  exportToRAW
};
