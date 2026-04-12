import { ds as DEFAULT_V2_INSTRUMENT, dt as DEFAULT_V2_GLOBALS } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function parseV2M(data) {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  let offset = 0;
  const timediv = view.getUint32(offset, true);
  offset += 4;
  const maxTime = view.getUint32(offset, true);
  offset += 4;
  const gdnum = view.getUint32(offset, true);
  offset += 4;
  offset += gdnum * 10;
  const channels = [];
  for (let ch = 0; ch < 16; ch++) {
    const notenum = view.getUint32(offset, true);
    offset += 4;
    const channel = {
      notes: [],
      programChanges: [],
      pitchBends: [],
      controlChanges: [[], [], [], [], [], [], []]
    };
    if (notenum > 0) {
      const notePtr = offset;
      offset += 5 * notenum;
      let time = 0;
      for (let i = 0; i < notenum; i++) {
        const dt = bytes[notePtr + i] + bytes[notePtr + notenum + i] * 256 + bytes[notePtr + 2 * notenum + i] * 65536;
        const note = bytes[notePtr + 3 * notenum + i];
        const velocity = bytes[notePtr + 4 * notenum + i];
        time += dt;
        if (velocity > 0) {
          channel.notes.push({
            time,
            note,
            velocity,
            duration: 0
            // Will be computed later
          });
        }
      }
      const pcnum = view.getUint32(offset, true);
      offset += 4;
      const pcPtr = offset;
      offset += 4 * pcnum;
      time = 0;
      let program = 0;
      for (let i = 0; i < pcnum; i++) {
        const dt = bytes[pcPtr + i] + bytes[pcPtr + pcnum + i] * 256 + bytes[pcPtr + 2 * pcnum + i] * 65536;
        const pgmDelta = bytes[pcPtr + 3 * pcnum + i];
        time += dt;
        program += pgmDelta;
        channel.programChanges.push({ time, program });
      }
      const pbnum = view.getUint32(offset, true);
      offset += 4;
      const pbPtr = offset;
      offset += 5 * pbnum;
      time = 0;
      for (let i = 0; i < pbnum; i++) {
        const dt = bytes[pbPtr + i] + bytes[pbPtr + pbnum + i] * 256 + bytes[pbPtr + 2 * pbnum + i] * 65536;
        const pbValue = bytes[pbPtr + 3 * pbnum + i] + bytes[pbPtr + 4 * pbnum + i] * 256;
        time += dt;
        channel.pitchBends.push({ time, value: pbValue });
      }
      for (let cc = 0; cc < 7; cc++) {
        const ccnum = view.getUint32(offset, true);
        offset += 4;
        const ccPtr = offset;
        offset += 4 * ccnum;
        time = 0;
        for (let i = 0; i < ccnum; i++) {
          const dt = bytes[ccPtr + i] + bytes[ccPtr + ccnum + i] * 256 + bytes[ccPtr + 2 * ccnum + i] * 65536;
          const value = bytes[ccPtr + 3 * ccnum + i];
          time += dt;
          channel.controlChanges[cc].push({ time, controller: cc, value });
        }
      }
    }
    channels.push(channel);
  }
  const globSize = view.getUint32(offset, true);
  offset += 4;
  const globals = bytes.slice(offset, offset + globSize);
  offset += globSize;
  const patchSize = view.getUint32(offset, true);
  offset += 4;
  const patches = [];
  if (patchSize > 0) {
    const patchData = bytes.slice(offset, offset + patchSize);
    const patchView = new DataView(patchData.buffer, patchData.byteOffset);
    const firstOffset = patchView.getUint32(0, true);
    const numPatches = firstOffset / 4;
    const offsets = [];
    for (let i = 0; i < numPatches; i++) {
      offsets.push(patchView.getUint32(i * 4, true));
    }
    for (let i = 0; i < numPatches; i++) {
      const start = offsets[i];
      const end = i < numPatches - 1 ? offsets[i + 1] : patchSize;
      patches.push(patchData.slice(start, end));
    }
    offset += patchSize;
  }
  let speechData;
  if (offset + 4 <= data.byteLength) {
    const spSize = view.getUint32(offset, true);
    offset += 4;
    if (spSize > 0 && spSize <= 8192 && offset + spSize <= data.byteLength) {
      speechData = bytes.slice(offset, offset + spSize);
    }
  }
  return {
    timediv,
    maxTime,
    channels,
    patches,
    globals,
    speechData
  };
}
function patchBytesToConfig(patchData) {
  const config = structuredClone(DEFAULT_V2_INSTRUMENT);
  if (patchData.length < 89) {
    console.warn("[V2M] Patch data too short:", patchData.length);
    return config;
  }
  let i = 0;
  config.voice.panning = patchData[i++];
  config.voice.transpose = patchData[i++];
  config.osc1.mode = numberToOscMode(patchData[i++]);
  config.osc1.ringmod = patchData[i++] !== 0;
  config.osc1.transpose = patchData[i++];
  config.osc1.detune = patchData[i++];
  config.osc1.color = patchData[i++];
  config.osc1.volume = patchData[i++];
  config.osc2.mode = numberToOscMode(patchData[i++]);
  config.osc2.ringmod = patchData[i++] !== 0;
  config.osc2.transpose = patchData[i++];
  config.osc2.detune = patchData[i++];
  config.osc2.color = patchData[i++];
  config.osc2.volume = patchData[i++];
  config.osc3.mode = numberToOscMode(patchData[i++]);
  config.osc3.ringmod = patchData[i++] !== 0;
  config.osc3.transpose = patchData[i++];
  config.osc3.detune = patchData[i++];
  config.osc3.color = patchData[i++];
  config.osc3.volume = patchData[i++];
  config.filter1.mode = numberToFilterMode(patchData[i++]);
  config.filter1.cutoff = patchData[i++];
  config.filter1.resonance = patchData[i++];
  config.filter2.mode = numberToFilterMode(patchData[i++]);
  config.filter2.cutoff = patchData[i++];
  config.filter2.resonance = patchData[i++];
  config.filterRouting = numberToFilterRouting(patchData[i++]);
  config.filterBalance = patchData[i++];
  config.voiceDistortion.mode = numberToDistMode(patchData[i++]);
  config.voiceDistortion.inGain = patchData[i++];
  config.voiceDistortion.param1 = patchData[i++];
  config.voiceDistortion.param2 = patchData[i++];
  config.ampEnvelope.attack = patchData[i++];
  config.ampEnvelope.decay = patchData[i++];
  config.ampEnvelope.sustain = patchData[i++];
  config.ampEnvelope.sustainTime = patchData[i++];
  config.ampEnvelope.release = patchData[i++];
  config.ampEnvelope.amplify = patchData[i++];
  config.modEnvelope.attack = patchData[i++];
  config.modEnvelope.decay = patchData[i++];
  config.modEnvelope.sustain = patchData[i++];
  config.modEnvelope.sustainTime = patchData[i++];
  config.modEnvelope.release = patchData[i++];
  config.modEnvelope.amplify = patchData[i++];
  config.lfo1.mode = numberToLFOMode(patchData[i++]);
  config.lfo1.keySync = patchData[i++] !== 0;
  config.lfo1.envMode = patchData[i++] !== 0;
  config.lfo1.rate = patchData[i++];
  config.lfo1.phase = patchData[i++];
  config.lfo1.polarity = numberToLFOPolarity(patchData[i++]);
  config.lfo1.amplify = patchData[i++];
  config.lfo2.mode = numberToLFOMode(patchData[i++]);
  config.lfo2.keySync = patchData[i++] !== 0;
  config.lfo2.envMode = patchData[i++] !== 0;
  config.lfo2.rate = patchData[i++];
  config.lfo2.phase = patchData[i++];
  config.lfo2.polarity = numberToLFOPolarity(patchData[i++]);
  config.lfo2.amplify = patchData[i++];
  config.voice.keySync = numberToKeySync(patchData[i++]);
  config.voice.channelVolume = patchData[i++];
  config.voice.auxARecv = patchData[i++];
  config.voice.auxBRecv = patchData[i++];
  config.voice.auxASend = patchData[i++];
  config.voice.auxBSend = patchData[i++];
  config.voice.reverb = patchData[i++];
  config.voice.delay = patchData[i++];
  config.voice.fxRoute = patchData[i++] !== 0 ? "chorusThenDist" : "distThenChorus";
  config.voice.boost = patchData[i++];
  config.channelDistortion.mode = numberToDistMode(patchData[i++]);
  config.channelDistortion.inGain = patchData[i++];
  config.channelDistortion.param1 = patchData[i++];
  config.channelDistortion.param2 = patchData[i++];
  config.chorusFlanger.amount = patchData[i++];
  config.chorusFlanger.feedback = patchData[i++];
  config.chorusFlanger.delayL = patchData[i++];
  config.chorusFlanger.delayR = patchData[i++];
  config.chorusFlanger.modRate = patchData[i++];
  config.chorusFlanger.modDepth = patchData[i++];
  config.chorusFlanger.modPhase = patchData[i++];
  config.compressor.mode = numberToCompMode(patchData[i++]);
  config.compressor.stereoLink = patchData[i++] !== 0;
  config.compressor.autoGain = patchData[i++] !== 0;
  config.compressor.lookahead = patchData[i++];
  config.compressor.threshold = patchData[i++];
  config.compressor.ratio = patchData[i++];
  config.compressor.attack = patchData[i++];
  config.compressor.release = patchData[i++];
  config.compressor.outGain = patchData[i++];
  config.voice.maxPoly = patchData[i++];
  if (i < patchData.length) {
    const modCount = patchData[i++];
    config.modMatrix = [];
    for (let m = 0; m < modCount && i + 2 < patchData.length; m++) {
      config.modMatrix.push({
        source: numberToModSource(patchData[i++]),
        amount: patchData[i++],
        dest: patchData[i++]
      });
    }
  }
  return config;
}
function globalBytesToEffects(globData) {
  const effects = structuredClone(DEFAULT_V2_GLOBALS);
  if (globData.length < 22) {
    console.warn("[V2M] Global data too short:", globData.length);
    return effects;
  }
  let i = 0;
  effects.reverbTime = globData[i++];
  effects.reverbHighCut = globData[i++];
  effects.reverbLowCut = globData[i++];
  effects.reverbVolume = globData[i++];
  effects.delayVolume = globData[i++];
  effects.delayFeedback = globData[i++];
  effects.delayL = globData[i++];
  effects.delayR = globData[i++];
  effects.delayModRate = globData[i++];
  effects.delayModDepth = globData[i++];
  effects.delayModPhase = globData[i++];
  effects.lowCut = globData[i++];
  effects.highCut = globData[i++];
  effects.sumCompressor.mode = numberToCompMode(globData[i++]);
  effects.sumCompressor.stereoLink = globData[i++] !== 0;
  effects.sumCompressor.autoGain = globData[i++] !== 0;
  effects.sumCompressor.lookahead = globData[i++];
  effects.sumCompressor.threshold = globData[i++];
  effects.sumCompressor.ratio = globData[i++];
  effects.sumCompressor.attack = globData[i++];
  effects.sumCompressor.release = globData[i++];
  effects.sumCompressor.outGain = globData[i++];
  return effects;
}
function numberToOscMode(n) {
  const modes = ["off", "saw", "pulse", "sin", "noise", "fm", "auxA", "auxB"];
  return modes[n] ?? "off";
}
function numberToFilterMode(n) {
  const modes = ["off", "low", "band", "high", "notch", "all", "moogL", "moogH"];
  return modes[n] ?? "off";
}
function numberToFilterRouting(n) {
  const modes = ["single", "serial", "parallel"];
  return modes[n] ?? "single";
}
function numberToDistMode(n) {
  const modes = ["off", "overdrive", "clip", "bitcrush", "decimate", "lpf", "bpf", "hpf", "notch", "allpass", "moogL"];
  return modes[n] ?? "off";
}
function numberToLFOMode(n) {
  const modes = ["saw", "tri", "pulse", "sin", "sampleHold"];
  return modes[n] ?? "tri";
}
function numberToLFOPolarity(n) {
  const modes = ["positive", "negative", "bipolar"];
  return modes[n] ?? "positive";
}
function numberToKeySync(n) {
  const modes = ["none", "osc", "full"];
  return modes[n] ?? "none";
}
function numberToCompMode(n) {
  const modes = ["off", "peak", "rms"];
  return modes[n] ?? "off";
}
function numberToModSource(n) {
  const sources = [
    "velocity",
    "modulation",
    "breath",
    "ctl3",
    "ctl4",
    "ctl5",
    "ctl6",
    "volume",
    "ampEG",
    "eg2",
    "lfo1",
    "lfo2",
    "note"
  ];
  return sources[n] ?? "velocity";
}
function getV2MActiveChannels(v2m) {
  return v2m.channels.map((ch, i) => ({ ch, i })).filter(({ ch }) => ch.notes.length > 0).map(({ i }) => i);
}
function midiToNoteValue(midi) {
  const clamped = Math.max(0, Math.min(95, midi - 12));
  return clamped + 1;
}
function emptyCell() {
  return {
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  };
}
function createChannel(id, name, numRows) {
  const rows = [];
  for (let r = 0; r < numRows; r++) {
    rows.push(emptyCell());
  }
  return {
    id,
    name,
    rows,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: null,
    color: null,
    channelMeta: {
      importedFromMOD: false,
      channelType: "synth"
    }
  };
}
function createPattern(id, numRows, numChannels) {
  const channels = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(createChannel(`ch${c}`, `V2 Ch ${c + 1}`, numRows));
  }
  return {
    id,
    name: `Pattern ${id}`,
    length: numRows,
    channels
  };
}
function importV2M(data, options = {}) {
  const {
    rowsPerPattern = 64,
    bpm = 120,
    speed = 6,
    createInstruments = true
  } = options;
  const v2m = parseV2M(data);
  const activeChannels = getV2MActiveChannels(v2m);
  const numChannels = Math.max(activeChannels.length, 1);
  const ticksPerRow = v2m.timediv / 4 * (speed / 6);
  const totalTicks = v2m.maxTime;
  const totalRows = Math.ceil(totalTicks / ticksPerRow);
  const numPatterns = Math.ceil(totalRows / rowsPerPattern);
  const channelMap = /* @__PURE__ */ new Map();
  activeChannels.forEach((v2mCh, idx) => {
    channelMap.set(v2mCh, idx);
  });
  const patterns = [];
  for (let p = 0; p < numPatterns; p++) {
    patterns.push(createPattern(String(p), rowsPerPattern, numChannels));
  }
  for (const v2mChannel of activeChannels) {
    const dbChannel = channelMap.get(v2mChannel);
    const channel = v2m.channels[v2mChannel];
    let currentProgram = 0;
    let programIdx = 0;
    const sortedNotes = [...channel.notes].sort((a, b) => a.time - b.time);
    for (const note of sortedNotes) {
      while (programIdx < channel.programChanges.length - 1 && channel.programChanges[programIdx + 1].time <= note.time) {
        programIdx++;
      }
      if (channel.programChanges.length > 0 && channel.programChanges[programIdx].time <= note.time) {
        currentProgram = channel.programChanges[programIdx].program;
      }
      const row = Math.floor(note.time / ticksPerRow);
      const patternIdx = Math.floor(row / rowsPerPattern);
      const rowInPattern = row % rowsPerPattern;
      if (patternIdx >= patterns.length) continue;
      const pattern = patterns[patternIdx];
      const cell = pattern.channels[dbChannel].rows[rowInPattern];
      cell.note = midiToNoteValue(note.note);
      cell.instrument = currentProgram + 1;
      if (note.velocity > 0 && note.velocity < 127) {
        cell.volume = 16 + Math.round(note.velocity / 127 * 64);
      }
    }
    for (const pb of channel.pitchBends) {
      const row = Math.floor(pb.time / ticksPerRow);
      const patternIdx = Math.floor(row / rowsPerPattern);
      const rowInPattern = row % rowsPerPattern;
      if (patternIdx >= patterns.length) continue;
      const pattern = patterns[patternIdx];
      const cell = pattern.channels[dbChannel].rows[rowInPattern];
      const centered = pb.value - 8192;
      if (centered !== 0) {
        const effType = centered > 0 ? 1 : 2;
        const amount = Math.min(Math.abs(centered) >> 6, 255);
        cell.effTyp = effType;
        cell.eff = amount;
      }
    }
  }
  const instruments = [];
  if (createInstruments) {
    for (let i = 0; i < v2m.patches.length; i++) {
      const patchData = v2m.patches[i];
      const v2config = patchBytesToConfig(patchData);
      instruments.push({
        id: i + 1,
        // 1-indexed
        name: `V2 Patch ${i}`,
        type: "synth",
        synthType: "V2",
        // V2InstrumentConfig is more detailed than V2Config, cast for compatibility
        v2: v2config,
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  const globalEffects = globalBytesToEffects(v2m.globals);
  return {
    patterns,
    instruments,
    globalEffects,
    bpm,
    speed,
    v2m
  };
}
function getV2MSummary(data) {
  const v2m = parseV2M(data);
  const activeChannels = getV2MActiveChannels(v2m);
  let noteCount = 0;
  for (const ch of activeChannels) {
    noteCount += v2m.channels[ch].notes.length;
  }
  const ticksPerSecond = v2m.timediv * 120 / 60;
  const duration = v2m.maxTime / ticksPerSecond;
  return {
    duration,
    activeChannels,
    patchCount: v2m.patches.length,
    noteCount,
    maxTime: v2m.maxTime,
    timediv: v2m.timediv
  };
}
export {
  getV2MSummary,
  importV2M
};
