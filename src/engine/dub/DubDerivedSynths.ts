/**
 * Dub-derived standalone synths — extracted from `DubBus.startXxx(...)`
 * so the same voices are pickable as normal instruments in the synth
 * registry. The DSP mirrors the bus implementation byte-for-byte where
 * possible; the difference is they own their own output (not bus.return_)
 * so a user can put them on any channel and have the channel's insert
 * effects process their output.
 *
 * Five voices here:
 *   - OscBassSynth       — pitched, hold. Self-oscillating LPF bass.
 *   - CrushBassSynth     — pitched, hold. 3-bit quantize-distortion bass.
 *   - SonarPingSynth     — unpitched, trigger. 1 kHz sine burst.
 *   - RadioRiserSynth    — unpitched, trigger. Bandpass-swept pink noise riser.
 *   - SubSwellSynth      — pitched, trigger. Short sine swell (55 Hz default).
 *
 * All share the `DevilboxSynth` shape: `output: AudioNode`, `name`,
 * `dispose()`, plus `triggerAttack/triggerRelease/triggerAttackRelease`
 * as appropriate.
 */

import type {
  OscBassConfig, CrushBassConfig, SonarPingConfig, RadioRiserConfig, SubSwellConfig,
} from '@/types/instrument';
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, audioNow, noteToFrequency } from '@/utils/audio-context';

function resolveFreq(note: string | number | undefined, fallback: number): number {
  if (note === undefined || note === null) return fallback;
  const f = noteToFrequency(note);
  return Number.isFinite(f) && f > 0 ? f : fallback;
}

// ─── OscBass ─────────────────────────────────────────────────────────────────
export class OscBassSynth implements DevilboxSynth {
  readonly name = 'OscBassSynth';
  readonly output: GainNode;
  readonly ready = Promise.resolve();
  private cfg: OscBassConfig;
  private ctx: AudioContext;
  private env: GainNode;
  private volNode: GainNode;
  private active: { osc: OscillatorNode; filt: BiquadFilterNode; softClip: WaveShaperNode } | null = null;

  constructor(cfg: OscBassConfig) {
    this.cfg = { ...cfg };
    this.ctx = getDevilboxAudioContext();
    this.env = this.ctx.createGain();
    this.env.gain.value = 0;
    this.volNode = this.ctx.createGain();
    this.volNode.gain.value = 1;
    this.env.connect(this.volNode);
    this.output = this.volNode;
  }

  triggerAttack(note?: string | number, time?: number, _velocity?: number) {
    // Hold-style synth: a second attack replaces the first voice.
    if (this.active) this.forceStop();
    const t = time ?? audioNow();
    const freq = resolveFreq(note, 55);
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = Math.max(20, Math.min(250, freq));
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = osc.frequency.value;
    filt.Q.value = Math.max(1, Math.min(30, this.cfg.resonance));
    // Soft-clip tanh curve — tames the Q=18 resonance ringing.
    const softClip = this.ctx.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = 0.4 * Math.tanh(x * 2.5);
    }
    softClip.curve = curve;
    softClip.oversample = '2x';
    osc.connect(filt);
    filt.connect(softClip);
    softClip.connect(this.env);
    const peak = Math.max(0, Math.min(0.9, this.cfg.level));
    const atk = Math.max(0.001, this.cfg.attackMs / 1000);
    this.env.gain.cancelScheduledValues(t);
    this.env.gain.setValueAtTime(0, t);
    this.env.gain.linearRampToValueAtTime(peak, t + atk);
    osc.start(t);
    this.active = { osc, filt, softClip };
  }

  triggerRelease(_note?: string | number, time?: number) {
    if (!this.active) return;
    const t = time ?? audioNow();
    const { osc, filt, softClip } = this.active;
    const rel = Math.max(0.01, this.cfg.releaseMs / 1000);
    try {
      this.env.gain.cancelScheduledValues(t);
      this.env.gain.setValueAtTime(this.env.gain.value, t);
      this.env.gain.linearRampToValueAtTime(0, t + rel);
    } catch { /* ok */ }
    const stopAt = t + rel + 0.05;
    setTimeout(() => {
      try { osc.stop(); osc.disconnect(); filt.disconnect(); softClip.disconnect(); } catch { /* ok */ }
    }, Math.max(50, (stopAt - this.ctx.currentTime) * 1000));
    this.active = null;
  }

  releaseAll() { this.triggerRelease(); }

  private forceStop() {
    if (!this.active) return;
    const { osc, filt, softClip } = this.active;
    try { osc.stop(); osc.disconnect(); filt.disconnect(); softClip.disconnect(); } catch { /* ok */ }
    this.active = null;
  }

  dispose() {
    this.forceStop();
    this.env.disconnect();
    this.volNode.disconnect();
  }

  get volume() { return this.volNode.gain; }
}

