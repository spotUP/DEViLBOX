/**
 * DeckScratchBuffer — Unified ring-buffer capture + bidirectional playback.
 *
 * Architecture (terminatorX-inspired):
 *   - CaptureNode continuously writes the tracker's audio into a ring buffer
 *   - PlaybackNode reads the ring buffer at a signed rate with cubic Hermite
 *     interpolation, per-sample rate smoothing, and zero-crossing fades
 *   - During scratch, ALL audio comes from the ring buffer (live tracker muted)
 *   - No forward/backward path switching — rate sign determines direction
 *
 * Loads scratch-buffer.worklet.js (two processors sharing module-level ring buffers).
 * One instance per deck. bufferId 0 = Deck A, bufferId 1 = Deck B.
 *
 * Gain transitions use 3ms linearRamp for click-free on/off.
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@/utils/audio-context';

/** Gain ramp time for click-free transitions (seconds) */
const GAIN_RAMP_SEC = 0.003;

export class DeckScratchBuffer {
  private captureNode!: AudioWorkletNode;
  private playbackNode!: AudioWorkletNode;
  /** GainNode (0 = silent, 1 = active). Wired to master input. */
  playbackGain!: GainNode;

  private initialized = false;

  // Deduplicate addModule calls per AudioContext instance
  private static loadedCtxs   = new WeakSet<AudioContext>();
  private static initPromises = new WeakMap<AudioContext, Promise<void>>();

  private readonly ctx: AudioContext;
  private readonly bufferId: number;

  constructor(ctx: AudioContext, bufferId: number) {
    this.ctx = ctx;
    this.bufferId = bufferId;
  }

