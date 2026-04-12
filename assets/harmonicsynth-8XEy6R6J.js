import { bO as getDevilboxAudioContext, dp as audioNow, dq as noteToFrequency, dr as noteToMidi, aT as SynthRegistry, cG as DEFAULT_HARMONIC_SYNTH } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const NUM_HARMONICS = 32;
class HarmonicSynth {
  name = "HarmonicSynth";
  output;
  config;
  audioContext;
  filter;
  masterGain;
  lfo;
  lfoGain;
  voices = /* @__PURE__ */ new Map();
  voiceOrder = [];
  currentWave;
  constructor(config) {
    this.config = { ...config, harmonics: [...config.harmonics] };
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this.output.gain.value = 1;
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.7;
    this.filter = this.audioContext.createBiquadFilter();
    this.filter.type = config.filter.type;
    this.filter.frequency.value = config.filter.cutoff;
    this.filter.Q.value = config.filter.resonance;
    this.lfo = this.audioContext.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = config.lfo.rate;
    this.lfoGain = this.audioContext.createGain();
    this.lfoGain.gain.value = 0;
    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.output);
    this.lfo.connect(this.lfoGain);
    this.lfo.start();
    this.connectLFO();
    this.currentWave = this.buildPeriodicWave();
  }
  /**
   * Build a PeriodicWave from harmonics + spectralTilt + evenOddBalance
   */
  buildPeriodicWave() {
    const real = new Float32Array(NUM_HARMONICS + 1);
    const imag = new Float32Array(NUM_HARMONICS + 1);
    real[0] = 0;
    imag[0] = 0;
    const tilt = this.config.spectralTilt / 100;
    const eoBalance = this.config.evenOddBalance / 100;
    for (let i = 1; i <= NUM_HARMONICS; i++) {
      let amp = this.config.harmonics[i - 1] || 0;
      if (tilt !== 0) {
        amp *= Math.pow(i, -tilt);
      }
      const isEven = i % 2 === 0;
      if (eoBalance > 0 && !isEven) {
        amp *= 1 - eoBalance;
      } else if (eoBalance < 0 && isEven) {
        amp *= 1 + eoBalance;
      }
      imag[i] = amp;
    }
    return this.audioContext.createPeriodicWave(real, imag, { disableNormalization: false });
  }
  /**
   * Connect LFO to the appropriate target
   */
  connectLFO() {
    try {
      this.lfoGain.disconnect();
    } catch {
    }
    const depth = this.config.lfo.depth / 100;
    switch (this.config.lfo.target) {
      case "pitch":
        this.lfoGain.gain.value = depth * 50;
        break;
      case "filter":
        this.lfoGain.gain.value = depth * 2e3;
        this.lfoGain.connect(this.filter.frequency);
        break;
    }
  }
  triggerAttack(note, time, velocity = 1) {
    const now = time ?? audioNow();
    const freq = typeof note === "string" ? noteToFrequency(note) : note;
    const midiNote = typeof note === "string" ? noteToMidi(note) : Math.round(69 + 12 * Math.log2(note / 440));
    const existing = this.voices.get(midiNote);
    if (existing) {
      this.killVoice(existing);
      this.voices.delete(midiNote);
      this.voiceOrder = this.voiceOrder.filter((n) => n !== midiNote);
    }
    const maxVoices = this.config.maxVoices || 6;
    while (this.voices.size >= maxVoices && this.voiceOrder.length > 0) {
      const oldestNote = this.voiceOrder.shift();
      const oldVoice = this.voices.get(oldestNote);
      if (oldVoice) {
        this.killVoice(oldVoice);
        this.voices.delete(oldestNote);
      }
    }
    const osc = this.audioContext.createOscillator();
    osc.setPeriodicWave(this.currentWave);
    osc.frequency.setValueAtTime(freq, now);
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0, now);
    osc.connect(gain);
    gain.connect(this.filter);
    if (this.config.lfo.target === "pitch" && this.config.lfo.depth > 0) {
      this.lfoGain.connect(osc.detune);
    }
    osc.start(now);
    const env = this.config.envelope;
    const attackTime = env.attack / 1e3;
    const decayTime = env.decay / 1e3;
    const sustainLevel = env.sustain / 100 * velocity;
    gain.gain.linearRampToValueAtTime(velocity, now + attackTime);
    gain.gain.linearRampToValueAtTime(sustainLevel, now + attackTime + decayTime);
    const voice = { osc, gain, midiNote };
    this.voices.set(midiNote, voice);
    this.voiceOrder.push(midiNote);
  }
  triggerRelease(note, time) {
    const now = time ?? audioNow();
    if (note === void 0) {
      for (const voice2 of this.voices.values()) {
        this.scheduleRelease(voice2, now);
      }
      return;
    }
    const midiNote = typeof note === "string" ? noteToMidi(note) : typeof note === "number" && note < 128 ? note : Math.round(69 + 12 * Math.log2(note / 440));
    const voice = this.voices.get(midiNote);
    if (voice) {
      this.scheduleRelease(voice, now);
    }
  }
  /**
   * Release all active voices (panic button, song stop, etc.)
   */
  releaseAll() {
    this.triggerRelease();
  }
  triggerAttackRelease(note, duration, time, velocity) {
    const now = time ?? audioNow();
    this.triggerAttack(note, now, velocity);
    this.triggerRelease(note, now + duration);
  }
  scheduleRelease(voice, time) {
    const releaseTime = this.config.envelope.release / 1e3;
    voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, time);
    voice.gain.gain.linearRampToValueAtTime(0, time + releaseTime);
    const cleanupDelay = (releaseTime + 0.05) * 1e3;
    voice.releaseTimeout = setTimeout(() => {
      this.killVoice(voice);
      this.voices.delete(voice.midiNote);
      this.voiceOrder = this.voiceOrder.filter((n) => n !== voice.midiNote);
    }, cleanupDelay);
  }
  killVoice(voice) {
    if (voice.releaseTimeout) clearTimeout(voice.releaseTimeout);
    try {
      voice.osc.stop();
    } catch {
    }
    try {
      voice.osc.disconnect();
    } catch {
    }
    try {
      voice.gain.disconnect();
    } catch {
    }
  }
  set(param, value) {
    let needsRebuild = false;
    if (param.startsWith("harmonic_")) {
      const idx = parseInt(param.split("_")[1], 10);
      if (idx >= 0 && idx < NUM_HARMONICS) {
        this.config.harmonics[idx] = value;
        needsRebuild = true;
      }
    } else if (param === "spectralTilt") {
      this.config.spectralTilt = value;
      needsRebuild = true;
    } else if (param === "evenOddBalance") {
      this.config.evenOddBalance = value;
      needsRebuild = true;
    } else if (param === "filterCutoff") {
      this.config.filter.cutoff = value;
      this.filter.frequency.value = value;
    } else if (param === "filterResonance") {
      this.config.filter.resonance = value;
      this.filter.Q.value = value;
    } else if (param === "filterType") {
      const types = ["lowpass", "highpass", "bandpass"];
      this.config.filter.type = types[value] || "lowpass";
      this.filter.type = this.config.filter.type;
    } else if (param === "attack") {
      this.config.envelope.attack = value;
    } else if (param === "decay") {
      this.config.envelope.decay = value;
    } else if (param === "sustain") {
      this.config.envelope.sustain = value;
    } else if (param === "release") {
      this.config.envelope.release = value;
    } else if (param === "lfoRate") {
      this.config.lfo.rate = value;
      this.lfo.frequency.value = value;
    } else if (param === "lfoDepth") {
      this.config.lfo.depth = value;
      this.connectLFO();
    } else if (param === "lfoTarget") {
      const targets = ["pitch", "filter", "spectral"];
      this.config.lfo.target = targets[value] || "pitch";
      this.connectLFO();
    }
    if (needsRebuild) {
      this.currentWave = this.buildPeriodicWave();
      for (const voice of this.voices.values()) {
        voice.osc.setPeriodicWave(this.currentWave);
      }
    }
  }
  get(param) {
    if (param.startsWith("harmonic_")) {
      const idx = parseInt(param.split("_")[1], 10);
      return this.config.harmonics[idx];
    }
    switch (param) {
      case "spectralTilt":
        return this.config.spectralTilt;
      case "evenOddBalance":
        return this.config.evenOddBalance;
      case "filterCutoff":
        return this.config.filter.cutoff;
      case "filterResonance":
        return this.config.filter.resonance;
      case "attack":
        return this.config.envelope.attack;
      case "decay":
        return this.config.envelope.decay;
      case "sustain":
        return this.config.envelope.sustain;
      case "release":
        return this.config.envelope.release;
      case "lfoRate":
        return this.config.lfo.rate;
      case "lfoDepth":
        return this.config.lfo.depth;
      default:
        return void 0;
    }
  }
  /**
   * Set all harmonics at once (for preset changes)
   */
  setHarmonics(harmonics) {
    for (let i = 0; i < NUM_HARMONICS; i++) {
      this.config.harmonics[i] = harmonics[i] || 0;
    }
    this.currentWave = this.buildPeriodicWave();
    for (const voice of this.voices.values()) {
      voice.osc.setPeriodicWave(this.currentWave);
    }
  }
  /**
   * Apply configuration changes from the UI (called by ToneEngine)
   */
  applyConfig(updates) {
    let needsRebuild = false;
    if (updates.harmonics) {
      for (let i = 0; i < NUM_HARMONICS; i++) {
        this.config.harmonics[i] = updates.harmonics[i] ?? this.config.harmonics[i];
      }
      needsRebuild = true;
    }
    if (updates.spectralTilt !== void 0) {
      this.config.spectralTilt = updates.spectralTilt;
      needsRebuild = true;
    }
    if (updates.evenOddBalance !== void 0) {
      this.config.evenOddBalance = updates.evenOddBalance;
      needsRebuild = true;
    }
    if (updates.filter) {
      if (updates.filter.type !== void 0) {
        this.config.filter.type = updates.filter.type;
        this.filter.type = updates.filter.type;
      }
      if (updates.filter.cutoff !== void 0) {
        this.config.filter.cutoff = updates.filter.cutoff;
        this.filter.frequency.value = updates.filter.cutoff;
      }
      if (updates.filter.resonance !== void 0) {
        this.config.filter.resonance = updates.filter.resonance;
        this.filter.Q.value = updates.filter.resonance;
      }
    }
    if (updates.envelope) {
      if (updates.envelope.attack !== void 0) {
        this.config.envelope.attack = updates.envelope.attack;
      }
      if (updates.envelope.decay !== void 0) {
        this.config.envelope.decay = updates.envelope.decay;
      }
      if (updates.envelope.sustain !== void 0) {
        this.config.envelope.sustain = updates.envelope.sustain;
      }
      if (updates.envelope.release !== void 0) {
        this.config.envelope.release = updates.envelope.release;
      }
    }
    if (updates.lfo) {
      let reconnectLFO = false;
      if (updates.lfo.target !== void 0) {
        this.config.lfo.target = updates.lfo.target;
        reconnectLFO = true;
      }
      if (updates.lfo.rate !== void 0) {
        this.config.lfo.rate = updates.lfo.rate;
        this.lfo.frequency.value = updates.lfo.rate;
      }
      if (updates.lfo.depth !== void 0) {
        this.config.lfo.depth = updates.lfo.depth;
        reconnectLFO = true;
      }
      if (reconnectLFO) {
        this.connectLFO();
      }
    }
    if (needsRebuild) {
      this.currentWave = this.buildPeriodicWave();
      for (const voice of this.voices.values()) {
        voice.osc.setPeriodicWave(this.currentWave);
      }
    }
  }
  dispose() {
    for (const voice of this.voices.values()) {
      this.killVoice(voice);
    }
    this.voices.clear();
    this.voiceOrder = [];
    try {
      this.lfo.stop();
    } catch {
    }
    try {
      this.lfo.disconnect();
    } catch {
    }
    try {
      this.lfoGain.disconnect();
    } catch {
    }
    try {
      this.filter.disconnect();
    } catch {
    }
    try {
      this.masterGain.disconnect();
    } catch {
    }
  }
}
const descriptor = {
  id: "HarmonicSynth",
  name: "Harmonic Synth",
  category: "native",
  loadMode: "lazy",
  create: (config) => {
    const harmonicConfig = config.harmonicSynth || DEFAULT_HARMONIC_SYNTH;
    return new HarmonicSynth(harmonicConfig);
  },
  volumeOffsetDb: 5,
  useSynthBus: true,
  controlsComponent: "HarmonicSynthControls"
};
SynthRegistry.register(descriptor);
