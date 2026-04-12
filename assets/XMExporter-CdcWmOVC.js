const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/AutomationBaker-fv7yT9k7.js"])))=>i.map(i=>d[i]);
import { am as __vitePreload } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
async function exportAsXM(patterns, instruments, options = {}) {
  var _a, _b, _c;
  const warnings = [];
  const channelLimit = options.channelLimit || 32;
  const downmixExtra = options.downmixExtra ?? false;
  const bakeSynthsToSamples = options.bakeSynthsToSamples ?? true;
  const stripInstrumentEffects = options.stripInstrumentEffects ?? true;
  const defaultSpeed = options.defaultSpeed || 6;
  const defaultBPM = options.defaultBPM || 125;
  const moduleName = options.moduleName || "DEViLBOX Export";
  const trackerName = options.trackerName || "DEViLBOX v1.0";
  const importMetadata = (_a = patterns[0]) == null ? void 0 : _a.importMetadata;
  (importMetadata == null ? void 0 : importMetadata.sourceFormat) === "XM";
  const maxChannels = Math.max(...patterns.map((p) => p.channels.length));
  if (maxChannels > channelLimit) {
    warnings.push(
      `Pattern has ${maxChannels} channels. XM supports max ${channelLimit}. Extra channels will be ${downmixExtra ? "downmixed" : "truncated"}.`
    );
  }
  const effectiveChannels = Math.min(maxChannels, channelLimit);
  const xmInstruments = [];
  for (const inst of instruments) {
    if (inst.synthType !== "Sampler" && bakeSynthsToSamples) {
      warnings.push(`Synth instrument "${inst.name}" exported as silent placeholder (live synth audio cannot be baked at export time).`);
      xmInstruments.push(createEmptyXMInstrument(inst.name));
    } else if (inst.synthType === "Sampler") {
      const xmInst = await convertSamplerToXMInstrument(inst, importMetadata);
      xmInstruments.push(xmInst);
    } else {
      warnings.push(`Synth instrument "${inst.name}" exported as silent placeholder (XM format requires sample data).`);
      xmInstruments.push(createEmptyXMInstrument(inst.name));
    }
    if (inst.effects && inst.effects.length > 0 && stripInstrumentEffects) {
      warnings.push(`Instrument "${inst.name}" has ${inst.effects.length} effects that will be lost.`);
    }
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
      const bakeResult = bakeAutomationForExport(patterns, curves, FORMAT_LIMITS.XM);
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
  const xmPatterns = exportPatterns.map(
    (pattern) => convertPatternToXM(pattern, effectiveChannels)
  );
  const xmData = buildXMFile({
    moduleName,
    trackerName,
    patterns: xmPatterns,
    instruments: xmInstruments,
    channelCount: effectiveChannels,
    defaultSpeed,
    defaultBPM,
    songLength: patterns.length,
    restartPosition: ((_b = importMetadata == null ? void 0 : importMetadata.modData) == null ? void 0 : _b.restartPosition) || 0,
    linearFrequency: !((_c = importMetadata == null ? void 0 : importMetadata.modData) == null ? void 0 : _c.amigaPeriods)
  });
  const blob = new Blob([xmData], { type: "application/octet-stream" });
  const filename = `${moduleName.replace(/[^a-zA-Z0-9]/g, "_")}.xm`;
  return {
    data: blob,
    warnings,
    filename
  };
}
function convertPatternToXM(pattern, channelCount) {
  var _a;
  const rows = [];
  for (let row = 0; row < pattern.length; row++) {
    const rowNotes = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const cell = (_a = pattern.channels[ch]) == null ? void 0 : _a.rows[row];
      if (!cell) {
        rowNotes.push({ note: 0, instrument: 0, volume: 0, effectType: 0, effectParam: 0 });
        continue;
      }
      const xmNote = convertCellToXMNote(cell);
      rowNotes.push(xmNote);
    }
    rows.push(rowNotes);
  }
  return { rows };
}
function convertCellToXMNote(cell) {
  let note = 0;
  const noteValue = cell.note;
  if (noteValue) {
    if (typeof noteValue === "number") {
      note = noteValue;
    } else if (noteValue === "===") {
      note = 97;
    } else if (noteValue !== "---") {
      note = noteNameToNumber(noteValue);
    }
  }
  const instrument = cell.instrument || 0;
  let volume = 0;
  if (cell.volume !== null) {
    volume = 16 + Math.min(cell.volume, 64);
  } else if (cell.effTyp2 !== void 0 && cell.effTyp2 !== 0 || cell.eff2 !== void 0 && cell.eff2 !== 0) {
    volume = convertEffectToVolumeColumnNumeric(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
  }
  let effectType = 0;
  let effectParam = 0;
  if (cell.effect && cell.effect !== "...") {
    const parsed = parseEffect(cell.effect);
    effectType = parsed.type;
    effectParam = parsed.param;
  }
  return {
    note,
    instrument,
    volume,
    effectType,
    effectParam
  };
}
function noteNameToNumber(noteName) {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const match = noteName.match(/^([A-G]#?)-?(\d)$/);
  if (!match) return 0;
  const note = notes.indexOf(match[1]);
  const octave = parseInt(match[2]);
  if (note === -1 || octave < 0 || octave > 7) return 0;
  return octave * 12 + note + 1;
}
function parseEffect(effect) {
  if (effect.length !== 3) return { type: 0, param: 0 };
  const effectChar = effect[0].toUpperCase();
  const param = parseInt(effect.substring(1), 16);
  const effectLetters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const type = effectLetters.indexOf(effectChar);
  return {
    type: type === -1 ? 0 : type,
    param: isNaN(param) ? 0 : param
  };
}
function convertEffectToVolumeColumnNumeric(effTyp, eff) {
  if (effTyp === 10) {
    const x = eff >> 4 & 15;
    const y = eff & 15;
    if (x > 0) return 112 + x;
    if (y > 0) return 96 + y;
  }
  if (effTyp === 14) {
    const x = eff >> 4 & 15;
    const y = eff & 15;
    if (x === 10) return 144 + y;
    if (x === 11) return 128 + y;
  }
  if (effTyp === 4) {
    const y = eff & 15;
    return 176 + y;
  }
  if (effTyp === 3) {
    const speed = Math.floor(eff / 16);
    return 240 + Math.min(speed, 15);
  }
  return 0;
}
async function convertSamplerToXMInstrument(inst, importMetadata) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S;
  const originalSample = (_a = importMetadata == null ? void 0 : importMetadata.originalSamples) == null ? void 0 : _a[inst.id];
  if (originalSample) {
    return {
      name: inst.name.substring(0, 22),
      samples: [
        {
          name: originalSample.name.substring(0, 22),
          pcmData: originalSample.pcmData,
          loopStart: originalSample.loopStart * (originalSample.bitDepth === 16 ? 2 : 1),
          loopLength: originalSample.loopLength * (originalSample.bitDepth === 16 ? 2 : 1),
          volume: originalSample.volume,
          finetune: originalSample.finetune,
          type: buildTypeFlags(originalSample.loopType, originalSample.bitDepth),
          panning: originalSample.panning,
          relativeNote: originalSample.relativeNote
        }
      ],
      volumeEnvelope: (_c = (_b = importMetadata == null ? void 0 : importMetadata.envelopes) == null ? void 0 : _b[inst.id]) == null ? void 0 : _c.volumeEnvelope,
      panningEnvelope: (_e = (_d = importMetadata == null ? void 0 : importMetadata.envelopes) == null ? void 0 : _d[inst.id]) == null ? void 0 : _e.panningEnvelope,
      vibratoType: ((_h = (_g = (_f = importMetadata == null ? void 0 : importMetadata.envelopes) == null ? void 0 : _f[inst.id]) == null ? void 0 : _g.autoVibrato) == null ? void 0 : _h.type) === "sine" ? 0 : ((_k = (_j = (_i = importMetadata == null ? void 0 : importMetadata.envelopes) == null ? void 0 : _i[inst.id]) == null ? void 0 : _j.autoVibrato) == null ? void 0 : _k.type) === "square" ? 1 : ((_n = (_m = (_l = importMetadata == null ? void 0 : importMetadata.envelopes) == null ? void 0 : _l[inst.id]) == null ? void 0 : _m.autoVibrato) == null ? void 0 : _n.type) === "rampDown" ? 2 : ((_q = (_p = (_o = importMetadata == null ? void 0 : importMetadata.envelopes) == null ? void 0 : _o[inst.id]) == null ? void 0 : _p.autoVibrato) == null ? void 0 : _q.type) === "rampUp" ? 3 : 0,
      vibratoSweep: ((_t = (_s = (_r = importMetadata == null ? void 0 : importMetadata.envelopes) == null ? void 0 : _r[inst.id]) == null ? void 0 : _s.autoVibrato) == null ? void 0 : _t.sweep) || 0,
      vibratoDepth: ((_w = (_v = (_u = importMetadata == null ? void 0 : importMetadata.envelopes) == null ? void 0 : _u[inst.id]) == null ? void 0 : _v.autoVibrato) == null ? void 0 : _w.depth) || 0,
      vibratoRate: ((_z = (_y = (_x = importMetadata == null ? void 0 : importMetadata.envelopes) == null ? void 0 : _x[inst.id]) == null ? void 0 : _y.autoVibrato) == null ? void 0 : _z.rate) || 0,
      volumeFadeout: ((_B = (_A = importMetadata == null ? void 0 : importMetadata.envelopes) == null ? void 0 : _A[inst.id]) == null ? void 0 : _B.fadeout) || 0
    };
  }
  const sampleCfg = inst.sample;
  if ((sampleCfg == null ? void 0 : sampleCfg.audioBuffer) && sampleCfg.audioBuffer.byteLength > 0) {
    const rawPCM = convertFloat32To8BitPCM(sampleCfg.audioBuffer);
    const volume = dbToXMVolume(inst.volume);
    const finetune = Math.round(Math.max(-128, Math.min(127, sampleCfg.detune * 1.27)));
    const relativeNote = baseNoteToRelativeNote(sampleCfg.baseNote);
    const panning = Math.round((inst.pan + 100) / 200 * 255);
    const loopStart = Math.max(0, sampleCfg.loopStart);
    const loopEnd = Math.max(loopStart, sampleCfg.loopEnd);
    const loopLength = sampleCfg.loop ? Math.max(0, loopEnd - loopStart) : 0;
    const loopType = !sampleCfg.loop ? "none" : sampleCfg.loopType === "pingpong" ? "pingpong" : "forward";
    return {
      name: inst.name.substring(0, 22),
      samples: [
        {
          name: inst.name.substring(0, 22),
          pcmData: rawPCM,
          loopStart,
          loopLength,
          volume,
          finetune,
          type: buildTypeFlags(loopType, 8),
          panning: Math.max(0, Math.min(255, panning)),
          relativeNote
        }
      ],
      volumeEnvelope: (_C = inst.metadata) == null ? void 0 : _C.originalEnvelope,
      panningEnvelope: (_D = inst.metadata) == null ? void 0 : _D.panningEnvelope,
      vibratoType: ((_F = (_E = inst.metadata) == null ? void 0 : _E.autoVibrato) == null ? void 0 : _F.type) === "sine" ? 0 : ((_H = (_G = inst.metadata) == null ? void 0 : _G.autoVibrato) == null ? void 0 : _H.type) === "square" ? 1 : ((_J = (_I = inst.metadata) == null ? void 0 : _I.autoVibrato) == null ? void 0 : _J.type) === "rampDown" ? 2 : ((_L = (_K = inst.metadata) == null ? void 0 : _K.autoVibrato) == null ? void 0 : _L.type) === "rampUp" ? 3 : 0,
      vibratoSweep: ((_N = (_M = inst.metadata) == null ? void 0 : _M.autoVibrato) == null ? void 0 : _N.sweep) || 0,
      vibratoDepth: ((_P = (_O = inst.metadata) == null ? void 0 : _O.autoVibrato) == null ? void 0 : _P.depth) || 0,
      vibratoRate: ((_R = (_Q = inst.metadata) == null ? void 0 : _Q.autoVibrato) == null ? void 0 : _R.rate) || 0,
      volumeFadeout: ((_S = inst.metadata) == null ? void 0 : _S.fadeout) || 0
    };
  }
  return createEmptyXMInstrument(inst.name);
}
function convertFloat32To8BitPCM(buffer) {
  const byteLen = buffer.byteLength;
  if (byteLen % 4 === 0 && byteLen >= 4) {
    const floats = new Float32Array(buffer);
    const out = new Int8Array(floats.length);
    for (let i = 0; i < floats.length; i++) {
      const v = Math.max(-1, Math.min(1, floats[i]));
      out[i] = Math.round(v * 127);
    }
    return out.buffer;
  }
  return buffer;
}
function dbToXMVolume(db) {
  if (db <= -60) return 0;
  if (db >= 0) return 64;
  return Math.round((db + 60) / 60 * 64);
}
function baseNoteToRelativeNote(baseNote) {
  if (!baseNote) return 0;
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const match = baseNote.match(/^([A-G]#?)-?(\d)$/);
  if (!match) return 0;
  const noteIdx = notes.indexOf(match[1]);
  if (noteIdx === -1) return 0;
  const octave = parseInt(match[2]);
  const midiNote = octave * 12 + noteIdx;
  const c4Midi = 4 * 12 + 0;
  const relative = midiNote - c4Midi;
  return Math.max(-96, Math.min(95, relative));
}
function buildTypeFlags(loopType, bitDepth) {
  let flags = 0;
  if (loopType === "forward") flags |= 1;
  if (loopType === "pingpong") flags |= 2;
  if (bitDepth === 16) flags |= 16;
  return flags;
}
function createEmptyXMInstrument(name) {
  return {
    name: name.substring(0, 22),
    samples: [],
    vibratoType: 0,
    vibratoSweep: 0,
    vibratoDepth: 0,
    vibratoRate: 0,
    volumeFadeout: 0
  };
}
function buildXMFile(config) {
  const buffers = [];
  buffers.push(writeXMHeader(config));
  for (const pattern of config.patterns) {
    buffers.push(writeXMPattern(pattern, config.channelCount));
  }
  for (const instrument of config.instruments) {
    buffers.push(writeXMInstrument(instrument));
  }
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result.buffer;
}
function writeXMHeader(config) {
  const buffer = new Uint8Array(336);
  const view = new DataView(buffer.buffer);
  let offset = 0;
  const idText = "Extended Module: ";
  for (let i = 0; i < 17; i++) {
    buffer[offset++] = idText.charCodeAt(i);
  }
  writeString(buffer, offset, config.moduleName, 20);
  offset += 20;
  buffer[offset++] = 26;
  writeString(buffer, offset, config.trackerName, 20);
  offset += 20;
  view.setUint16(offset, 260, true);
  offset += 2;
  view.setUint32(offset, 276, true);
  offset += 4;
  view.setUint16(offset, config.songLength, true);
  offset += 2;
  view.setUint16(offset, config.restartPosition, true);
  offset += 2;
  view.setUint16(offset, config.channelCount, true);
  offset += 2;
  view.setUint16(offset, config.patterns.length, true);
  offset += 2;
  view.setUint16(offset, config.instruments.length, true);
  offset += 2;
  view.setUint16(offset, config.linearFrequency ? 1 : 0, true);
  offset += 2;
  view.setUint16(offset, config.defaultSpeed, true);
  offset += 2;
  view.setUint16(offset, config.defaultBPM, true);
  offset += 2;
  for (let i = 0; i < 256; i++) {
    buffer[offset++] = i < config.songLength ? i : 0;
  }
  return buffer;
}
function writeXMPattern(pattern, channelCount) {
  const packedData = packPatternData(pattern.rows, channelCount);
  const header = new Uint8Array(9);
  const view = new DataView(header.buffer);
  view.setUint32(0, 9, true);
  header[4] = 0;
  view.setUint16(5, pattern.rows.length, true);
  view.setUint16(7, packedData.length, true);
  const result = new Uint8Array(header.length + packedData.length);
  result.set(header, 0);
  result.set(packedData, header.length);
  return result;
}
function packPatternData(rows, channelCount) {
  const packed = [];
  for (const row of rows) {
    for (let ch = 0; ch < channelCount; ch++) {
      const note = row[ch] || { note: 0, instrument: 0, volume: 0, effectType: 0, effectParam: 0 };
      if (note.note === 0 && note.instrument === 0 && note.volume === 0 && note.effectType === 0 && note.effectParam === 0) {
        packed.push(128);
        continue;
      }
      let packByte = 128;
      const data = [];
      if (note.note > 0) {
        packByte |= 1;
        data.push(note.note);
      }
      if (note.instrument > 0) {
        packByte |= 2;
        data.push(note.instrument);
      }
      if (note.volume > 0) {
        packByte |= 4;
        data.push(note.volume);
      }
      if (note.effectType > 0) {
        packByte |= 8;
        data.push(note.effectType);
      }
      if (note.effectParam > 0) {
        packByte |= 16;
        data.push(note.effectParam);
      }
      packed.push(packByte);
      packed.push(...data);
    }
  }
  return new Uint8Array(packed);
}
function writeXMInstrument(instrument) {
  const numSamples = instrument.samples.length;
  if (numSamples === 0) {
    const buf = new Uint8Array(29);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 29, true);
    writeString(buf, 4, instrument.name, 22);
    buf[26] = 0;
    view.setUint16(27, 0, true);
    return buf;
  }
  const deltaBlocks = instrument.samples.map(
    (s) => deltaEncodeSampleData(s.pcmData, s.type)
  );
  const HEADER_SIZE = 263;
  const SAMPLE_HEADER_SIZE = 40;
  const header = new Uint8Array(HEADER_SIZE);
  const hView = new DataView(header.buffer);
  hView.setUint32(0, HEADER_SIZE, true);
  writeString(header, 4, instrument.name, 22);
  header[26] = 0;
  hView.setUint16(27, numSamples, true);
  hView.setUint32(29, SAMPLE_HEADER_SIZE, true);
  const volEnv = instrument.volumeEnvelope;
  if (volEnv) {
    const pointCount = Math.min(volEnv.points.length, 12);
    for (let i = 0; i < pointCount; i++) {
      hView.setUint16(129 + i * 4, volEnv.points[i].tick, true);
      hView.setUint16(129 + i * 4 + 2, volEnv.points[i].value, true);
    }
  }
  const panEnv = instrument.panningEnvelope;
  if (panEnv) {
    const pointCount = Math.min(panEnv.points.length, 12);
    for (let i = 0; i < pointCount; i++) {
      hView.setUint16(177 + i * 4, panEnv.points[i].tick, true);
      hView.setUint16(177 + i * 4 + 2, panEnv.points[i].value, true);
    }
  }
  header[225] = volEnv ? Math.min(volEnv.points.length, 12) : 0;
  header[226] = panEnv ? Math.min(panEnv.points.length, 12) : 0;
  header[227] = (volEnv == null ? void 0 : volEnv.sustainPoint) != null ? volEnv.sustainPoint : 0;
  header[228] = (volEnv == null ? void 0 : volEnv.loopStartPoint) != null ? volEnv.loopStartPoint : 0;
  header[229] = (volEnv == null ? void 0 : volEnv.loopEndPoint) != null ? volEnv.loopEndPoint : 0;
  header[230] = (panEnv == null ? void 0 : panEnv.sustainPoint) != null ? panEnv.sustainPoint : 0;
  header[231] = (panEnv == null ? void 0 : panEnv.loopStartPoint) != null ? panEnv.loopStartPoint : 0;
  header[232] = (panEnv == null ? void 0 : panEnv.loopEndPoint) != null ? panEnv.loopEndPoint : 0;
  let volFlags = 0;
  if (volEnv == null ? void 0 : volEnv.enabled) volFlags |= 1;
  if ((volEnv == null ? void 0 : volEnv.enabled) && volEnv.sustainPoint != null) volFlags |= 2;
  if ((volEnv == null ? void 0 : volEnv.enabled) && volEnv.loopStartPoint != null) volFlags |= 4;
  header[233] = volFlags;
  let panFlags = 0;
  if (panEnv == null ? void 0 : panEnv.enabled) panFlags |= 1;
  if ((panEnv == null ? void 0 : panEnv.enabled) && panEnv.sustainPoint != null) panFlags |= 2;
  if ((panEnv == null ? void 0 : panEnv.enabled) && panEnv.loopStartPoint != null) panFlags |= 4;
  header[234] = panFlags;
  header[235] = instrument.vibratoType;
  header[236] = instrument.vibratoSweep;
  header[237] = instrument.vibratoDepth;
  header[238] = instrument.vibratoRate;
  hView.setUint16(239, Math.min(instrument.volumeFadeout, 65535), true);
  const sampleHeaders = new Uint8Array(numSamples * SAMPLE_HEADER_SIZE);
  const shView = new DataView(sampleHeaders.buffer);
  for (let i = 0; i < numSamples; i++) {
    const s = instrument.samples[i];
    const base = i * SAMPLE_HEADER_SIZE;
    shView.setUint32(base + 0, deltaBlocks[i].byteLength, true);
    shView.setUint32(base + 4, s.loopStart, true);
    shView.setUint32(base + 8, s.loopLength, true);
    sampleHeaders[base + 12] = Math.max(0, Math.min(64, s.volume));
    shView.setInt8(base + 13, Math.max(-128, Math.min(127, s.finetune)));
    sampleHeaders[base + 14] = s.type;
    sampleHeaders[base + 15] = Math.max(0, Math.min(255, s.panning));
    shView.setInt8(base + 16, Math.max(-96, Math.min(95, s.relativeNote)));
    sampleHeaders[base + 17] = 0;
    writeString(sampleHeaders, base + 18, s.name, 22);
  }
  const totalLength = header.length + sampleHeaders.length + deltaBlocks.reduce((sum, b) => sum + b.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  result.set(header, pos);
  pos += header.length;
  result.set(sampleHeaders, pos);
  pos += sampleHeaders.length;
  for (const block of deltaBlocks) {
    result.set(block, pos);
    pos += block.byteLength;
  }
  return result;
}
function deltaEncodeSampleData(pcmData, typeFlags) {
  const is16Bit = (typeFlags & 16) !== 0;
  if (is16Bit) {
    const samples = new Int16Array(pcmData);
    const out = new Uint8Array(samples.length * 2);
    const outView = new DataView(out.buffer);
    let prev = 0;
    for (let i = 0; i < samples.length; i++) {
      const delta = samples[i] - prev;
      prev = samples[i];
      const wrapped = (delta & 65535) << 16 >> 16;
      outView.setInt16(i * 2, wrapped, true);
    }
    return out;
  } else {
    const src = new Uint8Array(pcmData);
    const out = new Uint8Array(src.length);
    let prev = 0;
    for (let i = 0; i < src.length; i++) {
      const signed = src[i] << 24 >> 24;
      const delta = signed - prev;
      prev = signed;
      out[i] = delta & 255;
    }
    return out;
  }
}
function writeString(buffer, offset, str, maxLength) {
  for (let i = 0; i < maxLength; i++) {
    buffer[offset + i] = i < str.length ? str.charCodeAt(i) : 0;
  }
}
export {
  exportAsXM
};
