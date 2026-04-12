class DrumPadEngine {
  static MAX_VOICES = 32;
  // Polyphony limit
  context;
  masterGain;
  voices = /* @__PURE__ */ new Map();
  outputs = /* @__PURE__ */ new Map();
  muteGroups = /* @__PURE__ */ new Map();
  // padId -> muteGroup
  reversedBufferCache = /* @__PURE__ */ new WeakMap();
  constructor(context, outputDestination) {
    this.context = context;
    this.masterGain = this.context.createGain();
    this.masterGain.connect(outputDestination ?? this.context.destination);
    this.outputs.set("stereo", this.masterGain);
    ["out1", "out2", "out3", "out4"].forEach((bus) => {
      const gain = this.context.createGain();
      gain.connect(this.masterGain);
      this.outputs.set(bus, gain);
    });
  }
  /**
   * Reconnect master output to a different destination node.
   * Used when switching between standalone and DJ mixer routing.
   */
  rerouteOutput(destination) {
    this.masterGain.disconnect();
    this.masterGain.connect(destination);
  }
  /**
   * Set mute group assignments for all pads
   */
  setMuteGroups(pads) {
    this.muteGroups.clear();
    for (const pad of pads) {
      if (pad.muteGroup > 0) {
        this.muteGroups.set(pad.id, pad.muteGroup);
      }
    }
  }
  /**
   * Get or lazily create a reversed copy of an AudioBuffer
   */
  getReversedBuffer(buffer) {
    const cached = this.reversedBufferCache.get(buffer);
    if (cached) return cached;
    const reversed = this.context.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = reversed.getChannelData(ch);
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[src.length - 1 - i];
      }
    }
    this.reversedBufferCache.set(buffer, reversed);
    return reversed;
  }
  /**
   * Trigger a pad with velocity
   */
  triggerPad(pad, velocity) {
    var _a, _b;
    let sampleBuffer = ((_a = pad.sample) == null ? void 0 : _a.audioBuffer) ?? null;
    let layerLevelOffset = 0;
    if (pad.layers.length > 0) {
      const matchingLayer = pad.layers.find(
        (l) => velocity >= l.velocityRange[0] && velocity <= l.velocityRange[1]
      );
      if ((_b = matchingLayer == null ? void 0 : matchingLayer.sample) == null ? void 0 : _b.audioBuffer) {
        sampleBuffer = matchingLayer.sample.audioBuffer;
        layerLevelOffset = matchingLayer.levelOffset;
      }
    }
    if (!sampleBuffer) {
      console.warn(`[DrumPadEngine] Pad ${pad.id} has no sample`);
      return;
    }
    if (pad.reverse) {
      sampleBuffer = this.getReversedBuffer(sampleBuffer);
    }
    if (pad.muteGroup > 0) {
      for (const [otherPadId, otherGroup] of this.muteGroups.entries()) {
        if (otherGroup === pad.muteGroup && otherPadId !== pad.id) {
          this.stopPad(otherPadId);
        }
      }
    }
    this.stopPad(pad.id);
    if (this.voices.size >= DrumPadEngine.MAX_VOICES) {
      this.stealOldestVoice();
    }
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    const filterNode = this.context.createBiquadFilter();
    const panNode = this.context.createStereoPanner();
    source.buffer = sampleBuffer;
    const veloFactor = velocity / 127;
    const inverseVeloFactor = 1 - veloFactor;
    const pitchMod = pad.veloToPitch / 100 * veloFactor * 12;
    const totalTune = pad.tune / 10 + pitchMod;
    source.playbackRate.value = Math.pow(2, totalTune / 12);
    if (pad.filterType !== "off") {
      switch (pad.filterType) {
        case "lpf":
          filterNode.type = "lowpass";
          break;
        case "hpf":
          filterNode.type = "highpass";
          break;
        case "bpf":
          filterNode.type = "bandpass";
          break;
      }
      const veloCutoffMod = pad.veloToFilter / 100 * veloFactor;
      const baseCutoff = pad.cutoff;
      const modulatedCutoff = baseCutoff + veloCutoffMod * (2e4 - baseCutoff);
      filterNode.frequency.value = Math.min(2e4, Math.max(20, modulatedCutoff));
      filterNode.Q.value = pad.resonance / 100 * 20;
      if (pad.filterEnvAmount > 0) {
        const envDepth = pad.filterEnvAmount / 100 * (2e4 - modulatedCutoff);
        const fAttackTime = pad.filterAttack / 100 * 3;
        const fDecayTime = pad.filterDecay / 100 * 2.6;
        const peakCutoff = Math.min(2e4, modulatedCutoff + envDepth);
        filterNode.frequency.setValueAtTime(modulatedCutoff, now);
        filterNode.frequency.linearRampToValueAtTime(peakCutoff, now + fAttackTime);
        filterNode.frequency.exponentialRampToValueAtTime(
          Math.max(20, modulatedCutoff),
          now + fAttackTime + fDecayTime
        );
      }
    }
    panNode.pan.value = pad.pan / 64;
    const veloLevelAmount = pad.veloToLevel / 100;
    const velocityScale = 1 - veloLevelAmount * inverseVeloFactor;
    const levelScale = pad.level / 127;
    const layerScale = layerLevelOffset !== 0 ? Math.pow(10, layerLevelOffset / 20) : 1;
    const targetGain = velocityScale * levelScale * layerScale;
    const baseAttack = pad.attack / 1e3;
    const veloAttackMod = pad.veloToAttack / 100 * inverseVeloFactor;
    const attackTime = baseAttack * (1 + veloAttackMod * 2);
    const decayTime = pad.decay / 1e3;
    const sustainLevel = pad.sustain / 100 * targetGain;
    const releaseTime = pad.release / 1e3;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(targetGain, now + attackTime);
    gainNode.gain.linearRampToValueAtTime(
      sustainLevel,
      now + attackTime + decayTime
    );
    source.connect(filterNode);
    filterNode.connect(panNode);
    panNode.connect(gainNode);
    const outputBus = this.outputs.get(pad.output) || this.masterGain;
    gainNode.connect(outputBus);
    const veloStartMod = pad.veloToStart / 100 * inverseVeloFactor;
    let effectiveStart = pad.sampleStart + veloStartMod * (pad.sampleEnd - pad.sampleStart);
    effectiveStart = Math.min(effectiveStart, pad.sampleEnd - 0.01);
    let startOffset;
    let playDuration;
    if (pad.reverse) {
      startOffset = (1 - pad.sampleEnd) * sampleBuffer.duration;
      playDuration = (pad.sampleEnd - effectiveStart) * sampleBuffer.duration;
    } else {
      startOffset = effectiveStart * sampleBuffer.duration;
      playDuration = (pad.sampleEnd - effectiveStart) * sampleBuffer.duration;
    }
    source.start(now, startOffset, playDuration);
    const duration = playDuration / source.playbackRate.value;
    const cleanupTime = now + duration + releaseTime + 0.1;
    const silentBuffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    const cleanupSource = this.context.createBufferSource();
    cleanupSource.buffer = silentBuffer;
    cleanupSource.connect(this.context.destination);
    cleanupSource.onended = () => {
      this.cleanupVoice(pad.id);
    };
    cleanupSource.start(cleanupTime);
    const voice = {
      source,
      gainNode,
      filterNode,
      panNode,
      startTime: now,
      noteOffTime: null,
      velocity,
      cleanupSource
    };
    this.voices.set(pad.id, voice);
  }
  /**
   * Stop a pad (note off). Optional releaseTime in seconds for sustain mode pads.
   */
  stopPad(padId, releaseTime) {
    const voice = this.voices.get(padId);
    if (!voice || voice.noteOffTime !== null) {
      return;
    }
    const now = this.context.currentTime;
    voice.noteOffTime = now;
    const fadeTime = releaseTime ?? 0.1;
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.linearRampToValueAtTime(0, now + fadeTime);
    const cleanupTime = now + fadeTime + 0.05;
    const silentBuffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    const cleanupSource = this.context.createBufferSource();
    cleanupSource.buffer = silentBuffer;
    cleanupSource.connect(this.context.destination);
    cleanupSource.onended = () => {
      this.cleanupVoice(padId);
    };
    cleanupSource.start(cleanupTime);
  }
  /**
   * Steal the oldest voice when polyphony limit is reached
   */
  stealOldestVoice() {
    if (this.voices.size === 0) return;
    let oldestPadId = null;
    let oldestStartTime = Infinity;
    for (const [padId, voice] of this.voices.entries()) {
      if (voice.startTime < oldestStartTime) {
        oldestStartTime = voice.startTime;
        oldestPadId = padId;
      }
    }
    if (oldestPadId !== null) {
      this.stopPad(oldestPadId);
    }
  }
  /**
   * Clean up voice resources (now race-condition safe)
   */
  cleanupVoice(padId) {
    var _a, _b, _c;
    const voice = this.voices.get(padId);
    if (!voice) {
      return;
    }
    this.voices.delete(padId);
    try {
      (_a = voice.source) == null ? void 0 : _a.stop();
      (_b = voice.source) == null ? void 0 : _b.disconnect();
      voice.gainNode.disconnect();
      voice.filterNode.disconnect();
      voice.panNode.disconnect();
      (_c = voice.cleanupSource) == null ? void 0 : _c.disconnect();
    } catch {
    }
  }
  /**
   * Set master level
   */
  setMasterLevel(level) {
    this.masterGain.gain.value = level / 127;
  }
  /**
   * Set output bus level
   */
  setOutputLevel(bus, level) {
    const output = this.outputs.get(bus);
    if (output) {
      output.gain.value = level / 127;
    }
  }
  /**
   * Stop all voices
   */
  stopAll() {
    const padIds = Array.from(this.voices.keys());
    padIds.forEach((padId) => this.stopPad(padId));
  }
  /**
   * Cleanup and release resources
   */
  dispose() {
    this.stopAll();
    this.masterGain.disconnect();
    this.outputs.forEach((output) => output.disconnect());
    this.outputs.clear();
    this.voices.clear();
  }
}
function rateToInterval(rate, bpm) {
  const beatDuration = 60 / bpm;
  switch (rate) {
    case "1/4":
      return beatDuration;
    case "1/8":
      return beatDuration / 2;
    case "1/16":
      return beatDuration / 4;
    case "1/32":
      return beatDuration / 8;
    case "1/8T":
      return beatDuration / 3;
    // Triplet eighth
    case "1/16T":
      return beatDuration / 6;
  }
}
class NoteRepeatEngine {
  engine;
  activePads = /* @__PURE__ */ new Map();
  rate = "1/16";
  bpm = 125;
  enabled = false;
  constructor(engine) {
    this.engine = engine;
  }
  setRate(rate) {
    this.rate = rate;
    for (const [, state] of this.activePads.entries()) {
      clearInterval(state.timerId);
      const interval = rateToInterval(this.rate, this.bpm);
      state.timerId = setInterval(() => {
        this.engine.triggerPad(state.pad, state.velocity);
      }, interval * 1e3);
    }
  }
  setBpm(bpm) {
    this.bpm = bpm;
    if (this.activePads.size > 0) {
      this.setRate(this.rate);
    }
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }
  /** Start repeating a pad (called when pad is pressed while note repeat is on) */
  startRepeat(pad, velocity) {
    if (!this.enabled) return;
    this.stopRepeat(pad.id);
    const interval = rateToInterval(this.rate, this.bpm);
    const timerId = setInterval(() => {
      this.engine.triggerPad(pad, velocity);
    }, interval * 1e3);
    this.activePads.set(pad.id, { pad, velocity, timerId });
  }
  /** Stop repeating a pad (called on pad release) */
  stopRepeat(padId) {
    const state = this.activePads.get(padId);
    if (state) {
      clearInterval(state.timerId);
      this.activePads.delete(padId);
    }
  }
  /** Stop all repeats */
  stopAll() {
    for (const [, state] of this.activePads) {
      clearInterval(state.timerId);
    }
    this.activePads.clear();
  }
  dispose() {
    this.stopAll();
  }
}
const DRUMNIBUS_ELECTRO_KIT = {
  id: "drumnibus-electro",
  name: "Drumnibus Electro",
  description: "Legowelt synthetic electro drums",
  mappings: [
    { name: "Kick", path: "/data/samples/packs/drumnibus/kicks/BD_808A1200.wav" },
    { name: "Snare", path: "/data/samples/packs/drumnibus/snares/SD_808A1200.wav" },
    { name: "Clap", path: "/data/samples/packs/drumnibus/percussion/CLAP_Magnotron.wav" },
    { name: "Rim", path: "/data/samples/packs/drumnibus/percussion/RIM_Magnotron.wav" },
    { name: "Cl Hat", path: "/data/samples/packs/drumnibus/hihats/CH_Digidap.wav" },
    { name: "Op Hat", path: "/data/samples/packs/drumnibus/hihats/OH_Digidap.wav" },
    { name: "Lo Tom", path: "/data/samples/packs/drumnibus/percussion/TOM_digger.wav" },
    { name: "Mid Tom", path: "/data/samples/packs/drumnibus/percussion/TOM_Juxtapos.wav" },
    { name: "Hi Tom", path: "/data/samples/packs/drumnibus/percussion/TOM_DraconisDS92high.wav" },
    { name: "Crash", path: "/data/samples/packs/drumnibus/hihats/CYM_Magnotron.wav" },
    { name: "Ride", path: "/data/samples/packs/drumnibus/hihats/CYM_Ruflex.wav" },
    { name: "Clave", path: "/data/samples/packs/drumnibus/percussion/CLAVE_Simple.wav" },
    { name: "Cowbell", path: "/data/samples/packs/drumnibus/percussion/COW_Syntique.wav" },
    { name: "Shaker", path: "/data/samples/packs/drumnibus/percussion/SHAKE_AnalogShaker1.wav" },
    { name: "Conga", path: "/data/samples/packs/drumnibus/percussion/CONGA_Syntique.wav" },
    { name: "Tamb", path: "/data/samples/packs/drumnibus/percussion/TAMB_Tamb&Shaker.wav" }
  ]
};
const DRUMNIBUS_808_KIT = {
  id: "drumnibus-808",
  name: "Drumnibus 808",
  description: "Classic 808-style drum sounds",
  mappings: [
    { name: "BD", path: "/data/samples/packs/drumnibus/kicks/BD_808A1200.wav" },
    { name: "SD", path: "/data/samples/packs/drumnibus/snares/SD_808A1200.wav" },
    { name: "LT", path: "/data/samples/packs/drumnibus/percussion/TOM_digger.wav" },
    { name: "MT", path: "/data/samples/packs/drumnibus/percussion/TOM_Juxtapos.wav" },
    { name: "HT", path: "/data/samples/packs/drumnibus/percussion/TOM_DraconisDS92high.wav" },
    { name: "RS", path: "/data/samples/packs/drumnibus/percussion/RIM_Magnotron.wav" },
    { name: "CP", path: "/data/samples/packs/drumnibus/percussion/CLAP_Magnotron.wav" },
    { name: "CH", path: "/data/samples/packs/drumnibus/hihats/CH_Digidap.wav" },
    { name: "OH", path: "/data/samples/packs/drumnibus/hihats/OH_Digidap.wav" },
    { name: "CY", path: "/data/samples/packs/drumnibus/hihats/CYM_Magnotron.wav" },
    { name: "CB", path: "/data/samples/packs/drumnibus/percussion/COW_Syntique.wav" },
    { name: "CL", path: "/data/samples/packs/drumnibus/percussion/CLAVE_Simple.wav" },
    { name: "MA", path: "/data/samples/packs/drumnibus/percussion/SHAKE_AnalogShaker1.wav" },
    { name: "Conga Lo", path: "/data/samples/packs/drumnibus/percussion/CONGA_Syntique.wav" },
    { name: "Conga Hi", path: "/data/samples/packs/drumnibus/percussion/CONGA_Syntique.wav" },
    { name: "Accent", path: "/data/samples/packs/drumnibus/percussion/TAMB_Tamb&Shaker.wav" }
  ]
};
const SCRATCH_ORIGINALS_KIT = {
  id: "scratch-originals-kit",
  name: "Scratch Originals",
  description: "Phase scratch sounds — DJ scratch sample pack",
  mappings: [
    { name: "Scratch 01", path: "/data/samples/packs/scratch-originals/scratch_001.wav" },
    { name: "Scratch 02", path: "/data/samples/packs/scratch-originals/scratch_002.wav" },
    { name: "Scratch 03", path: "/data/samples/packs/scratch-originals/scratch_003.wav" },
    { name: "Scratch 04", path: "/data/samples/packs/scratch-originals/scratch_004.wav" },
    { name: "Scratch 05", path: "/data/samples/packs/scratch-originals/scratch_005.wav" },
    { name: "Scratch 06", path: "/data/samples/packs/scratch-originals/scratch_006.wav" },
    { name: "Scratch 07", path: "/data/samples/packs/scratch-originals/scratch_007.wav" },
    { name: "Scratch 08", path: "/data/samples/packs/scratch-originals/scratch_008.wav" },
    { name: "Scratch 09", path: "/data/samples/packs/scratch-originals/scratch_009.wav" },
    { name: "Scratch 10", path: "/data/samples/packs/scratch-originals/scratch_010.wav" },
    { name: "Scratch 11", path: "/data/samples/packs/scratch-originals/scratch_011.wav" },
    { name: "Scratch 12", path: "/data/samples/packs/scratch-originals/scratch_012.wav" },
    { name: "Scratch 13", path: "/data/samples/packs/scratch-originals/scratch_013.wav" },
    { name: "Scratch 14", path: "/data/samples/packs/scratch-originals/scratch_014.wav" },
    { name: "Scratch 15", path: "/data/samples/packs/scratch-originals/scratch_015.wav" },
    { name: "Scratch 16", path: "/data/samples/packs/scratch-originals/scratch_016.wav" }
  ]
};
const AVAILABLE_KIT_PRESETS = [
  DRUMNIBUS_ELECTRO_KIT,
  DRUMNIBUS_808_KIT,
  SCRATCH_ORIGINALS_KIT
];
function getKitPreset(kitId) {
  return AVAILABLE_KIT_PRESETS.find((kit) => kit.id === kitId);
}
function getPresetKitSources() {
  return AVAILABLE_KIT_PRESETS.map((preset) => ({
    type: "preset",
    id: preset.id,
    name: preset.name,
    description: preset.description
  }));
}
function getSamplePackKitSources(samplePacks) {
  return samplePacks.map((pack) => ({
    type: "samplepack",
    id: pack.id,
    name: pack.name,
    description: pack.description
  }));
}
function getAllKitSources(samplePacks) {
  return [
    ...getPresetKitSources(),
    ...getSamplePackKitSources(samplePacks)
  ];
}
function createInstrumentFromSample(name, url) {
  return {
    name,
    type: "sample",
    synthType: "Sampler",
    sample: {
      url,
      baseNote: "C4",
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1
    },
    effects: [],
    volume: -6,
    pan: 0
  };
}
function createInstrumentsFromPreset(kitId) {
  const kit = getKitPreset(kitId);
  if (!kit) {
    throw new Error(`Kit preset not found: ${kitId}`);
  }
  return kit.mappings.map((mapping) => ({
    name: mapping.name,
    url: mapping.path
  }));
}
function createInstrumentsFromSamplePack(samplePack, maxSamples = 16) {
  const result = [];
  const categoryPriority = [
    "kicks",
    "snares",
    "hihats",
    "claps",
    "percussion",
    "fx",
    "bass",
    "leads",
    "pads",
    "loops",
    "vocals",
    "other"
  ];
  for (const category of categoryPriority) {
    if (result.length >= maxSamples) break;
    const samples = samplePack.samples[category] || [];
    for (const sample of samples) {
      if (result.length >= maxSamples) break;
      result.push({
        name: sample.name,
        url: sample.url
      });
    }
  }
  return result;
}
function loadKitSource(source, samplePacks, createInstrument) {
  const createdIds = [];
  let samples = [];
  if (source.type === "preset") {
    samples = createInstrumentsFromPreset(source.id);
  } else if (source.type === "samplepack") {
    const pack = samplePacks.find((p) => p.id === source.id);
    if (!pack) {
      throw new Error(`Sample pack not found: ${source.id}`);
    }
    samples = createInstrumentsFromSamplePack(pack);
  }
  for (const sample of samples) {
    const instrumentConfig = createInstrumentFromSample(sample.name, sample.url);
    const newId = createInstrument(instrumentConfig);
    createdIds.push(newId);
  }
  console.log(`[KitLoader] Created ${createdIds.length} instruments from ${source.type}: ${source.name}`);
  return createdIds;
}
export {
  DrumPadEngine as D,
  NoteRepeatEngine as N,
  createInstrumentsFromSamplePack as a,
  createInstrumentsFromPreset as c,
  getAllKitSources as g,
  loadKitSource as l
};