// ─── CrushBass ───────────────────────────────────────────────────────────────
export class CrushBassSynth implements DevilboxSynth {
  readonly name = 'CrushBassSynth';
  readonly output: GainNode;
  readonly ready = Promise.resolve();
  private cfg: CrushBassConfig;
  private ctx: AudioContext;
  private env: GainNode;
  private volNode: GainNode;
  private active: { osc: OscillatorNode; shaper: WaveShaperNode; lp: BiquadFilterNode } | null = null;

  constructor(cfg: CrushBassConfig) {
    this.cfg = { ...cfg };
    this.ctx = getDevilboxAudioContext();
    this.env = this.ctx.createGain();
    this.env.gain.value = 0;
    this.volNode = this.ctx.createGain();
    this.volNode.gain.value = 1;
    this.env.connect(this.volNode);
    this.output = this.volNode;
  }

  triggerAttack(note?: string | number, time?: number, _velocity?: number) {
    if (this.active) this.forceStop();
    const t = time ?? audioNow();
    const freq = resolveFreq(note, 55);
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = Math.max(20, Math.min(250, freq));
    // Bit-crush via quantize waveshaper — N steps across [-1, 1].
    const steps = Math.pow(2, Math.max(1, Math.min(8, Math.round(this.cfg.bits))));
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.round(x * (steps / 2)) / (steps / 2);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(300, Math.min(8000, this.cfg.lpHz));
    lp.Q.value = 0.7;
    osc.connect(shaper);
    shaper.connect(lp);
    lp.connect(this.env);
    const peak = Math.max(0, Math.min(0.9, this.cfg.level));
    const atk = Math.max(0.001, this.cfg.attackMs / 1000);
    this.env.gain.cancelScheduledValues(t);
    this.env.gain.setValueAtTime(0, t);
    this.env.gain.linearRampToValueAtTime(peak, t + atk);
    osc.start(t);
    this.active = { osc, shaper, lp };
  }

  triggerRelease(_note?: string | number, time?: number) {
    if (!this.active) return;
    const t = time ?? audioNow();
    const { osc, shaper, lp } = this.active;
    const rel = Math.max(0.01, this.cfg.releaseMs / 1000);
    try {
      this.env.gain.cancelScheduledValues(t);
      this.env.gain.setValueAtTime(this.env.gain.value, t);
      this.env.gain.linearRampToValueAtTime(0, t + rel);
    } catch { /* ok */ }
    setTimeout(() => {
      try { osc.stop(); osc.disconnect(); shaper.disconnect(); lp.disconnect(); } catch { /* ok */ }
    }, Math.max(50, rel * 1000 + 50));
    this.active = null;
  }

  releaseAll() { this.triggerRelease(); }

  private forceStop() {
    if (!this.active) return;
    const { osc, shaper, lp } = this.active;
    try { osc.stop(); osc.disconnect(); shaper.disconnect(); lp.disconnect(); } catch { /* ok */ }
    this.active = null;
  }

  dispose() {
    this.forceStop();
    this.env.disconnect();
    this.volNode.disconnect();
  }

  get volume() { return this.volNode.gain; }
}

// ─── SonarPing ───────────────────────────────────────────────────────────────
// Trigger-only: each triggerAttack fires a fire-and-forget sine burst.
// Note input sets the ping pitch (default 1000 Hz).
export class SonarPingSynth implements DevilboxSynth {
  readonly name = 'SonarPingSynth';
  readonly output: GainNode;
  readonly ready = Promise.resolve();
  private cfg: SonarPingConfig;
  private ctx: AudioContext;
  private volNode: GainNode;

  constructor(cfg: SonarPingConfig) {
    this.cfg = { ...cfg };
    this.ctx = getDevilboxAudioContext();
    this.volNode = this.ctx.createGain();
    this.volNode.gain.value = 1;
    this.output = this.volNode;
  }

  triggerAttack(note?: string | number, time?: number, _velocity?: number) {
    const t = time ?? audioNow();
    const freq = resolveFreq(note, 1000);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(this.volNode);
    const dur = Math.max(0.02, this.cfg.durationMs / 1000);
    const peak = Math.max(0, Math.min(1, this.cfg.level));
    const decay = Math.max(0.02, Math.min(0.95, this.cfg.decayRatio));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * decay), t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    setTimeout(() => {
      try { osc.disconnect(); g.disconnect(); } catch { /* ok */ }
    }, (dur + 0.1) * 1000);
  }

  triggerRelease() { /* trigger-only, no-op */ }
  releaseAll() { /* trigger-only, no-op */ }

  triggerAttackRelease(note: string | number, _duration: number, time?: number, velocity?: number) {
    this.triggerAttack(note, time, velocity);
  }

  dispose() {
    this.volNode.disconnect();
  }

  get volume() { return this.volNode.gain; }
}

