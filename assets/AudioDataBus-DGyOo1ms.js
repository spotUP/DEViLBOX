import { getContext, getDestination } from "./vendor-tone-48TQc1H3.js";
const FFT_SIZE = 2048;
const SUB_END = 3;
const BASS_END = 12;
const MID_END = 186;
const SMOOTHING = 0.6;
const BEAT_THRESHOLD = 1.3;
const BEAT_COOLDOWN_MS = 100;
const ENERGY_HISTORY_LEN = 43;
let sharedWaveformAnalyser = null;
let sharedFFTAnalyser = null;
let sharedRefCount = 0;
function acquireAnalysers() {
  var _a;
  if (sharedRefCount === 0 || !sharedWaveformAnalyser || !sharedFFTAnalyser) {
    const toneCtx = getContext();
    const ctx = toneCtx.rawContext ?? toneCtx._context ?? toneCtx;
    const dest = getDestination();
    const destInput = ((_a = dest.output) == null ? void 0 : _a.input) ?? dest._gainNode ?? dest.input;
    if (!destInput) {
      throw new Error("[AudioDataBus] Cannot find Tone.Destination native input node");
    }
    sharedWaveformAnalyser = ctx.createAnalyser();
    sharedWaveformAnalyser.fftSize = FFT_SIZE;
    sharedWaveformAnalyser.smoothingTimeConstant = 0;
    sharedFFTAnalyser = ctx.createAnalyser();
    sharedFFTAnalyser.fftSize = FFT_SIZE;
    sharedFFTAnalyser.smoothingTimeConstant = 0.4;
    destInput.connect(sharedWaveformAnalyser);
    destInput.connect(sharedFFTAnalyser);
  }
  sharedRefCount++;
  return { waveform: sharedWaveformAnalyser, fft: sharedFFTAnalyser };
}
function releaseAnalysers() {
  sharedRefCount--;
  if (sharedRefCount <= 0) {
    sharedRefCount = 0;
    try {
      sharedWaveformAnalyser == null ? void 0 : sharedWaveformAnalyser.disconnect();
    } catch {
    }
    try {
      sharedFFTAnalyser == null ? void 0 : sharedFFTAnalyser.disconnect();
    } catch {
    }
    sharedWaveformAnalyser = null;
    sharedFFTAnalyser = null;
  }
}
class AudioDataBus {
  startTime = performance.now();
  lastTime = performance.now();
  smoothRms = 0;
  smoothPeak = 0;
  smoothSub = 0;
  smoothBass = 0;
  smoothMid = 0;
  smoothHigh = 0;
  energyHistory = [];
  lastBeatTime = 0;
  enabled = false;
  waveformAnalyser = null;
  fftAnalyser = null;
  // Pre-allocated typed arrays (avoid GC pressure in render loop)
  waveformBuf = new Float32Array(FFT_SIZE);
  fftBuf = new Float32Array(FFT_SIZE / 2);
  frame = {
    waveform: new Float32Array(FFT_SIZE),
    fft: new Float32Array(FFT_SIZE / 2),
    rms: 0,
    peak: 0,
    subEnergy: 0,
    bassEnergy: 0,
    midEnergy: 0,
    highEnergy: 0,
    beat: false,
    time: 0,
    deltaTime: 0
  };
  _retryCount = 0;
  static MAX_RETRIES = 10;
  enable() {
    if (!this.enabled) {
      try {
        const analysers = acquireAnalysers();
        this.waveformAnalyser = analysers.waveform;
        this.fftAnalyser = analysers.fft;
        this.enabled = true;
        this._retryCount = 0;
      } catch (e) {
        console.warn("[AudioDataBus] Failed to acquire analysers, will retry on next update():", e);
        this.enabled = true;
      }
    }
  }
  disable() {
    if (this.enabled) {
      releaseAnalysers();
      this.waveformAnalyser = null;
      this.fftAnalyser = null;
      this.enabled = false;
    }
  }
  /** Call once per rAF frame. Returns the current audio frame. */
  update() {
    const now = performance.now();
    const dt = Math.max(1e-3, Math.min((now - this.lastTime) / 1e3, 0.1));
    this.lastTime = now;
    if (this.enabled && (!this.waveformAnalyser || !this.fftAnalyser)) {
      if (this._retryCount < AudioDataBus.MAX_RETRIES) {
        this._retryCount++;
        try {
          const analysers = acquireAnalysers();
          this.waveformAnalyser = analysers.waveform;
          this.fftAnalyser = analysers.fft;
          this._retryCount = 0;
        } catch {
          this._injectIdleNoise();
          this.frame.time = now / 1e3;
          this.frame.deltaTime = dt;
          return this.frame;
        }
      } else {
        this._injectIdleNoise();
        this.frame.time = now / 1e3;
        this.frame.deltaTime = dt;
        return this.frame;
      }
    }
    if (!this.waveformAnalyser || !this.fftAnalyser) return this.frame;
    this.waveformAnalyser.getFloatTimeDomainData(this.waveformBuf);
    this.fftAnalyser.getFloatFrequencyData(this.fftBuf);
    const waveform = this.waveformBuf;
    const fft = this.fftBuf;
    let sumSq = 0;
    let rawPeak = 0;
    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i];
      sumSq += v * v;
      const abs = v < 0 ? -v : v;
      if (abs > rawPeak) rawPeak = abs;
    }
    const rawRms = Math.sqrt(sumSq / waveform.length);
    if (rawRms < 1e-4 && rawPeak < 1e-4) {
      this._injectIdleNoise();
    }
    let sub = 0, bass = 0, mid = 0, high = 0;
    let subPk = 0, bassPk = 0, midPk = 0, highPk = 0;
    const halfBins = fft.length;
    for (let i = 0; i < halfBins; i++) {
      const v = Math.max(0, (fft[i] + 80) / 80);
      if (i < SUB_END) {
        sub += v;
        if (v > subPk) subPk = v;
      } else if (i < BASS_END) {
        bass += v;
        if (v > bassPk) bassPk = v;
      } else if (i < MID_END) {
        mid += v;
        if (v > midPk) midPk = v;
      } else {
        high += v;
        if (v > highPk) highPk = v;
      }
    }
    sub = subPk * 0.6 + sub / SUB_END * 0.4;
    bass = bassPk * 0.6 + bass / (BASS_END - SUB_END) * 0.4;
    mid = midPk * 0.6 + mid / (MID_END - BASS_END) * 0.4;
    high = highPk * 0.6 + high / (halfBins - MID_END) * 0.4;
    const boost = 1.8;
    sub = Math.min(1, sub * boost);
    bass = Math.min(1, bass * boost);
    mid = Math.min(1, mid * boost);
    high = Math.min(1, high * boost);
    const s = SMOOTHING;
    this.smoothRms = this.smoothRms * (1 - s) + rawRms * s;
    this.smoothPeak = this.smoothPeak * (1 - s) + rawPeak * s;
    this.smoothSub = this.smoothSub * (1 - s) + sub * s;
    this.smoothBass = this.smoothBass * (1 - s) + bass * s;
    this.smoothMid = this.smoothMid * (1 - s) + mid * s;
    this.smoothHigh = this.smoothHigh * (1 - s) + high * s;
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
    const beat = this.energyHistory.length >= 10 && beatEnergy > avgEnergy * BEAT_THRESHOLD && now - this.lastBeatTime > BEAT_COOLDOWN_MS;
    if (beat) this.lastBeatTime = now;
    this.frame.waveform = waveform;
    this.frame.fft = fft;
    this.frame.rms = this.smoothRms;
    this.frame.peak = this.smoothPeak;
    this.frame.subEnergy = this.smoothSub;
    this.frame.bassEnergy = this.smoothBass;
    this.frame.midEnergy = this.smoothMid;
    this.frame.highEnergy = this.smoothHigh;
    this.frame.beat = beat;
    this.frame.time = (now - this.startTime) / 1e3;
    this.frame.deltaTime = dt;
    return this.frame;
  }
  /** Get the last computed frame without recalculating. */
  getFrame() {
    return this.frame;
  }
  /** Inject low-amplitude noise into waveformBuf so ProjectM keeps animating during silence */
  _injectIdleNoise() {
    const buf = this.waveformBuf;
    for (let i = 0; i < buf.length; i++) {
      buf[i] = (Math.random() - 0.5) * 2e-3;
    }
    this.frame.waveform = buf;
  }
  // ─── Global shared instance for MCP / non-VJ consumers ─────────────────────
  static _shared = null;
  /** Get or create a shared global AudioDataBus instance. */
  static getShared() {
    if (!AudioDataBus._shared) {
      AudioDataBus._shared = new AudioDataBus();
      AudioDataBus._shared.enable();
    }
    return AudioDataBus._shared;
  }
}
export {
  AudioDataBus as A
};
