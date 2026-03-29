/**
 * TR909Synth — Web Audio TR-909 drum machine synth engine.
 *
 * Adapted from https://github.com/andremichelle/tr-909
 * Original by André Michelle — MIT License
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
 *
 * ---
 *
 * Architecture: The original TR-909 runs sample-by-sample in an AudioWorklet.
 * This adaptation uses Web Audio API AudioBufferSourceNode + GainNode automation
 * for integration with the Tone.js-based DEViLBOX audio pipeline.
 *
 * Voice types:
 *   - BassdrumVoice: Looping single-cycle waveform with pitch sweep + attack click
 *   - SnaredrumVoice: Tuned tone sample + noise sample with independent envelopes
 *   - BasicTuneDecayVoice: Sample playback with tune (rate) and decay envelope
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const RESOURCE_SAMPLE_RATE = 44100;
const LOG_DB = Math.log(10.0) / 20.0;

// ─── Types ───────────────────────────────────────────────────────────────────

export type TR909DrumType =
  | 'kick' | 'snare' | 'closedHat' | 'openHat'
  | 'clap' | 'rimshot' | 'tomLow' | 'tomMid' | 'tomHigh'
  | 'crash' | 'ride';

export interface TR909Params {
  level?: number;   // 0-100 (mapped to dB via Volume curve)
  tune?: number;    // 0-100 (mapped per instrument — see parameter curves below)
  decay?: number;   // 0-100 (mapped to seconds via Exp curves, per instrument)
  snappy?: number;  // 0-100 (snare only: noise level in dB)
  tone?: number;    // 0-100 (snare only: noise decay rate)
  attack?: number;  // 0-100 (bassdrum only: click attack level in dB)
}

export interface TR909Resources {
  bassdrum: { attack: AudioBuffer; cycle: AudioBuffer };
  snaredrum: { tone: AudioBuffer; noise: AudioBuffer };
  tomLow: AudioBuffer;
  tomMid: AudioBuffer;
  tomHi: AudioBuffer;
  rim: AudioBuffer;
  clap: AudioBuffer;
  closedHihat: AudioBuffer;
  openedHihat: AudioBuffer;
  crash: AudioBuffer;
  ride: AudioBuffer;
}

// ─── Parameter Mapping Curves (from reference preset.ts / mapping.ts) ────────

function dbToGain(db: number): number {
  return Math.exp(db * LOG_DB);
}

/** Exponential mapping: x ∈ [0,1] → y ∈ [min, max] (log-spaced) */
class ExpMapping {
  readonly min: number;
  readonly max: number;
  private readonly range: number;
  constructor(min: number, max: number) {
    this.min = min;
    this.max = max;
    this.range = Math.log(max / min);
  }
  y(x: number): number { return this.min * Math.exp(x * this.range); }
}

/** Linear mapping: x ∈ [0,1] → y ∈ [min, max] */
class LinearMapping {
  readonly min: number;
  readonly max: number;
  private readonly range: number;
  constructor(min: number, max: number) {
    this.min = min;
    this.max = max;
    this.range = max - min;
  }
  y(x: number): number { return this.min + x * this.range; }
}

/**
 * Volume mapping: perceptual dB curve from reference lib/mapping.ts
 * db = a - b/(x + c) where x ∈ (0, 1]
 * Solved: min at x=0, mid at x=0.5, max at x=1.0
 */
class VolumeMapping {
  readonly min: number;
  readonly mid: number;
  readonly max: number;
  private readonly a: number;
  private readonly b: number;
  private readonly c: number;
  constructor(min: number, mid: number, max: number) {
    this.min = min;
    this.mid = mid;
    this.max = max;
    const min2 = min * min;
    const max2 = max * max;
    const mid2 = mid * mid;
    const tmp0 = min + max - 2.0 * mid;
    const tmp1 = max - mid;
    this.a = ((2.0 * max - mid) * min - mid * max) / tmp0;
    this.b = (tmp1 * min2 + (mid2 - max2) * min + mid * max2 - mid2 * max)
      / (min2 + (2.0 * max - 4.0 * mid) * min + max2 - 4.0 * mid * max + 4 * mid2);
    this.c = -tmp1 / tmp0;
  }
  y(x: number): number {
    if (x <= 0.0) return Number.NEGATIVE_INFINITY;
    if (x >= 1.0) return this.max;
    return this.a - this.b / (x + this.c);
  }
}