  async init(): Promise<void> {
    if (!DeckScratchBuffer.loadedCtxs.has(this.ctx)) {
      let p = DeckScratchBuffer.initPromises.get(this.ctx);
      if (!p) {
        const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
        p = this.ctx.audioWorklet.addModule(`${base}worklets/scratch-buffer.worklet.js`);
        DeckScratchBuffer.initPromises.set(this.ctx, p);
      }
      await p;
      DeckScratchBuffer.loadedCtxs.add(this.ctx);
    }

    const sharedOpts: AudioWorkletNodeOptions = {
      processorOptions: { bufferId: this.bufferId },
      channelCount: 2,
      channelCountMode: 'explicit' as ChannelCountMode,
    };

    this.captureNode = new AudioWorkletNode(this.ctx, 'scratch-capture', {
      ...sharedOpts,
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.playbackNode = new AudioWorkletNode(this.ctx, 'scratch-reverse', {
      ...sharedOpts,
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.playbackNode.port.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === 'debug-playback') {
        console.log(
          `[ScratchPlayback ${this.bufferId}] readPos=${Math.floor(d.readPos)} ` +
          `rate=${d.smoothRate.toFixed(3)} target=${d.targetRate.toFixed(3)}`
        );
      }
    };

    this.playbackGain = this.ctx.createGain();
    this.playbackGain.gain.value = 0;
    this.playbackNode.connect(this.playbackGain);

    this.initialized = true;
  }

  /**
   * Tap filter output into captureNode and wire playbackGain into channelGain.
   * Call once after init().
   */
  wireIntoChain(filter: Tone.Filter, channelGain: Tone.Gain): void {
    if (!this.initialized) return;

    const nativeFilter  = getNativeAudioNode(filter  as unknown as Record<string, unknown>);
    const nativeChannel = getNativeAudioNode(channelGain as unknown as Record<string, unknown>);

    if (!nativeFilter || !nativeChannel) {
      console.warn('[DeckScratchBuffer] Could not get native nodes; scratch disabled');
      return;
    }

    nativeFilter.connect(this.captureNode);
    this.playbackGain.connect(nativeChannel);
  }

  // ==========================================================================
  // CAPTURE CONTROL
  // ==========================================================================

  /** Freeze capture — stops writing so the buffer becomes a fixed record. */
  freezeCapture(): void {
    if (!this.initialized) return;
    this.captureNode.port.postMessage({ type: 'freeze' });
  }

  /** Unfreeze capture — resumes writing to the buffer. */
  unfreezeCapture(): void {
    if (!this.initialized) return;
    this.captureNode.port.postMessage({ type: 'unfreeze' });
  }

  // ==========================================================================
  // UNIFIED SCRATCH API
  //
  // startScratch() → setScratchRate() → stopScratch()
  //
  // Rate is SIGNED: +1.0 = normal forward, -1.0 = backward, 0 = stopped.
  // The worklet handles interpolation, smoothing, and zero-crossing fades.
  // ==========================================================================

  /**
   * Begin scratch playback. Freezes capture, starts reading from near the
   * current write position with forward headroom.
   *
   * @param rate Initial signed rate (+1.0 = normal speed forward)
   */
  startScratch(rate: number): void {
    if (!this.initialized) return;
    this.freezeCapture();

    // Ramp gain up (click-free)
    const now = this.ctx.currentTime;
    this.playbackGain.gain.cancelScheduledValues(now);
    this.playbackGain.gain.setValueAtTime(this.playbackGain.gain.value, now);
    this.playbackGain.gain.linearRampToValueAtTime(1, now + GAIN_RAMP_SEC);

    // Start from the current write position — worklet reads shared state directly
    this.playbackNode.port.postMessage({ type: 'startFromWrite', rate });
  }

  /**
   * Update scratch rate (signed). The worklet applies per-sample smoothing
   * with cubic Hermite interpolation for alias-free, click-free playback.
   */
  setScratchRate(rate: number): void {
    if (!this.initialized) return;
    this.playbackNode.port.postMessage({ type: 'setRate', rate });
  }

  /**
   * Snap rate immediately (no smoothing). Use for initial scratch engage
   * when the first rate value should be applied instantly.
   */
  snapScratchRate(rate: number): void {
    if (!this.initialized) return;
    this.playbackNode.port.postMessage({ type: 'snapRate', rate });
  }

  /**
   * Stop scratch playback. Ramps gain down, stops worklet, unfreezes capture.
   * Returns a promise that resolves with the number of frames the read position
   * moved backward from the start position (for seek-back estimation).
   */
  stopScratch(): Promise<number> {
    if (!this.initialized) return Promise.resolve(0);

    // Ramp gain down (click-free)
    const now = this.ctx.currentTime;
    this.playbackGain.gain.cancelScheduledValues(now);
    this.playbackGain.gain.setValueAtTime(this.playbackGain.gain.value, now);
    this.playbackGain.gain.linearRampToValueAtTime(0, now + GAIN_RAMP_SEC);

    return new Promise<number>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === 'stopped') {
          this.playbackNode.port.removeEventListener('message', handler);
          resolve(e.data.framesBack as number);
        }
      };
      this.playbackNode.port.addEventListener('message', handler);

      // Schedule stop after gain ramp completes
      setTimeout(() => {
        this.playbackNode.port.postMessage({ type: 'stop' });
        this.unfreezeCapture();
      }, GAIN_RAMP_SEC * 1000 + 1);
    });
  }

  /**
   * Force-silence and stop immediately (used when transport stops externally).
   */
  silenceAndStop(): void {
    if (!this.initialized) return;
    this.playbackNode.port.postMessage({ type: 'setRate', rate: 0 });
    // Immediate silence (transport is stopping, no listener for ramp tail)
    const now = this.ctx.currentTime;
    this.playbackGain.gain.cancelScheduledValues(now);
    this.playbackGain.gain.setValueAtTime(0, now);
    this.playbackNode.port.postMessage({ type: 'stop' });
    this.unfreezeCapture();
  }

  // ==========================================================================
  // LEGACY COMPAT — these map to the unified API for any callers not yet updated
  // ==========================================================================

  startScratchPlayback(rate: number): void { this.startScratch(rate); }
  stopScratchPlayback(): void { void this.stopScratch(); }
  startReverseFromWritePos(rate: number): void { this.startScratch(-Math.abs(rate)); }
  startReverse(rate: number): void { this.startScratch(-Math.abs(rate)); }
  setRate(rate: number): void { this.setScratchRate(rate); }
  stopReverse(): Promise<number> { return this.stopScratch(); }

  dispose(): void {
    try { this.captureNode?.disconnect(); } catch { /* ignore */ }
    try { this.playbackNode?.disconnect(); } catch { /* ignore */ }
    try { this.playbackGain?.disconnect(); } catch { /* ignore */ }
  }
}
