/**
 * IO808Synth — Pure Web Audio TR-808 drum machine synth engine.
 *
 * 1:1 TypeScript port of https://github.com/vincentriemer/io-808
 * MIT License — Copyright (c) 2016 Vincent Riemer
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type IO808DrumType =
  | 'kick' | 'snare' | 'closedHat' | 'openHat'
  | 'clap' | 'rimshot' | 'clave' | 'cowbell'
  | 'cymbal' | 'maracas'
  | 'tomLow' | 'tomMid' | 'tomHigh'
  | 'congaLow' | 'congaMid' | 'congaHigh';

export interface IO808Params {
  level?: number;   // 0-100
  tone?: number;    // 0-100
  decay?: number;   // 0-100
  snappy?: number;  // 0-100
  tuning?: number;  // 0-100
  /** Frequency multiplier for pitch shifting (1.0 = normal, 2.0 = octave up) */
  pitchMultiplier?: number;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

export function equalPower(input: number): number {
  const output = Math.cos((1.0 - input / 100) * 0.5 * Math.PI);
  return Math.round(output * 100) / 100;
}

// ─── Connectable interface ───────────────────────────────────────────────────

interface Connectable {
  input?: AudioNode;
  output?: AudioNode;
}

function connectTo(source: AudioNode, target: AudioNode | Connectable): void {
  if ((target as Connectable).input) {
    source.connect((target as Connectable).input!);
  } else {
    source.connect(target as AudioNode);
  }
}

// ─── Effects ─────────────────────────────────────────────────────────────────

const softClippingCurve = (() => {
  const n = 65536;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i - n / 2) / (n / 2);
    curve[i] = Math.tanh(x);
  }
  return curve;
})();

const halfWaveRectifierCurve = (() => {
  const curve = new Float32Array(65536);
  for (let i = 0; i < 32768; i++) curve[i] = 0.0;
  for (let i = 32768; i < 65536; i++) curve[i] = i / 32768 - 1;
  return curve;
})();

class SoftClipper {
  input: GainNode;
  output: WaveShaperNode;
  private gain: VCA;
  private waveshaper: WaveShaperNode;

  constructor(drive: number, audioCtx: AudioContext) {
    this.gain = new VCA(audioCtx);
    this.gain.amplitude.value = drive;
    this.waveshaper = audioCtx.createWaveShaper();
    this.waveshaper.curve = softClippingCurve;
    this.waveshaper.oversample = '2x';
    this.gain.output.connect(this.waveshaper);
    this.input = this.gain.input;
    this.output = this.waveshaper;
  }

  connect(node: AudioNode | Connectable): void {
    connectTo(this.output, node);
  }
}

class HalfWaveRectifier {
  input: WaveShaperNode;
  output: WaveShaperNode;
  private waveshaper: WaveShaperNode;

  constructor(audioCtx: AudioContext) {
    this.waveshaper = audioCtx.createWaveShaper();
    this.waveshaper.curve = halfWaveRectifierCurve;
    this.input = this.waveshaper;
    this.output = this.waveshaper;
  }

  connect(node: AudioNode | Connectable): void {
    connectTo(this.output, node);
  }
}

/** Brick-wall limiter — not used by stock drum modules but available for signal chains. */
export class Limiter {
  input: DynamicsCompressorNode;
  output: DynamicsCompressorNode;

  constructor(audioCtx: AudioContext) {
    const limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = 0.0;
    limiter.knee.value = 0.0;
    limiter.ratio.value = 20.0;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.005;
    this.input = limiter;
    this.output = limiter;
  }

  connect(node: AudioNode | Connectable): void {
    connectTo(this.output, node);
  }
}

// ─── Basics ──────────────────────────────────────────────────────────────────

type ADType = 'linear' | 'exponential';

class ADGenerator {
  private type: ADType;
  private attack: number;
  private decay: number;
  private start: number;
  private amount: number;
  private param!: AudioParam;