// ─── RadioRiser ──────────────────────────────────────────────────────────────
// Trigger-only. Bandpass-swept pink noise over sweepSec.
export class RadioRiserSynth implements DevilboxSynth {
  readonly name = 'RadioRiserSynth';
  readonly output: GainNode;
  readonly ready = Promise.resolve();
  private cfg: RadioRiserConfig;
  private ctx: AudioContext;
  private volNode: GainNode;
  private noiseBuf: AudioBuffer | null = null;

  constructor(cfg: RadioRiserConfig) {
    this.cfg = { ...cfg };
    this.ctx = getDevilboxAudioContext();
    this.volNode = this.ctx.createGain();
    this.volNode.gain.value = 1;
    this.output = this.volNode;
  }

  private getNoiseBuffer(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    // 2-second pink-ish noise buffer; re-used across fires.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Paul Kellett pink noise approximation.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    this.noiseBuf = buf;
    return buf;
  }

  triggerAttack(_note?: string | number, time?: number, _velocity?: number) {
    const t = time ?? audioNow();
    const src = this.ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = Math.max(1, Math.min(20, this.cfg.bandwidth));
    bp.frequency.value = Math.max(20, this.cfg.startHz);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.volNode);
    const sweep = Math.max(0.05, this.cfg.sweepSec);
    const peak = Math.max(0, Math.min(1, this.cfg.level));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.05, sweep * 0.2));
    g.gain.setValueAtTime(peak, t + sweep * 0.85);
    g.gain.linearRampToValueAtTime(0, t + sweep);
    bp.frequency.setValueAtTime(Math.max(20, this.cfg.startHz), t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(21, this.cfg.endHz), t + sweep);
    src.start(t);
    src.stop(t + sweep + 0.05);
    setTimeout(() => {
      try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch { /* ok */ }
    }, (sweep + 0.1) * 1000);
  }

  triggerRelease() { /* trigger-only, no-op */ }
  releaseAll() { /* trigger-only, no-op */ }

  triggerAttackRelease(note: string | number, _duration: number, time?: number, velocity?: number) {
    this.triggerAttack(note, time, velocity);
  }

  dispose() {
    this.volNode.disconnect();
    this.noiseBuf = null;
  }

  get volume() { return this.volNode.gain; }
}

// ─── SubSwell ────────────────────────────────────────────────────────────────
// Trigger-only. Short sine swell; note sets pitch, shifted down by pitchOctaves.
export class SubSwellSynth implements DevilboxSynth {
  readonly name = 'SubSwellSynth';
  readonly output: GainNode;
  readonly ready = Promise.resolve();
  private cfg: SubSwellConfig;
  private ctx: AudioContext;
  private volNode: GainNode;

  constructor(cfg: SubSwellConfig) {
    this.cfg = { ...cfg };
    this.ctx = getDevilboxAudioContext();
    this.volNode = this.ctx.createGain();
    this.volNode.gain.value = 1;
    this.output = this.volNode;
  }

  triggerAttack(note?: string | number, time?: number, _velocity?: number) {
    const t = time ?? audioNow();
    // Note → freq, then shift down by pitchOctaves. `note === undefined` uses 55 Hz default.
    const baseFreq = resolveFreq(note, 55);
    const shifted = baseFreq / Math.pow(2, Math.max(0, this.cfg.pitchOctaves));
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = Math.max(20, Math.min(400, shifted));
    const g = this.ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(this.volNode);
    const dur = Math.max(0.05, this.cfg.durationMs / 1000);
    const peak = Math.max(0, Math.min(1, this.cfg.level));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.04, dur * 0.3));
    g.gain.setValueAtTime(peak, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    setTimeout(() => {
      try { osc.disconnect(); g.disconnect(); } catch { /* ok */ }
    }, (dur + 0.1) * 1000);
  }

  triggerRelease() { /* trigger-only, no-op */ }
  releaseAll() { /* trigger-only, no-op */ }

  triggerAttackRelease(note: string | number, _duration: number, time?: number, velocity?: number) {
    this.triggerAttack(note, time, velocity);
  }

  dispose() {
    this.volNode.disconnect();
  }

  get volume() { return this.volNode.gain; }
}