// Parameter curve instances matching the reference preset.ts
const volumeDefault = new VolumeMapping(-72.0, -12.0, 0.0);
const bassdrumTuneMapping = new ExpMapping(0.007, 0.0294);
const bassdrumDecayMapping = new ExpMapping(0.012, 0.100);
const tomDecayMapping = new ExpMapping(0.04, 0.15);
const snaredrumDecayMapping = new ExpMapping(0.04, 0.2);
const openedHihatMapping = new ExpMapping(0.03, 0.16);
const closedHihatMapping = new ExpMapping(0.008, 0.06);
const tuneMapping = new LinearMapping(-0.5, 0.5);

// ─── Resource Loading ────────────────────────────────────────────────────────

async function loadRawFloat32(audioCtx: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const float32 = new Float32Array(arrayBuffer);
  const audioBuffer = audioCtx.createBuffer(1, float32.length, RESOURCE_SAMPLE_RATE);
  audioBuffer.getChannelData(0).set(float32);
  return audioBuffer;
}

async function loadAllResources(audioCtx: AudioContext, basePath: string): Promise<TR909Resources> {
  const load = (name: string) => loadRawFloat32(audioCtx, `${basePath}/${name}`);
  const [
    bdAttack, bdCycle,
    snTone, snNoise,
    tomLow, tomMid, tomHi,
    rim, clap,
    closedHihat, openedHihat,
    crash, ride
  ] = await Promise.all([
    load('bassdrum-attack.raw'), load('bassdrum-cycle.raw'),
    load('snare-tone.raw'), load('snare-noise.raw'),
    load('tom-low.raw'), load('tom-mid.raw'), load('tom-hi.raw'),
    load('rim.raw'), load('clap.raw'),
    load('closed-hihat.raw'), load('opened-hihat.raw'),
    load('crash.raw'), load('ride.raw'),
  ]);
  return {
    bassdrum: { attack: bdAttack, cycle: bdCycle },
    snaredrum: { tone: snTone, noise: snNoise },
    tomLow, tomMid, tomHi,
    rim, clap, closedHihat, openedHihat, crash, ride,
  };
}

// ─── Voice Trigger Functions ─────────────────────────────────────────────────

// Defaults from the reference preset (unipolar 0-1 positions):
//   bassdrum: tune=Exp(0.007,0.0294).y(0.0)=0.007, level=-6dB, attack=0dB, decay=Exp(0.012,0.1).y(0.5)
//   snare: tune=Linear(-0.5,0.5).y(0.5)=0, level=-6dB, tone=SnareDecay.y(1.0)=0.2, snappy=0dB
//   toms: tune=0, level=-6dB, decay=TomDecay.y(1.0)=0.15
//   rim/clap: level=-6dB
//   hihats: level=-6dB, closedDecay=ClosedHihat.y(0.0)=0.008, openDecay=OpenedHihat.y(0.5)
//   crash/ride: level=-6dB, tune=0

/**
 * Bassdrum voice: looping single-cycle waveform with pitch sweep + attack click.
 *
 * The cycle buffer is 1024 samples at 44100Hz → base freq ≈ 43.07Hz.
 * Pitch sweeps from 274Hz (rate≈6.36) to 53Hz (rate≈1.23).
 * Tune controls the sweep speed (time constant of exponential decay).
 * Amplitude stays at 1.0 for 60ms, then decays exponentially.
 */