  constructor(type: ADType, attack: number, decay: number, start: number, amount: number) {
    this.type = type;
    this.attack = attack;
    this.decay = decay;
    this.start = start;
    this.amount = amount;
  }

  trigger(time: number): void {
    this.param.cancelScheduledValues(0);
    this.param.linearRampToValueAtTime(this.start, time);
    const attackTime = time + this.attack / 1000;
    const decayTime = attackTime + this.decay / 1000;
    this.param.linearRampToValueAtTime(this.start + this.amount, attackTime);
    switch (this.type) {
      case 'linear':
        this.param.linearRampToValueAtTime(this.start, decayTime);
        break;
      case 'exponential':
        this.param.exponentialRampToValueAtTime(0.0001 + this.start, decayTime);
        break;
    }
  }

  connect(param: AudioParam): void {
    this.param = param;
  }
}

type VCOType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'whitenoise' | 'pinknoise';

function createWhiteNoiseOsc(audioCtx: AudioContext): AudioBufferSourceNode {
  const buffer = audioCtx.createBuffer(1, 44100, 44100);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 2;
  const source = audioCtx.createBufferSource();
  source.loop = true;
  source.buffer = buffer;
  return source;
}

function createPinkNoiseOsc(audioCtx: AudioContext): AudioBufferSourceNode {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  const buffer = audioCtx.createBuffer(1, 44100, 44100);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    data[i] *= 0.11;
    b6 = white * 0.115926;
  }
  const source = audioCtx.createBufferSource();
  source.loop = true;
  source.buffer = buffer;
  return source;
}

class VCO {
  output: AudioNode;
  frequency: AudioParam;
  private osc: OscillatorNode | AudioBufferSourceNode;

  constructor(type: VCOType, audioCtx: AudioContext) {
    if (type === 'whitenoise') {
      this.osc = createWhiteNoiseOsc(audioCtx);
      this.output = this.osc;
      // Noise has no frequency param — provide a dummy
      this.frequency = audioCtx.createGain().gain;
    } else if (type === 'pinknoise') {
      this.osc = createPinkNoiseOsc(audioCtx);
      this.output = this.osc;
      this.frequency = audioCtx.createGain().gain;
    } else {
      const osc = audioCtx.createOscillator();
      osc.type = type;
      this.osc = osc;
      this.output = osc;
      this.frequency = osc.frequency;
    }
  }

  start(time: number): void { this.osc.start(time); }
  stop(): void { try { this.osc.stop(); } catch (_) { /* already stopped */ } }
  connect(node: AudioNode | Connectable): void { connectTo(this.output, node); }
}

class VCA {
  input: GainNode;
  output: GainNode;
  amplitude: AudioParam;

  constructor(audioCtx: AudioContext) {
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    this.input = gain;
    this.output = gain;
    this.amplitude = gain.gain;
  }

  connect(node: AudioNode | Connectable): void { connectTo(this.output, node); }
  disconnect(): void { this.output.disconnect(); }
}

type VCFType = 'lowpass' | 'highpass' | 'bandpass';

class VCF {
  input: BiquadFilterNode;
  output: BiquadFilterNode;
  frequency: AudioParam;
  Q: AudioParam;

  constructor(type: VCFType, audioCtx: AudioContext) {
    const filter = audioCtx.createBiquadFilter();
    filter.frequency.value = 400;
    filter.Q.value = 1;
    filter.type = type;
    this.input = filter;
    this.output = filter;
    this.frequency = filter.frequency;
    this.Q = filter.Q;
  }

  connect(node: AudioNode | Connectable): void { connectTo(this.output, node); }
}

class PulseTrigger {
  output: VCA;
  gain: VCA;
  private buffer: AudioBuffer;
  private vcf: VCF;

