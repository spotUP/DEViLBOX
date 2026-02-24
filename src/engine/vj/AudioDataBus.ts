/**
 * VJ AudioDataBus — Enhanced audio analysis for VJ visualizations.
 *
 * Wraps ToneEngine's analyser/FFT with:
 * - Beat detection (energy threshold + debounce)
 * - Band energy extraction (sub, bass, mid, high)
 * - RMS / peak with exponential smoothing
 * - Frame-rate independent timing
 *
 * All data is computed once per frame and cached until next update().
 */

import { getToneEngine } from '../ToneEngine';

export interface VJAudioFrame {
  /** Raw waveform samples (-1..1), 1024 length */
  waveform: Float32Array;
  /** Raw FFT bins (dB, typically -100..0), 1024 length */
  fft: Float32Array;
  /** RMS level 0..1 (smoothed) */
  rms: number;
  /** Peak level 0..1 (smoothed) */
  peak: number;
  /** Sub-bass energy 0..1 (~20-60 Hz) */
  subEnergy: number;
  /** Bass energy 0..1 (~60-250 Hz) */
  bassEnergy: number;
  /** Mid energy 0..1 (~250-4000 Hz) */
  midEnergy: number;
  /** High energy 0..1 (~4000-20000 Hz) */
  highEnergy: number;
  /** True on frames where a beat is detected */
  beat: boolean;
  /** Time in seconds since AudioDataBus was created */
  time: number;
  /** Delta time since last update (seconds) */
  deltaTime: number;
}

// FFT bin ranges (assuming 44100 Hz sample rate, 1024 bins → ~21.5 Hz per bin)
const SUB_END = 3;     // ~0-65 Hz
const BASS_END = 12;   // ~65-258 Hz
const MID_END = 186;   // ~258-4000 Hz
// HIGH = 186..512

const SMOOTHING = 0.3;            // Exponential smoothing factor for levels
const BEAT_THRESHOLD = 1.4;       // Energy must be N× the running average
const BEAT_COOLDOWN_MS = 120;     // Min ms between beats
const ENERGY_HISTORY_LEN = 43;    // ~0.7s at 60fps for running average

export class AudioDataBus {
  private startTime = performance.now();
  private lastTime = performance.now();
  private smoothRms = 0;
  private smoothPeak = 0;
  private smoothSub = 0;
  private smoothBass = 0;
  private smoothMid = 0;
  private smoothHigh = 0;
  private energyHistory: number[] = [];
  private lastBeatTime = 0;
  private enabled = false;

  private frame: VJAudioFrame = {
    waveform: new Float32Array(1024),
    fft: new Float32Array(1024),
    rms: 0,
    peak: 0,
    subEnergy: 0,
    bassEnergy: 0,
    midEnergy: 0,
    highEnergy: 0,
    beat: false,
    time: 0,
    deltaTime: 0,
  };

  enable(): void {
    if (!this.enabled) {
      getToneEngine().enableAnalysers();
      this.enabled = true;
    }
  }

  disable(): void {
    if (this.enabled) {
      getToneEngine().disableAnalysers();
      this.enabled = false;
    }
  }

  /** Call once per rAF frame. Returns the current audio frame. */
  update(): VJAudioFrame {
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    const engine = getToneEngine();
    const waveform = engine.getWaveform();
    const fft = engine.getFFT();

    // RMS + peak from waveform
    let sumSq = 0;
    let rawPeak = 0;
    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i];
      sumSq += v * v;
      const abs = v < 0 ? -v : v;
      if (abs > rawPeak) rawPeak = abs;
    }
    const rawRms = Math.sqrt(sumSq / waveform.length);

    // Band energies from FFT (convert dB to linear 0..1)
    let sub = 0, bass = 0, mid = 0, high = 0;
    const halfBins = fft.length >> 1; // Only use first half (Nyquist)
    for (let i = 0; i < halfBins; i++) {
      const v = Math.max(0, (fft[i] + 100) / 100); // dB → 0..1
      if (i < SUB_END) sub += v;
      else if (i < BASS_END) bass += v;
      else if (i < MID_END) mid += v;
      else high += v;
    }
    sub /= SUB_END;
    bass /= (BASS_END - SUB_END);
    mid /= (MID_END - BASS_END);
    high /= (halfBins - MID_END);

    // Smooth all values
    const s = SMOOTHING;
    this.smoothRms = this.smoothRms * (1 - s) + rawRms * s;
    this.smoothPeak = this.smoothPeak * (1 - s) + rawPeak * s;
    this.smoothSub = this.smoothSub * (1 - s) + sub * s;
    this.smoothBass = this.smoothBass * (1 - s) + bass * s;
    this.smoothMid = this.smoothMid * (1 - s) + mid * s;
    this.smoothHigh = this.smoothHigh * (1 - s) + high * s;

    // Beat detection: bass+sub energy vs running average
    const beatEnergy = sub + bass;
    this.energyHistory.push(beatEnergy);
    if (this.energyHistory.length > ENERGY_HISTORY_LEN) {
      this.energyHistory.shift();
    }
    let avgEnergy = 0;
    for (let i = 0; i < this.energyHistory.length; i++) {
      avgEnergy += this.energyHistory[i];
    }
    avgEnergy /= this.energyHistory.length;

    const beat =
      this.energyHistory.length >= 10 &&
      beatEnergy > avgEnergy * BEAT_THRESHOLD &&
      now - this.lastBeatTime > BEAT_COOLDOWN_MS;

    if (beat) this.lastBeatTime = now;

    // Update frame
    this.frame.waveform = waveform;
    this.frame.fft = fft;
    this.frame.rms = this.smoothRms;
    this.frame.peak = this.smoothPeak;
    this.frame.subEnergy = this.smoothSub;
    this.frame.bassEnergy = this.smoothBass;
    this.frame.midEnergy = this.smoothMid;
    this.frame.highEnergy = this.smoothHigh;
    this.frame.beat = beat;
    this.frame.time = (now - this.startTime) / 1000;
    this.frame.deltaTime = dt;

    return this.frame;
  }

  /** Get the last computed frame without recalculating. */
  getFrame(): VJAudioFrame {
    return this.frame;
  }
}