function triggerBassdrum(
  audioCtx: AudioContext, dest: AudioNode,
  resources: TR909Resources['bassdrum'],
  time: number, params: TR909Params
): void {
  const levelUnipolar = (params.level ?? 50) / 100;
  const tuneUnipolar = (params.tune ?? 0) / 100;
  const decayUnipolar = (params.decay ?? 50) / 100;
  const attackUnipolar = (params.attack ?? 100) / 100;

  // Level in dB → gain
  const levelDb = volumeDefault.y(levelUnipolar);
  const levelGain = levelDb === Number.NEGATIVE_INFINITY ? 0 : dbToGain(levelDb);

  // Tune → sweep time constant (seconds)
  const sweepTimeConst = bassdrumTuneMapping.y(tuneUnipolar);

  // Decay → amplitude decay time constant after 60ms
  const decayTimeConst = bassdrumDecayMapping.y(decayUnipolar);

  // Attack level in dB
  const attackDb = volumeDefault.y(attackUnipolar);
  const attackGain = attackDb === Number.NEGATIVE_INFINITY ? 0 : dbToGain(attackDb);

  const RELEASE_START = 0.060;
  const FREQ_START = 274.0;
  const FREQ_END = 53.0;
  const cycleBaseFreq = RESOURCE_SAMPLE_RATE / resources.cycle.length; // ≈43.07Hz

  // --- Cycle source (looping single-cycle waveform) ---
  const cycleSource = audioCtx.createBufferSource();
  cycleSource.buffer = resources.cycle;
  cycleSource.loop = true;
  cycleSource.loopEnd = resources.cycle.duration;

  // Pitch sweep via playbackRate: FreqStart/baseFreq → FreqEnd/baseFreq
  const startRate = FREQ_START / cycleBaseFreq;
  const endRate = FREQ_END / cycleBaseFreq;
  // The exponential sweep converges in ~5 time constants
  const sweepDuration = Math.max(sweepTimeConst * 5, 0.001);

  cycleSource.playbackRate.setValueAtTime(startRate, time);
  cycleSource.playbackRate.exponentialRampToValueAtTime(endRate, time + sweepDuration);

  // --- Cycle gain (amplitude envelope) ---
  const cycleGain = audioCtx.createGain();
  cycleGain.gain.setValueAtTime(levelGain, time);
  // Hold full gain for 60ms, then exponential decay
  cycleGain.gain.setValueAtTime(levelGain, time + RELEASE_START);
  const decayDuration = Math.max(decayTimeConst * 5, 0.001);
  cycleGain.gain.exponentialRampToValueAtTime(0.0001, time + RELEASE_START + decayDuration);

  cycleSource.connect(cycleGain);
  cycleGain.connect(dest);

  const totalDuration = RELEASE_START + decayDuration + 0.01;
  cycleSource.start(time);
  cycleSource.stop(time + totalDuration);

  // --- Attack click (one-shot sample) ---
  if (attackGain > 0.0001) {
    const attackSource = audioCtx.createBufferSource();
    attackSource.buffer = resources.attack;

    const attackGainNode = audioCtx.createGain();
    attackGainNode.gain.setValueAtTime(attackGain * levelGain, time);

    attackSource.connect(attackGainNode);
    attackGainNode.connect(dest);

    attackSource.start(time);
    // Attack is a short click — let it play to its natural end
    attackSource.onended = () => {
      try { attackSource.disconnect(); attackGainNode.disconnect(); } catch { /* already disconnected */ }
    };
  }

  // Cleanup
  cycleSource.onended = () => {
    try { cycleSource.disconnect(); cycleGain.disconnect(); } catch { /* already disconnected */ }
  };
}

/**
 * Snaredrum voice: tuned tone sample + noise sample with independent envelopes.
 *
 * Tone: played at rate = pow(2, tune), tune from TuneMapping(-0.5, 0.5)
 * Noise: played at base rate (ResourceSampleRate/sampleRate ≈ 1.0 if matching)
 * Noise gain decays exponentially, controlled by "tone" param (confusingly named
 *   in the original — it's actually the noise decay time constant).
 * "Snappy" controls the initial noise gain level in dB.
 */