  constructor(audioCtx: AudioContext) {
    const sampleRate = audioCtx.sampleRate;
    const pulseLength = 0.001 * sampleRate;
    this.buffer = audioCtx.createBuffer(1, pulseLength, sampleRate);
    const data = this.buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = 1;
    this.vcf = new VCF('lowpass', audioCtx);
    this.vcf.frequency.value = 5000;
    this.gain = new VCA(audioCtx);
    this.gain.amplitude.value = 0.8;
    this.vcf.connect(this.gain);
    this.output = this.gain;
  }

  trigger(time: number, audioCtx: AudioContext): void {
    const source = audioCtx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.vcf.input);
    source.start(time);
  }

  connect(node: AudioNode | Connectable): void {
    connectTo(this.output.output, node);
  }
}

const SAW_REVER_INTERVAL = 1 / 100;

class SawEnvGenerator {
  private param!: AudioParam;

  connect(param: AudioParam): void { this.param = param; }

  trigger(time: number): void {
    this.param.cancelScheduledValues(0);
    let timeOffset = 0;
    for (let i = 0; i < 4; i++) {
      this.param.setValueAtTime(1 - i / 2, time + timeOffset);
      timeOffset += SAW_REVER_INTERVAL;
      this.param.linearRampToValueAtTime(0, time + timeOffset);
    }
  }
}

const SQUARE_OSC_FREQUENCIES = [263, 400, 421, 474, 587, 845];
const SQUARE_OSC_AMPLITUDE = 0.3;

class SquareOscBank {
  output: VCA;
  private outputVCA: VCA;
  private oscBank: Array<{ osc: VCO; vca: VCA }>;

  constructor(audioCtx: AudioContext) {
    this.outputVCA = new VCA(audioCtx);
    this.outputVCA.amplitude.value = 1;
    this.oscBank = SQUARE_OSC_FREQUENCIES.map(freq => {
      const osc = new VCO('square', audioCtx);
      osc.frequency.value = freq;
      const vca = new VCA(audioCtx);
      vca.amplitude.value = SQUARE_OSC_AMPLITUDE;
      osc.connect(vca);
      vca.connect(this.outputVCA);
      return { osc, vca };
    });
    this.output = this.outputVCA;
  }

  start(time: number): void { this.oscBank.forEach(({ osc }) => osc.start(time)); }
  stop(): void { this.oscBank.forEach(({ osc }) => osc.stop()); }
  connect(node: AudioNode | Connectable): void { connectTo(this.outputVCA.output, node); }
}

class SwingVCA {
  input: WaveShaperNode;
  output: GainNode;
  amplitude: AudioParam;

  constructor(audioCtx: AudioContext) {
    const rectifier = new HalfWaveRectifier(audioCtx);
    const clipper = new SoftClipper(3, audioCtx);
    const vca = new VCA(audioCtx);
    rectifier.connect(clipper);
    clipper.connect(vca);
    this.amplitude = vca.amplitude;
    this.input = rectifier.input;
    this.output = vca.output;
  }

  connect(node: AudioNode | Connectable): void { connectTo(this.output, node); }
}

// ─── Drum Modules ────────────────────────────────────────────────────────────

function bassDrum(
  audioCtx: AudioContext, destination: AudioNode,
  time: number, params: { level: number; tone: number; decay: number; pm: number }
): VCA {
  const outputLevel = equalPower(params.level);
  const vcfFreq = 200 + params.tone * 20;
  const decayTime = params.decay * 5 + 50;
  const pm = params.pm;

  const START_FREQ = 48 * pm;
  const FREQ_AMT = 50 * pm;

  const vco = new VCO('sine', audioCtx);
  vco.frequency.value = START_FREQ;
  const vcf = new VCF('lowpass', audioCtx);
  vcf.frequency.value = vcfFreq;
  vcf.Q.value = 1;
  const click = new PulseTrigger(audioCtx);
  const vca = new VCA(audioCtx);
  vca.amplitude.value = 0;
  const outputVCA = new VCA(audioCtx);
  outputVCA.amplitude.value = outputLevel + 0.4;
  const softClipper = new SoftClipper(0.6, audioCtx);

  const oscEnv = new ADGenerator('exponential', 0.11, decayTime, START_FREQ, FREQ_AMT);
  const ampEnv = new ADGenerator('linear', 2, decayTime, 0.0, 1.0);

  vco.connect(vca);
  click.connect(vca);
  vca.connect(vcf);
  vcf.connect(softClipper);
  softClipper.connect(outputVCA);
  oscEnv.connect(vco.frequency);
  ampEnv.connect(vca.amplitude);
  outputVCA.connect(destination);

  vco.start(time);
  click.trigger(time, audioCtx);
  oscEnv.trigger(time);
  ampEnv.trigger(time);

  setTimeout(() => { vco.stop(); outputVCA.disconnect(); },
    (time - audioCtx.currentTime) * 1000 + 1000);
  return outputVCA;
}

