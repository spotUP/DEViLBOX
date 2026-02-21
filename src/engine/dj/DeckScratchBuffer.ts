/**
 * DeckScratchBuffer - Ring-buffer capture + bidirectional playback for DJ scratch.
 *
 * The ring buffer IS the vinyl record. Audio is continuously captured into it.
 * During scratch, the capture freezes and the playback processor scrubs through
 * the buffer at a signed rate: positive = forward, negative = backward.
 *
 * Loads scratch-buffer.worklet.js (two processors sharing module-level ring buffers).
 * One instance per deck. bufferId 0 = Deck A, bufferId 1 = Deck B.
 *
 * IMPROVEMENTS (inspired by DJ-Scratch-Sample reference implementation):
 *
 * 1. LINEAR INTERPOLATION: handled in the worklet process() loop — eliminates
 *    staircase artifacts from nearest-neighbor sampling.
 *    (reference: lerp between floor/ceil samples in SoundRenderer.cpp)
 *
 * 2. RATE SMOOTHING: 2ms exponential smoothing in the worklet prevents clicks
 *    at rate/direction transitions (e.g. forward→backward in Baby Scratch).
 *    (reference: smooth position accumulator handles rate changes naturally)
 *
 * Audio chain wiring (call wireIntoChain once after init):
 *   filter ──→ captureNode  (taps audio into ring buffer; output unconnected)
 *   playbackNode ──→ playbackGain ──→ channelGain  (injected into chain when active)
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@/utils/audio-context';

/** Seconds of buffer to start behind the write position for pattern scratch.
 *  Gives forward headroom while keeping audio contextually recent. */
const PATTERN_START_OFFSET_SEC = 3;

export class DeckScratchBuffer {
  private captureNode!: AudioWorkletNode;
  private playbackNode!: AudioWorkletNode;
  /** GainNode (0 = silent, 1 = active). Wired to channelGain input. */
  playbackGain!: GainNode;

  private currentWritePos = 0;
  private initialized = false;

  // Deduplicate addModule calls per AudioContext instance
  private static loadedCtxs   = new WeakSet<AudioContext>();
  private static initPromises = new WeakMap<AudioContext, Promise<void>>();

  private readonly ctx: AudioContext;
  private readonly bufferId: 0 | 1;

