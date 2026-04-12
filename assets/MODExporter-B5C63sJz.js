const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/AutomationBaker-fv7yT9k7.js"])))=>i.map(i=>d[i]);
import { am as __vitePreload } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const FORMAT_TAGS = {
  4: "M.K.",
  // Standard 4-channel ProTracker
  6: "6CHN",
  // FastTracker 6-channel
  8: "8CHN"
  // FastTracker 8-channel
};
async function exportAsMOD(patterns, instruments, options = {}) {
  var _a;
  const warnings = [];
  const channelCount = options.channelCount || 4;
  const moduleName = options.moduleName || "DEViLBOX Export";
  const bakeSynthsToSamples = options.bakeSynthsToSamples ?? true;
  if (![4, 6, 8].includes(channelCount)) {
    throw new Error(`MOD supports 4, 6, or 8 channels (got ${channelCount})`);
  }
  const formatTag = FORMAT_TAGS[channelCount];
  if (!formatTag) {
    throw new Error(`No format tag for ${channelCount} channels`);
  }
  const maxChannels = Math.max(...patterns.map((p) => p.channels.length));
  if (maxChannels > channelCount) {
    warnings.push(
      `Patterns have ${maxChannels} channels but exporting as ${channelCount}-channel MOD. Extra channels will be truncated.`
    );
  }
  const importMetadata = (_a = patterns[0]) == null ? void 0 : _a.importMetadata;
  (importMetadata == null ? void 0 : importMetadata.sourceFormat) === "MOD";
  const modSamples = [];
  for (let i = 0; i < Math.min(instruments.length, 31); i++) {
    const inst = instruments[i];
    if (!inst) {
      modSamples.push(createEmptySample());
      continue;
    }
    if (inst.synthType !== "Sampler" && bakeSynthsToSamples) {
      warnings.push(`Synth instrument "${inst.name}" exported as silent placeholder (live synth audio cannot be baked at export time).`);
      modSamples.push(createEmptySample());
    } else if (inst.synthType === "Sampler") {
      const modSample = await convertSamplerToMODSample(inst, importMetadata);
      modSamples.push(modSample);
    } else {
      warnings.push(`Synth instrument "${inst.name}" exported as silent placeholder (MOD format requires sample data).`);
      modSamples.push(createEmptySample());
    }
    if (inst.effects && inst.effects.length > 0) {
      warnings.push(`Instrument "${inst.name}" has effects that will be lost (MOD doesn't support effect chains).`);
    }
  }
  while (modSamples.length < 31) {
    modSamples.push(createEmptySample());
  }
  let exportPatterns = patterns;
  try {
    const { useAutomationStore } = await __vitePreload(async () => {
      const { useAutomationStore: useAutomationStore2 } = await import("./main-BbV5VyEH.js").then((n) => n.j5);
      return { useAutomationStore: useAutomationStore2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const { bakeAutomationForExport } = await __vitePreload(async () => {
      const { bakeAutomationForExport: bakeAutomationForExport2 } = await import("./AutomationBaker-fv7yT9k7.js");
      return { bakeAutomationForExport: bakeAutomationForExport2 };
    }, true ? __vite__mapDeps([7,0,1,2,3,4,5,6]) : void 0);
    const { FORMAT_LIMITS } = await __vitePreload(async () => {
      const { FORMAT_LIMITS: FORMAT_LIMITS2 } = await import("./main-BbV5VyEH.js").then((n) => n.i_);
      return { FORMAT_LIMITS: FORMAT_LIMITS2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const curves = useAutomationStore.getState().curves;
    if (curves.length > 0) {
      const bakeResult = bakeAutomationForExport(patterns, curves, FORMAT_LIMITS.MOD);
      exportPatterns = bakeResult.patterns;
      if (bakeResult.bakedCount > 0) {
        warnings.push(`${bakeResult.bakedCount} automation curve(s) baked into effect commands.`);
      }
      if (bakeResult.overflowRows > 0) {
        warnings.push(`${bakeResult.overflowRows} row(s) had no free effect slot — automation data lost on those rows.`);
      }
      for (const w of bakeResult.warnings) warnings.push(w);
    }
  } catch {
  }
  const modPatterns = exportPatterns.map(
    (pattern, idx) => convertPatternToMOD(pattern, channelCount, idx, warnings)
  );
  const patternOrderTable = Array.from({ length: 128 }, (_, i) => i < patterns.length ? i : 0);
  const modData = buildMODFile({
    title: moduleName,
    samples: modSamples,
    patterns: modPatterns,
    songLength: patterns.length,
    formatTag,
    patternOrderTable
  });
  const blob = new Blob([modData], { type: "application/octet-stream" });
  const filename = `${moduleName.replace(/[^a-zA-Z0-9]/g, "_")}.mod`;
  return {
    data: blob,
    warnings,
    filename
  };
}
const AMIGA_PERIODS = {
  "C-0": 1712,
  "C#0": 1616,
  "D-0": 1525,
  "D#0": 1440,
  "E-0": 1357,
  "F-0": 1281,
  "F#0": 1209,
  "G-0": 1141,
  "G#0": 1077,
  "A-0": 1017,
  "A#0": 961,
  "B-0": 907,
  "C-1": 856,
  "C#1": 808,
  "D-1": 762,
  "D#1": 720,
  "E-1": 678,
  "F-1": 640,
  "F#1": 604,
  "G-1": 570,
  "G#1": 538,
  "A-1": 508,
  "A#1": 480,
  "B-1": 453,
  "C-2": 428,
  "C#2": 404,
  "D-2": 381,
  "D#2": 360,
  "E-2": 339,
  "F-2": 320,
  "F#2": 302,
  "G-2": 285,
  "G#2": 269,
  "A-2": 254,
  "A#2": 240,
  "B-2": 226,
  "C-3": 214,
  "C#3": 202,
  "D-3": 190,
  "D#3": 180,
  "E-3": 170,
  "F-3": 160,
  "F#3": 151,
  "G-3": 143,
  "G#3": 135,
  "A-3": 127,
  "A#3": 120,
  "B-3": 113
};
function noteToPeriod(noteName) {
  const lookupName = noteName.replace("-", "-");
  return AMIGA_PERIODS[lookupName] || 0;
}
function convertPatternToMOD(pattern, channelCount, patternIndex, warnings) {
  var _a;
  const rows = [];
  for (let row = 0; row < 64; row++) {
    const rowNotes = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const cell = (_a = pattern.channels[ch]) == null ? void 0 : _a.rows[row];
      if (!cell || row >= pattern.length) {
        rowNotes.push({ period: 0, instrument: 0, effect: 0, effectParam: 0 });
        continue;
      }
      const modNote = convertCellToMODNote(cell, warnings);
      rowNotes.push(modNote);
    }
    rows.push(rowNotes);
  }
  if (pattern.length > 64) {
    warnings.push(`Pattern ${patternIndex} has ${pattern.length} rows but MOD supports max 64. Extra rows truncated.`);
  }
  return { rows };
}
function convertCellToMODNote(cell, warnings) {
  let period = 0;
  const noteValue = cell.note;
  if (noteValue === 97 || typeof noteValue === "string" && noteValue === "===") {
    return { period: 0, instrument: 0, effect: 12, effectParam: 0 };
  }
  let noteStr = null;
  if (typeof noteValue === "number" && noteValue > 0 && noteValue < 97) {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const noteIndex = (noteValue - 1) % 12;
    const octave = Math.floor((noteValue - 1) / 12);
    noteStr = `${noteNames[noteIndex]}-${octave}`;
  } else if (typeof noteValue === "string" && noteValue && noteValue !== "---") {
    noteStr = noteValue;
  }
  if (noteStr) {
    period = noteToPeriod(noteStr);
    if (period === 0) {
      warnings.push(`Note ${noteStr} is out of range for MOD format (C-0 to B-3 supported).`);
    }
  }
  const instrument = cell.instrument || 0;
  let effect = 0;
  let effectParam = 0;
  if (cell.effect && cell.effect !== "...") {
    const parsed = parseEffect(cell.effect);
    effect = parsed.effect;
    effectParam = parsed.param;
    if (effect > 15) {
      warnings.push(`Effect ${cell.effect} is not supported in MOD format (only 0-F).`);
      effect = 0;
      effectParam = 0;
    }
  }
  if (cell.effTyp2 !== void 0 && cell.effTyp2 !== 0 || cell.eff2 !== void 0 && cell.eff2 !== 0) {
    warnings.push(`Effect2 column not supported in MOD format (will be lost).`);
  }
  if (cell.volume !== null) {
    if (effect === 0 && effectParam === 0) {
      effect = 12;
      effectParam = Math.min(cell.volume, 64);
    } else {
      warnings.push(`Volume column not supported in MOD (use Cxx effect).`);
    }
  }
  return {
    period,
    instrument,
    effect,
    effectParam
  };
}
function parseEffect(effectStr) {
  if (effectStr.length !== 3) return { effect: 0, param: 0 };
  const effectChar = effectStr[0].toUpperCase();
  const param = parseInt(effectStr.substring(1), 16);
  const effectLetters = "0123456789ABCDEF";
  const effect = effectLetters.indexOf(effectChar);
  return {
    effect: effect === -1 ? 0 : effect,
    param: isNaN(param) ? 0 : param
  };
}
async function convertSamplerToMODSample(inst, importMetadata) {
  var _a;
  const originalSample = (_a = importMetadata == null ? void 0 : importMetadata.originalSamples) == null ? void 0 : _a[inst.id];
  if (originalSample && originalSample.bitDepth === 8) {
    return {
      name: originalSample.name.substring(0, 22),
      length: Math.floor(originalSample.length / 2),
      // Convert frames to words
      finetune: originalSample.finetune + 8 & 15,
      // Convert -8 to +7 → 0 to 15
      volume: originalSample.volume,
      loopStart: Math.floor(originalSample.loopStart / 2),
      loopLength: originalSample.loopType === "none" ? 1 : Math.floor(originalSample.loopLength / 2),
      pcmData: new Int8Array(originalSample.pcmData)
    };
  }
  return createEmptySample(inst.name);
}
function createEmptySample(name = "") {
  return {
    name: name.substring(0, 22),
    length: 0,
    finetune: 0,
    volume: 64,
    loopStart: 0,
    loopLength: 1,
    // MOD spec: minimum loop length is 1 word
    pcmData: new Int8Array(0)
  };
}
function buildMODFile(config) {
  const headerSize = 1084;
  const patternSize = config.patterns.length * 1024;
  const sampleDataSize = config.samples.reduce((sum, s) => sum + s.pcmData.length, 0);
  const buffer = new Uint8Array(headerSize + patternSize + sampleDataSize);
  let offset = 0;
  writeString(buffer, offset, config.title, 20);
  offset += 20;
  for (const sample of config.samples) {
    writeSampleHeader(buffer, offset, sample);
    offset += 30;
  }
  buffer[offset++] = Math.min(config.songLength, 128);
  buffer[offset++] = 127;
  for (let i = 0; i < 128; i++) {
    buffer[offset++] = config.patternOrderTable[i];
  }
  writeString(buffer, offset, config.formatTag, 4);
  offset += 4;
  for (const pattern of config.patterns) {
    writePattern(buffer, offset, pattern);
    offset += 1024;
  }
  for (const sample of config.samples) {
    if (sample.pcmData.length > 0) {
      buffer.set(new Uint8Array(sample.pcmData.buffer), offset);
      offset += sample.pcmData.length;
    }
  }
  return buffer.buffer;
}
function writeSampleHeader(buffer, offset, sample) {
  const view = new DataView(buffer.buffer);
  writeString(buffer, offset, sample.name, 22);
  offset += 22;
  view.setUint16(offset, sample.length, false);
  offset += 2;
  buffer[offset++] = sample.finetune & 15;
  buffer[offset++] = Math.min(sample.volume, 64);
  view.setUint16(offset, sample.loopStart, false);
  offset += 2;
  view.setUint16(offset, Math.max(sample.loopLength, 1), false);
}
function writePattern(buffer, offset, pattern) {
  for (const row of pattern.rows) {
    for (const note of row) {
      const periodHigh = note.period >> 8 & 15;
      const periodLow = note.period & 255;
      const instHigh = note.instrument >> 4 & 15;
      const instLow = note.instrument & 15;
      buffer[offset++] = periodHigh << 4 | instHigh;
      buffer[offset++] = periodLow;
      buffer[offset++] = instLow << 4 | note.effect & 15;
      buffer[offset++] = note.effectParam & 255;
    }
  }
}
function writeString(buffer, offset, str, maxLength) {
  for (let i = 0; i < maxLength; i++) {
    buffer[offset + i] = i < str.length ? str.charCodeAt(i) : 0;
  }
}
export {
  exportAsMOD
};