function snareDrum(
  audioCtx: AudioContext, destination: AudioNode,
  time: number, params: { level: number; tone: number; snappy: number; pm: number }
): VCA {
  const outputLevel = equalPower(params.level);
  const noiseVCFFreq = params.tone * 100 + 800;
  const snappyEnvAmt = params.snappy / 200;
  const pm = params.pm;

  const highOsc = new VCO('sine', audioCtx);
  highOsc.frequency.value = 476 * pm;
  const lowOsc = new VCO('sine', audioCtx);
  lowOsc.frequency.value = 238 * pm;
  const noiseOsc = new VCO('whitenoise', audioCtx);
  const noiseVCF = new VCF('highpass', audioCtx);
  noiseVCF.frequency.value = noiseVCFFreq;
  const oscVCA = new VCA(audioCtx);
  const noiseVCA = new VCA(audioCtx);
  const outputVCA = new VCA(audioCtx);
  outputVCA.amplitude.value = outputLevel;

  const noiseEnv = new ADGenerator('linear', 0.1, 75, 0, 0.5);
  const snappyEnv = new ADGenerator('linear', 0.1, 50, 0, snappyEnvAmt);

  highOsc.connect(oscVCA);
  lowOsc.connect(oscVCA);
  oscVCA.connect(outputVCA);
  noiseOsc.connect(noiseVCF);
  noiseVCF.connect(noiseVCA);
  noiseVCA.connect(outputVCA);
  noiseEnv.connect(noiseVCA.amplitude);
  snappyEnv.connect(oscVCA.amplitude);
  outputVCA.connect(destination);

  highOsc.start(time);
  lowOsc.start(time);
  noiseOsc.start(time);
  noiseEnv.trigger(time);
  snappyEnv.trigger(time);

  setTimeout(() => {
    highOsc.stop(); lowOsc.stop(); noiseOsc.stop(); outputVCA.disconnect();
  }, (time - audioCtx.currentTime) * 1000 + 1000);
  return outputVCA;
}

function cowbell(
  audioCtx: AudioContext, destination: AudioNode,
  time: number, params: { level: number; pm: number }
): VCA {
  const outputLevel = equalPower(params.level);
  const pm = params.pm;

  const highOsc = new VCO('square', audioCtx);
  highOsc.frequency.value = 800 * pm;
  const lowOsc = new VCO('square', audioCtx);
  lowOsc.frequency.value = 540 * pm;
  const bandFilter = new VCF('bandpass', audioCtx);
  bandFilter.frequency.value = 2640;
  bandFilter.Q.value = 1;
  const shortVCA = new VCA(audioCtx);
  const longVCA = new VCA(audioCtx);
  const outputVCA = new VCA(audioCtx);
  outputVCA.amplitude.value = outputLevel;

  const shortEnv = new ADGenerator('linear', 0.11, 15, 0, (1.0 - 0.25) / 2);
  const longEnv = new ADGenerator('exponential', 15, 400, 0, 0.25 / 2);

  highOsc.connect(shortVCA);
  highOsc.connect(longVCA);
  lowOsc.connect(shortVCA);
  lowOsc.connect(longVCA);
  shortVCA.connect(bandFilter);
  longVCA.connect(bandFilter);
  bandFilter.connect(outputVCA);
  shortEnv.connect(shortVCA.amplitude);
  longEnv.connect(longVCA.amplitude);
  outputVCA.connect(destination);

  lowOsc.start(time);
  highOsc.start(time);
  shortEnv.trigger(time);
  longEnv.trigger(time);

  setTimeout(() => {
    lowOsc.stop(); highOsc.stop(); outputVCA.disconnect();
  }, (time - audioCtx.currentTime) * 1000 + 1000);
  return outputVCA;
}