function triggerSnaredrum(
  audioCtx: AudioContext, dest: AudioNode,
  resources: TR909Resources['snaredrum'],
  time: number, params: TR909Params
): void {
  const levelUnipolar = (params.level ?? 50) / 100;
  const tuneUnipolar = (params.tune ?? 50) / 100;
  const toneUnipolar = (params.tone ?? 100) / 100; // noise decay rate
  const snappyUnipolar = (params.snappy ?? 100) / 100; // noise initial level

  // Level
  const levelDb = volumeDefault.y(levelUnipolar);
  const levelGain = levelDb === Number.NEGATIVE_INFINITY ? 0 : dbToGain(levelDb);

  // Tune → playback rate modifier
  const tuneValue = tuneMapping.y(tuneUnipolar); // -0.5..0.5
  const toneRate = Math.pow(2.0, tuneValue);

  // Noise decay time constant
  const noiseDecayTimeConst = snaredrumDecayMapping.y(toneUnipolar);

  // Snappy → initial noise gain in dB
  const snappyDb = volumeDefault.y(snappyUnipolar);
  const snappyGain = snappyDb === Number.NEGATIVE_INFINITY ? 0 : dbToGain(snappyDb);

  // --- Tone source ---
  const toneSource = audioCtx.createBufferSource();
  toneSource.buffer = resources.tone;
  toneSource.playbackRate.setValueAtTime(toneRate, time);

  const toneGain = audioCtx.createGain();
  toneGain.gain.setValueAtTime(levelGain, time);

  toneSource.connect(toneGain);
  toneGain.connect(dest);
  toneSource.start(time);

  // --- Noise source ---
  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = resources.noise;
  // Noise plays at base rate (no tune)
  noiseSource.playbackRate.setValueAtTime(1.0, time);

  const noiseGain = audioCtx.createGain();
  const initialNoiseGain = levelGain * snappyGain;
  noiseGain.gain.setValueAtTime(Math.max(initialNoiseGain, 0.0001), time);

  // Noise gain decays exponentially over ~5 time constants
  const noiseDecayDuration = Math.max(noiseDecayTimeConst * 5, 0.001);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + noiseDecayDuration);

  noiseSource.connect(noiseGain);
  noiseGain.connect(dest);
  noiseSource.start(time);

  // Cleanup
  const cleanup = (src: AudioBufferSourceNode, gain: GainNode) => () => {
    try { src.disconnect(); gain.disconnect(); } catch { /* already disconnected */ }
  };
  toneSource.onended = cleanup(toneSource, toneGain);
  noiseSource.onended = cleanup(noiseSource, noiseGain);
}

/**
 * Basic tune/decay voice: sample playback with tune-adjusted rate and decay envelope.
 * Used for toms, rim, clap, hihats, crash, ride.
 *
 * Rate = pow(2, tune), where tune from TuneMapping(-0.5, 0.5)
 * After releaseStartTime, amplitude decays exponentially.
 */
