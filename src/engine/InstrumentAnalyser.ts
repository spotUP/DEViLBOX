/**
 * InstrumentAnalyser - Per-instrument audio analysis wrapper
 * Provides low-latency waveform and FFT data for visualization
 *
 * PERFORMANCE CONSIDERATIONS:
 * - Uses 256 samples for waveform (low latency, ~5.8ms at 44.1kHz)
 * - Uses 1024 bins for FFT (frequency detail)
 * - Lazy-created: only exists when visualization is visible
 * - Disposed when components unmount
 */

import * as Tone from 'tone';

export class InstrumentAnalyser {
  public input: Tone.Gain;
  public output: Tone.Gain;
  public analyser: Tone.Analyser;
  public fft: Tone.FFT;

  private disposed: boolean = false;

  // Cached arrays to avoid allocations during animation frames
  private cachedWaveform: Float32Array | null = null;
  private cachedFFT: Float32Array | null = null;

  constructor() {
    // Input gain (where instrument connects)
    this.input = new Tone.Gain(1);

    // Output gain (connects to destination/channel)
    this.output = new Tone.Gain(1);

    // Waveform analyser - 256 samples for low latency
    this.analyser = new Tone.Analyser('waveform', 256);

    // FFT analyser - 1024 bins for frequency detail
    this.fft = new Tone.FFT(1024);

    // Connect: input → analyser → fft → output
    this.input.connect(this.analyser);
    this.input.connect(this.fft);
    this.input.connect(this.output);
  }

  /**
   * Get current waveform data
   * Returns Float32Array of normalized samples (-1 to 1)
   */
  getWaveform(): Float32Array {
    if (this.disposed) {
      return this.cachedWaveform || new Float32Array(256);
    }

    const values = this.analyser.getValue() as Float32Array;

    // Cache the result
    if (!this.cachedWaveform || this.cachedWaveform.length !== values.length) {
      this.cachedWaveform = new Float32Array(values.length);
    }
    this.cachedWaveform.set(values);

    return this.cachedWaveform;
  }

  /**
   * Get current FFT data
   * Returns Float32Array of dB values (typically -100 to 0)
   */
  getFFT(): Float32Array {
    if (this.disposed) {
      return this.cachedFFT || new Float32Array(1024);
    }

    const values = this.fft.getValue() as Float32Array;

    // Cache the result
    if (!this.cachedFFT || this.cachedFFT.length !== values.length) {
      this.cachedFFT = new Float32Array(values.length);
    }
    this.cachedFFT.set(values);

    return this.cachedFFT;
  }

  /**
   * Get RMS level (for VU meters)
   * Returns value 0-1
   */
  getLevel(): number {
    if (this.disposed) return 0;

    const waveform = this.getWaveform();
    let sum = 0;
    for (let i = 0; i < waveform.length; i++) {
      sum += waveform[i] * waveform[i];
    }
    return Math.sqrt(sum / waveform.length);
  }

  /**
   * Get peak level (for peak meters)
   * Returns value 0-1
   */
  getPeak(): number {
    if (this.disposed) return 0;

    const waveform = this.getWaveform();
    let max = 0;
    for (let i = 0; i < waveform.length; i++) {
      const abs = Math.abs(waveform[i]);
      if (abs > max) max = abs;
    }
    return max;
  }

  /**
   * Check if there's any audio activity
   * Useful for idle detection
   */
  hasActivity(): boolean {
    return this.getPeak() > 0.001;
  }

  /**
   * Connect an instrument to this analyser
   */
  connectInstrument(instrument: Tone.ToneAudioNode): void {
    if (this.disposed) return;
    instrument.connect(this.input);
  }

  /**
   * Disconnect an instrument from this analyser
   */
  disconnectInstrument(instrument: Tone.ToneAudioNode): void {
    if (this.disposed) return;
    try {
      instrument.disconnect(this.input);
    } catch {
      // Ignore disconnect errors
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    try {
      this.input.disconnect();
      this.analyser.disconnect();
      this.fft.disconnect();
      this.output.disconnect();

      this.input.dispose();
      this.output.dispose();
      this.analyser.dispose();
      this.fft.dispose();
    } catch {
      // Ignore disposal errors
    }

    this.cachedWaveform = null;
    this.cachedFFT = null;
  }
}