function hiHat(
  audioCtx: AudioContext, destination: AudioNode,
  time: number, outputLevel: number, decay: number, pm: number
): VCA {
  const oscBank = new SquareOscBank(audioCtx);
  const midFilter = new VCF('bandpass', audioCtx);
  midFilter.frequency.value = 10000 * pm;
  const highFilter = new VCF('highpass', audioCtx);
  highFilter.frequency.value = 8000 * pm;
  const outputVCA = new VCA(audioCtx);
  outputVCA.amplitude.value = outputLevel;
  const modVCA = new VCA(audioCtx);
  const env = new ADGenerator('linear', 0.1, decay, 0, 1);

  oscBank.connect(midFilter);
  midFilter.connect(modVCA);
  modVCA.connect(highFilter);
  highFilter.connect(outputVCA);
  env.connect(modVCA.amplitude);
  outputVCA.connect(destination);

  oscBank.start(time);
  env.trigger(time);

  setTimeout(() => {
    oscBank.stop(); outputVCA.disconnect();
  }, (time - audioCtx.currentTime) * 1000 + 1000);
  return outputVCA;
}

function closedHat(
  audioCtx: AudioContext, destination: AudioNode,
  time: number, params: { level: number; pm: number }
): VCA {
  return hiHat(audioCtx, destination, time, equalPower(params.level), 50, params.pm);
}

function openHat(
  audioCtx: AudioContext, destination: AudioNode,
  time: number, params: { level: number; decay: number; pm: number }
): VCA {
  return hiHat(audioCtx, destination, time, equalPower(params.level), params.decay * 3.6 + 90, params.pm);
}

function claveRimshot(
  audioCtx: AudioContext, destination: AudioNode,
  time: number, params: { level: number; selector: number; pm: number }
): VCA {
  const outputLevel = equalPower(params.level);
  const selector = params.selector;
  const pm = params.pm;

  const RIM_CLAVE_FREQ = 1750 * pm;
  const CLAVE_FREQ = 2450 * pm;
  const RIM_FREQ = 480 * pm;

  const outputVCA = new VCA(audioCtx);
  outputVCA.amplitude.value = outputLevel;

  // rimshot modules
  const rimOsc = new VCO('sine', audioCtx);
  rimOsc.frequency.value = RIM_FREQ;
  const rimBandFilter = new VCF('bandpass', audioCtx);
  rimBandFilter.frequency.value = RIM_FREQ;
  const rimHighFilter = new VCF('highpass', audioCtx);
  rimHighFilter.frequency.value = RIM_FREQ;
  const swingVCA = new SwingVCA(audioCtx);
  const swingEnv = new ADGenerator('linear', 0.11, 10, 0, 1.7);

  // clave modules
  const claveOsc = new VCO('triangle', audioCtx);
  let claveFilter: VCF;
  if (selector === 0) {
    claveOsc.frequency.value = CLAVE_FREQ;
    claveFilter = new VCF('bandpass', audioCtx);
  } else {
    claveOsc.frequency.value = RIM_CLAVE_FREQ;
    claveFilter = new VCF('highpass', audioCtx);
  }
  claveFilter.frequency.value = CLAVE_FREQ;

  const claveVCA = new VCA(audioCtx);
  const claveEnv = new ADGenerator('exponential', 0.11, 40, 0, 0.7);

  // audio routing
  rimOsc.connect(rimBandFilter);
  rimBandFilter.connect(swingVCA);

  claveOsc.connect(claveFilter);
  claveFilter.connect(claveVCA);
  claveVCA.connect(swingVCA);

  swingVCA.connect(rimHighFilter);

  if (selector === 0) {
    claveVCA.connect(outputVCA);
  } else {
    rimHighFilter.connect(outputVCA);
  }

  // modulation routing
  swingEnv.connect(swingVCA.amplitude);
  claveEnv.connect(claveVCA.amplitude);

  // output
  outputVCA.connect(destination);

  // triggering
  claveOsc.start(time);
  rimOsc.start(time);
  claveEnv.trigger(time);
  swingEnv.trigger(time);

  setTimeout(() => {
    claveOsc.stop(); rimOsc.stop(); outputVCA.disconnect();
  }, (time - audioCtx.currentTime) * 1000 + 1000);
  return outputVCA;
}