function triggerBasicVoice(
  audioCtx: AudioContext, dest: AudioNode,
  buffer: AudioBuffer,
  time: number, params: TR909Params,
  releaseStartTime: number,
  decayMapping: ExpMapping | null,
  hasTune: boolean
): void {
  const levelUnipolar = (params.level ?? 50) / 100;
  const tuneUnipolar = (params.tune ?? 50) / 100;
  const decayUnipolar = (params.decay ?? 100) / 100;

  // Level
  const levelDb = volumeDefault.y(levelUnipolar);
  const levelGain = levelDb === Number.NEGATIVE_INFINITY ? 0 : dbToGain(levelDb);

  // Tune → playback rate
  let rate = 1.0;
  if (hasTune) {
    const tuneValue = tuneMapping.y(tuneUnipolar);
    rate = Math.pow(2.0, tuneValue);
  }

  // Decay time constant
  let decayTimeConst = 0.1; // fallback
  if (decayMapping) {
    decayTimeConst = decayMapping.y(decayUnipolar);
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(rate, time);

  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(levelGain, time);

  if (decayMapping) {
    // Hold full gain until releaseStartTime, then exponential decay
    const releaseTime = time + releaseStartTime;
    const decayDuration = Math.max(decayTimeConst * 5, 0.001);
    if (releaseStartTime > 0) {
      gainNode.gain.setValueAtTime(levelGain, releaseTime);
    }
    gainNode.gain.exponentialRampToValueAtTime(0.0001, releaseTime + decayDuration);
  }

  source.connect(gainNode);
  gainNode.connect(dest);
  source.start(time);

  source.onended = () => {
    try { source.disconnect(); gainNode.disconnect(); } catch { /* already disconnected */ }
  };
}

// ─── Shared Resource Cache (singleton — all TR909 instances share one load) ──

let _sharedResources: TR909Resources | null = null;
let _sharedLoading: Promise<TR909Resources> | null = null;

function getSharedResources(audioCtx: AudioContext, basePath: string): Promise<TR909Resources> {
  if (_sharedResources) return Promise.resolve(_sharedResources);
  if (!_sharedLoading) {
    _sharedLoading = loadAllResources(audioCtx, basePath).then(r => {
      _sharedResources = r;
      return r;
    });
  }
  return _sharedLoading;
}

/** Preload TR909 samples eagerly. Call once at app startup or when TR909 pads are created. */
export function preloadTR909Resources(audioCtx: AudioContext, basePath = '/tr909'): Promise<void> {
  return getSharedResources(audioCtx, basePath).then(() => {});
}

// ─── Main Synth Class ────────────────────────────────────────────────────────

export class TR909Synth {
  private audioCtx: AudioContext;
  private destination: AudioNode;
  private basePath: string;

  constructor(audioCtx: AudioContext, destination: AudioNode | { input?: AudioNode }, basePath = '/tr909') {
    this.audioCtx = audioCtx;
    this.basePath = basePath;
    // Accept Tone.js nodes (which have .input) or raw AudioNodes
    if ((destination as { input?: AudioNode }).input) {
      this.destination = (destination as { input: AudioNode }).input;
    } else {
      this.destination = destination as AudioNode;
    }
    // Start loading immediately via shared cache
    getSharedResources(this.audioCtx, this.basePath);
  }

  /** Ensure resources are loaded. Safe to call multiple times. */
  async ensureLoaded(): Promise<void> {
    await getSharedResources(this.audioCtx, this.basePath);
  }

  /** Trigger a drum voice. If resources aren't loaded yet, queues the trigger. */
  trigger(drumType: TR909DrumType, time: number, params?: TR909Params): void {
    if (_sharedResources) {
      this._triggerImmediate(drumType, _sharedResources, time, params);
    } else {
      // Resources still loading — queue trigger with slight schedule offset
      getSharedResources(this.audioCtx, this.basePath).then(resources => {
        const now = this.audioCtx.currentTime;
        this._triggerImmediate(drumType, resources, Math.max(time, now), params);
      });
    }
  }

  private _triggerImmediate(drumType: TR909DrumType, res: TR909Resources, time: number, params?: TR909Params): void {
    const p = params ?? {};

    switch (drumType) {
      case 'kick':
        triggerBassdrum(this.audioCtx, this.destination, res.bassdrum, time, p);
        break;
      case 'snare':
        triggerSnaredrum(this.audioCtx, this.destination, res.snaredrum, time, p);
        break;
      case 'tomLow':
        triggerBasicVoice(this.audioCtx, this.destination, res.tomLow,
          time, p, 0.030, tomDecayMapping, true);
        break;
      case 'tomMid':
        triggerBasicVoice(this.audioCtx, this.destination, res.tomMid,
          time, p, 0.030, tomDecayMapping, true);
        break;
      case 'tomHigh':
        triggerBasicVoice(this.audioCtx, this.destination, res.tomHi,
          time, p, 0.030, tomDecayMapping, true);
        break;
      case 'rimshot':
        triggerBasicVoice(this.audioCtx, this.destination, res.rim,
          time, p, 0, null, false);
        break;
      case 'clap':
        triggerBasicVoice(this.audioCtx, this.destination, res.clap,
          time, p, 0, null, false);
        break;
      case 'closedHat':
        triggerBasicVoice(this.audioCtx, this.destination, res.closedHihat,
          time, p, 0.006, closedHihatMapping, false);
        break;
      case 'openHat':
        triggerBasicVoice(this.audioCtx, this.destination, res.openedHihat,
          time, p, 0.012, openedHihatMapping, false);
        break;
      case 'crash':
        triggerBasicVoice(this.audioCtx, this.destination, res.crash,
          time, p, 0, null, true);
        break;
      case 'ride':
        triggerBasicVoice(this.audioCtx, this.destination, res.ride,
          time, p, 0, null, true);
        break;
    }
  }
}
