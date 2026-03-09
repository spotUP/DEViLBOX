/**
 * SilenceDetector - Monitors an audio node for sustained silence
 *
 * Uses an AnalyserNode to periodically check RMS level. When silence
 * (below threshold) persists for `silenceDuration` seconds, triggers
 * a fade-out on the connected GainNode and calls the onSilence callback.
 *
 * Designed for looping chiptune formats (KSS, GBS, NSF, HES, SC68, etc.)
 * that loop infinitely and have no song-end signal.
 */

const SILENCE_THRESHOLD = 0.0005;  // RMS below this = silence
const SILENCE_DURATION_S = 5;      // seconds of silence before triggering
const FADE_DURATION_S = 2;         // fade-out length
const POLL_INTERVAL_MS = 250;      // check 4x per second

export class SilenceDetector {
  private analyser: AnalyserNode;
  private timeDomainData: Float32Array<ArrayBuffer>;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private silentSamples = 0;
  private triggered = false;
  private onSilence: (() => void) | null = null;
  private gainNode: GainNode | null = null;
  private sampleRate: number;

  constructor(context: AudioContext | BaseAudioContext) {
    this.analyser = (context as AudioContext).createAnalyser();
    this.analyser.fftSize = 2048;
    this.timeDomainData = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
    this.sampleRate = context.sampleRate;
  }

  /**
   * Start monitoring. Connect source → analyser (tapped, not interrupting).
   * When silence detected, fade out gainNode and call onSilence.
   */
  start(source: AudioNode, gainNode: GainNode, onSilence: () => void): void {
    this.stop();
    this.gainNode = gainNode;
    this.onSilence = onSilence;
    this.silentSamples = 0;
    this.triggered = false;

    // Tap the source (analyser doesn't produce output, just monitors)
    source.connect(this.analyser);

    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    try { this.analyser.disconnect(); } catch { /* already disconnected */ }
    this.silentSamples = 0;
    this.triggered = false;
  }

  private poll(): void {
    if (this.triggered) return;

    this.analyser.getFloatTimeDomainData(this.timeDomainData);

    // Compute RMS
    let sumSq = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const v = this.timeDomainData[i];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.timeDomainData.length);

    if (rms < SILENCE_THRESHOLD) {
      this.silentSamples += (POLL_INTERVAL_MS / 1000) * this.sampleRate;
      const silentSeconds = this.silentSamples / this.sampleRate;

      if (silentSeconds >= SILENCE_DURATION_S) {
        this.triggered = true;
        this.fadeOutAndStop();
      }
    } else {
      this.silentSamples = 0;
    }
  }

  private fadeOutAndStop(): void {
    if (this.gainNode) {
      const now = this.gainNode.context.currentTime;
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(0, now + FADE_DURATION_S);
    }

    // Call onSilence after fade completes
    setTimeout(() => {
      this.onSilence?.();
      this.stop();
    }, FADE_DURATION_S * 1000);
  }

  dispose(): void {
    this.stop();
    this.onSilence = null;  // Prevent pending setTimeout callbacks from firing
    this.gainNode = null;
  }
}