function cymbal(
  audioCtx: AudioContext, destination: AudioNode,
  time: number, params: { level: number; tone: number; decay: number; pm: number }
): VCA {
  const outputLevel = equalPower(params.level);
  const lowDecay = params.decay * 8.5 + 700;
  const pm = params.pm;

  const LOW_FILTER_FREQ = 5000 * pm;
  const MID_HIGH_FILTER_FREQ = 10000 * pm;
  const HIGH_FILTER_FREQ = 8000 * pm;
  const HIGH_DECAY = 150;
  const MID_DECAY = 400;

  // tone ratio
  const lowEnvAmt = 0.666 - (params.tone / 100) * 0.666;
  const midEnvAmt = 0.333;
  const highEnvAmt = 0.666 - (1 - params.tone / 100) * 0.666;

  // audio modules
  const oscBank = new SquareOscBank(audioCtx);

  const lowBandFilter = new VCF('bandpass', audioCtx);
  lowBandFilter.frequency.value = LOW_FILTER_FREQ;
  const lowVCA = new VCA(audioCtx);

  const lowHighpassFilter = new VCF('highpass', audioCtx);
  lowHighpassFilter.frequency.value = LOW_FILTER_FREQ;

  const midHighBandFilter = new VCF('bandpass', audioCtx);
  midHighBandFilter.frequency.value = MID_HIGH_FILTER_FREQ;
  const midVCA = new VCA(audioCtx);

  const midHighpassFilter = new VCF('highpass', audioCtx);
  midHighpassFilter.frequency.value = MID_HIGH_FILTER_FREQ;

  const highFilter = new VCF('highpass', audioCtx);
  highFilter.frequency.value = HIGH_FILTER_FREQ;
  const highVCA = new VCA(audioCtx);

  const outputVCA = new VCA(audioCtx);
  outputVCA.amplitude.value = outputLevel;

  // envelopes
  const lowEnv = new ADGenerator('exponential', 0.1, lowDecay, 0, lowEnvAmt);
  const midEnv = new ADGenerator('exponential', 0.1, MID_DECAY, 0, midEnvAmt);
  const highEnv = new ADGenerator('exponential', 0.1, HIGH_DECAY, 0, highEnvAmt);

  // band splitting
  oscBank.connect(lowBandFilter);
  oscBank.connect(midHighBandFilter);

  // low band routing
  lowBandFilter.connect(lowVCA);
  lowVCA.connect(lowHighpassFilter);
  lowHighpassFilter.connect(outputVCA);

  // mid band routing
  midHighBandFilter.connect(midVCA);
  midVCA.connect(midHighpassFilter);
  midHighpassFilter.connect(outputVCA);

  // high band routing
  midHighBandFilter.connect(highVCA);
  highVCA.connect(highFilter);
  highFilter.connect(outputVCA);

  // modulation routing
  lowEnv.connect(lowVCA.amplitude);
  midEnv.connect(midVCA.amplitude);
  highEnv.connect(highVCA.amplitude);

  // output
  outputVCA.connect(destination);

  // triggering
  oscBank.start(time);
  lowEnv.trigger(time);
  midEnv.trigger(time);
  highEnv.trigger(time);

  // cymbal has longer cleanup (2000ms)
  setTimeout(() => {
    oscBank.stop(); outputVCA.disconnect();
  }, (time - audioCtx.currentTime) * 1000 + 2000);
  return outputVCA;
}