  constructor(ctx: AudioContext, bufferId: 0 | 1) {
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
    this.captureNode.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'writePos') {
        this.currentWritePos = e.data.pos as number;
      } else if (e.data.type === 'debug-freeze') {
        const d = e.data;
        console.log(
          `[ScratchCapture ${this.bufferId}] FREEZE writePos=${d.writePos} ` +
          `nonZero=${d.nonZeroInLast1s}/${d.checkedFrames} peak=${d.peakBeforeFreeze.toFixed(4)}`
        );
      }
    };

    this.playbackNode = new AudioWorkletNode(this.ctx, 'scratch-reverse', {
      ...sharedOpts,
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.playbackNode.port.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === 'debug-start') {
        console.log(
          `[ScratchPlayback ${this.bufferId}] START pos=${d.startPos} rate=${d.rate} ` +
          `nonZero=${d.nonZeroAroundStart}/${d.checkedFrames} peak=${d.peakAroundStart.toFixed(4)} ` +
          `sampleAt0={L:${d.sampleAt0.L.toFixed(6)}, R:${d.sampleAt0.R.toFixed(6)}}`
        );
      } else if (d.type === 'debug-playback') {
        console.log(
          `[ScratchPlayback ${this.bufferId}] readPos=${Math.floor(d.readPos)} ` +
          `rate=${d.smoothRate.toFixed(3)} target=${d.targetRate.toFixed(3)} ` +
          `outPeak=${d.outPeak.toFixed(4)} samples=[${
            d.samplesAroundPos.map(
              (s: {L: number; R: number}) => `${s.L.toFixed(4)}`
            ).join(',')
          }]`
        );
      } else if (d.type === 'stopped') {
        // Existing handler will catch this via addEventListener if needed
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

    // Tap: filter output → captureNode (capture output not connected to anything)
    nativeFilter.connect(this.captureNode);
    // Inject: playbackNode → playbackGain → channelGain
    this.playbackGain.connect(nativeChannel);
  }

  // ==========================================================================
  // CAPTURE FREEZE (turn the ring buffer into a fixed "record" during scratch)
  // ==========================================================================

  /** Freeze capture — stops writing to the buffer so it becomes a fixed record. */
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
  // PLAYBACK — bidirectional, signed rate
  // ==========================================================================

  /**
   * Start playback for pattern scratch. Freezes capture first.
   * Starts reading from a position behind the write pos to give forward headroom.
   * @param rate Signed rate: positive = forward, negative = backward
   */
  startScratchPlayback(rate: number): void {
    if (!this.initialized) return;
    this.freezeCapture();

    // Start a few seconds behind the write position so forward pushes
    // have headroom before wrapping into old audio.
    const bufferFrames = Math.round(this.ctx.sampleRate * 45);
    const offset = Math.round(this.ctx.sampleRate * PATTERN_START_OFFSET_SEC);
    const startPos = (this.currentWritePos - offset + bufferFrames) % bufferFrames;

    console.log(
      `[ScratchBuffer ${this.bufferId}] startScratchPlayback rate=${rate} ` +
      `writePos=${this.currentWritePos} startPos=${startPos} offset=${offset} ` +
      `bufferFrames=${bufferFrames} sampleRate=${this.ctx.sampleRate}`
    );

    this.playbackGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.playbackGain.gain.setValueAtTime(1, this.ctx.currentTime);
    // Start message includes rate — worklet snaps to this rate instantly (no ramp)
    this.playbackNode.port.postMessage({ type: 'start', startPos, rate });
  }

  /**
   * Update playback rate (signed: positive = forward, negative = backward).
   * The worklet applies 2ms exponential smoothing for click-free transitions.
   */
  setScratchRate(rate: number): void {
    if (!this.initialized) return;
    this.playbackNode.port.postMessage({ type: 'setRate', rate });
  }

  /** Stop scratch playback and unfreeze capture. Non-blocking. */
  stopScratchPlayback(): void {
    if (!this.initialized) return;
    this.playbackNode.port.postMessage({ type: 'setRate', rate: 0 });
    this.playbackGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.playbackGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.playbackNode.port.postMessage({ type: 'stop' });
    this.unfreezeCapture();
  }

  // ==========================================================================
  // LEGACY — jog wheel backward scratch (uses negative rate internally)
  // ==========================================================================

  /** Start backward-only playback from the current write position (jog wheel). */
  startReverse(rate: number): void {
    if (!this.initialized) return;
    const negRate = -Math.abs(rate);
    this.playbackGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.playbackGain.gain.setValueAtTime(1, this.ctx.currentTime);
    this.playbackNode.port.postMessage({
      type: 'start',
      startPos: this.currentWritePos,
      rate: negRate,
    });
  }

  /**
   * Start backward playback from the worklet's EXACT current write position.
   * Eliminates main-thread writePos staleness (up to 50ms) by reading the
   * shared module-level writePoss[] directly in the audio thread.
   */
  startReverseFromWritePos(rate: number): void {
    if (!this.initialized) return;
    const negRate = -Math.abs(rate);
    this.playbackGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.playbackGain.gain.setValueAtTime(1, this.ctx.currentTime);
    this.playbackNode.port.postMessage({ type: 'startFromWrite', rate: negRate });
  }

  /** Update rate for jog wheel backward scratch (always negative). */
  setRate(rate: number): void {
    if (!this.initialized) return;
    this.playbackNode.port.postMessage({ type: 'setRate', rate: -Math.abs(rate) });
  }

  /** Immediately silence and stop. Non-blocking. */
  silenceAndStop(): void {
    if (!this.initialized) return;
    this.playbackNode.port.postMessage({ type: 'setRate', rate: 0 });
    this.playbackGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.playbackGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.playbackNode.port.postMessage({ type: 'stop' });
  }

  /** Silences playbackGain and resolves with frames played backward (for seek estimation). */
  stopReverse(): Promise<number> {
    if (!this.initialized) return Promise.resolve(0);

    this.playbackNode.port.postMessage({ type: 'setRate', rate: 0 });
    this.playbackGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.playbackGain.gain.setValueAtTime(0, this.ctx.currentTime);

    return new Promise<number>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === 'stopped') {
          this.playbackNode.port.removeEventListener('message', handler);
          resolve(e.data.framesBack as number);
        }
      };
      this.playbackNode.port.addEventListener('message', handler);
      this.playbackNode.port.postMessage({ type: 'stop' });
    });
  }

  dispose(): void {
    try { this.captureNode?.disconnect(); } catch { /* ignore */ }
    try { this.playbackNode?.disconnect(); } catch { /* ignore */ }
    try { this.playbackGain?.disconnect(); } catch { /* ignore */ }
  }
}