function maracasHandclap(
  audioCtx: AudioContext, destination: AudioNode,
  time: number, params: { level: number; selector: number }
): VCA {
  const outputLevel = equalPower(params.level);
  const selector = params.selector;

  // shared
  const osc = new VCO('whitenoise', audioCtx);
  osc.start(time);

  const outputVCA = new VCA(audioCtx);
  outputVCA.amplitude.value = outputLevel;

  if (selector === 0) {
    // maracas
    const maracasFilter = new VCF('highpass', audioCtx);
    maracasFilter.frequency.value = 5000;
    const maracasVCA = new VCA(audioCtx);
    const maracasEnv = new ADGenerator('linear', 0.2, 30, 0, 0.5);

    osc.connect(maracasFilter);
    maracasFilter.connect(maracasVCA);
    maracasVCA.connect(outputVCA);
    maracasEnv.connect(maracasVCA.amplitude);
    maracasEnv.trigger(time);
  } else if (selector === 1) {
    // handclap
    const clapFilter = new VCF('bandpass', audioCtx);
    clapFilter.frequency.value = 1000;
    const sawVCA = new VCA(audioCtx);
    const reverVCA = new VCA(audioCtx);
    const sawEnv = new SawEnvGenerator();
    const reverEnv = new ADGenerator('linear', 0.2, 115, 0, 0.75);

    osc.connect(clapFilter);
    clapFilter.connect(sawVCA);
    clapFilter.connect(reverVCA);
    sawVCA.connect(outputVCA);
    reverVCA.connect(outputVCA);
    sawEnv.connect(sawVCA.amplitude);
    reverEnv.connect(reverVCA.amplitude);
    sawEnv.trigger(time);
    reverEnv.trigger(time);
  }

  outputVCA.connect(destination);

  setTimeout(() => {
    osc.stop(); outputVCA.disconnect();
  }, (time - audioCtx.currentTime) * 1000 + 1000);
  return outputVCA;
}

// ─── Tom/Conga ───────────────────────────────────────────────────────────────

// 0 = conga, 1 = tom
interface TomCongaRange {
  frequencies: [number, number]; // [high, low]
  decay: [number, number];       // [oscDecay, noiseDecay]
}

const tomCongaParameterMap: Record<string, [TomCongaRange, TomCongaRange]> = {
  low: [
    { frequencies: [220, 165], decay: [180, 200] },
    { frequencies: [100, 80], decay: [200, 200] },
  ],
  mid: [
    { frequencies: [310, 250], decay: [100, 155] },
    { frequencies: [160, 120], decay: [130, 155] },
  ],
  high: [
    { frequencies: [455, 370], decay: [180, 125] },
    { frequencies: [220, 165], decay: [200, 125] },
  ],
};

function tomConga(
  pitchRange: 'low' | 'mid' | 'high',
  audioCtx: AudioContext, destination: AudioNode,
  time: number, params: { level: number; tuning: number; selector: number; pm: number }
): VCA {
  const selector = params.selector;
  const pm = params.pm;
  const rangeData = tomCongaParameterMap[pitchRange][selector];
  const [highFreq, lowFreq] = rangeData.frequencies;
  const [oscDecay, noiseDecay] = rangeData.decay;
  const oscFreq = ((params.tuning / 100) * (highFreq - lowFreq) + lowFreq) * pm;
  const outputLevel = equalPower(params.level / 4);

  const osc = new VCO('sine', audioCtx);
  osc.frequency.value = oscFreq;
  const noiseOsc = new VCO('pinknoise', audioCtx);
  const click = new PulseTrigger(audioCtx);
  click.gain.amplitude.value = 0.3;
  const noiseVCF = new VCF('lowpass', audioCtx);
  noiseVCF.frequency.value = 10000;
  const oscVCA = new VCA(audioCtx);
  const noiseVCA = new VCA(audioCtx);
  const outputVCA = new VCA(audioCtx);
  outputVCA.amplitude.value = outputLevel;

  const oscEnv = new ADGenerator('linear', 0.1, oscDecay, 0, 1);
  const noiseEnv = new ADGenerator('linear', 0.1, noiseDecay, 0, 0.2);

  osc.connect(oscVCA);
  oscVCA.connect(outputVCA);

  if (selector === 1) {
    // only toms get noise
    noiseOsc.connect(noiseVCF);
    noiseVCF.connect(noiseVCA);
    noiseVCA.connect(outputVCA);
  }

  click.connect(outputVCA);

  oscEnv.connect(oscVCA.amplitude);
  noiseEnv.connect(noiseVCA.amplitude);
  outputVCA.connect(destination);

  osc.start(time);
  noiseOsc.start(time);
  click.trigger(time, audioCtx);
  oscEnv.trigger(time);
  noiseEnv.trigger(time);

  setTimeout(() => {
    osc.stop(); noiseOsc.stop(); outputVCA.disconnect();
  }, (time - audioCtx.currentTime) * 1000 + 1000);
  return outputVCA;
}

// ─── Main Synth Class ────────────────────────────────────────────────────────

export class IO808Synth {
  private audioCtx: AudioContext;
  private destination: AudioNode;

  constructor(audioCtx: AudioContext, destination: AudioNode) {
    this.audioCtx = audioCtx;
    this.destination = destination;
  }

  trigger(drumType: IO808DrumType, time: number, params: IO808Params = {}): void {
    const level = params.level ?? 80;
    const tone = params.tone ?? 50;
    const decay = params.decay ?? 50;
    const snappy = params.snappy ?? 50;
    const tuning = params.tuning ?? 50;
    const pm = params.pitchMultiplier ?? 1;
    const ctx = this.audioCtx;
    const dest = this.destination;

    switch (drumType) {
      case 'kick':
        bassDrum(ctx, dest, time, { level, tone, decay, pm });
        break;
      case 'snare':
        snareDrum(ctx, dest, time, { level, tone, snappy, pm });
        break;
      case 'closedHat':
        closedHat(ctx, dest, time, { level, pm });
        break;
      case 'openHat':
        openHat(ctx, dest, time, { level, decay, pm });
        break;
      case 'clap':
        maracasHandclap(ctx, dest, time, { level, selector: 1 });
        break;
      case 'rimshot':
        claveRimshot(ctx, dest, time, { level, selector: 1, pm });
        break;
      case 'clave':
        claveRimshot(ctx, dest, time, { level, selector: 0, pm });
        break;
      case 'cowbell':
        cowbell(ctx, dest, time, { level, pm });
        break;
      case 'cymbal':
        cymbal(ctx, dest, time, { level, tone, decay, pm });
        break;
      case 'maracas':
        maracasHandclap(ctx, dest, time, { level, selector: 0 });
        break;
      case 'tomLow':
        tomConga('low', ctx, dest, time, { level, tuning, selector: 1, pm });
        break;
      case 'tomMid':
        tomConga('mid', ctx, dest, time, { level, tuning, selector: 1, pm });
        break;
      case 'tomHigh':
        tomConga('high', ctx, dest, time, { level, tuning, selector: 1, pm });
        break;
      case 'congaLow':
        tomConga('low', ctx, dest, time, { level, tuning, selector: 0, pm });
        break;
      case 'congaMid':
        tomConga('mid', ctx, dest, time, { level, tuning, selector: 0, pm });
        break;
      case 'congaHigh':
        tomConga('high', ctx, dest, time, { level, tuning, selector: 0, pm });
        break;
    }
  }
}
