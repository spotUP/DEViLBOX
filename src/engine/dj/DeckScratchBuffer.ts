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
 * 1. AUDIOPARAM RATE CONTROL: Uses AudioParam ('rate') instead of postMessage
 *    for sample-accurate rate updates with zero message latency.
 *    (reference: InterlockedExchange for lock-free atomic speed updates)
 *
 * 2. SMOOTH RATE TRANSITIONS: linearRampToValueAtTime with 5ms ramp eliminates
 *    clicks at speed change boundaries.
 *    (reference: smooth position accumulator handles rate changes naturally)
 *
 * 3. LINEAR INTERPOLATION + ANTI-ALIAS: handled in the worklet process() loop.
 *    (reference: lerp between floor/ceil samples + pre-filtered buffer)
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

/** Duration (seconds) for rate-change ramps. Short enough to feel instant,
 *  long enough to prevent clicks from step discontinuities. */
const RATE_RAMP_SEC = 0.005;

export class DeckScratchBuffer {
  private captureNode!: AudioWorkletNode;
  private playbackNode!: AudioWorkletNode;
  /** Direct reference to the 'rate' AudioParam on the playback processor.
   *  Sample-accurate, eliminates postMessage latency for rate changes. */
  private rateParam: AudioParam | null = null;
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
      }
    };

    this.playbackNode = new AudioWorkletNode(this.ctx, 'scratch-reverse', {
      ...sharedOpts,
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Grab the rate AudioParam for sample-accurate rate control
    this.rateParam = this.playbackNode.parameters.get('rate') ?? null;

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
  // RATE CONTROL — dual path for robustness
  //
  // PRIMARY: AudioParam 'rate' (sample-accurate, zero latency, smooth ramps)
  // FALLBACK: postMessage 'setRate' (always sent, works even if AudioParam
  //           is unavailable due to worklet caching or browser quirks)
  //
  // The worklet process() prefers AudioParam when it's non-zero, otherwise
  // falls back to the message-based rate.
  // ==========================================================================

  /** Set rate via AudioParam (smooth ramp) + postMessage (fallback). */
  private _setRate(rate: number): void {
    // AudioParam path — sample-accurate with smooth ramp
    if (this.rateParam) {
      const now = this.ctx.currentTime;
      this.rateParam.cancelScheduledValues(now);
      this.rateParam.setValueAtTime(this.rateParam.value, now);
      this.rateParam.linearRampToValueAtTime(rate, now + RATE_RAMP_SEC);
    }
    // postMessage fallback — always send so worklet works even without AudioParam
    this.playbackNode.port.postMessage({ type: 'setRate', rate });
  }

  /** Set rate instantly (no ramp) + postMessage fallback. */
  private _setRateInstant(rate: number): void {
    if (this.rateParam) {
      const now = this.ctx.currentTime;
      this.rateParam.cancelScheduledValues(now);
      this.rateParam.setValueAtTime(rate, now);
    }
    this.playbackNode.port.postMessage({ type: 'setRate', rate });
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

    // Set rate via AudioParam BEFORE activating (instant, no ramp for initial start)
    this._setRateInstant(rate);

    this.playbackGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.playbackGain.gain.setValueAtTime(1, this.ctx.currentTime);
    // Include rate in start message as fallback for worklet
    this.playbackNode.port.postMessage({ type: 'start', startPos, rate });
  }

  /**
   * Update playback rate (signed: positive = forward, negative = backward).
   * Uses AudioParam with a 5ms ramp for click-free speed transitions.
   */
  setScratchRate(rate: number): void {
    if (!this.initialized) return;
    this._setRate(rate);
  }

  /** Stop scratch playback and unfreeze capture. Non-blocking. */
  stopScratchPlayback(): void {
    if (!this.initialized) return;
    // Zero rate before stopping for clean tail (both paths)
    this._setRateInstant(0);
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
    // Set rate via AudioParam (instant, no ramp for initial start)
    this._setRateInstant(negRate);
    this.playbackGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.playbackGain.gain.setValueAtTime(1, this.ctx.currentTime);
    this.playbackNode.port.postMessage({
      type: 'start',
      startPos: this.currentWritePos,
      rate: negRate,
    });
  }

  /** Update rate for jog wheel backward scratch (always negative). */
  setRate(rate: number): void {
    if (!this.initialized) return;
    this._setRate(-Math.abs(rate));
  }

  /** Immediately silence and stop. Non-blocking. */
  silenceAndStop(): void {
    if (!this.initialized) return;
    this._setRateInstant(0);  // zeros both AudioParam + postMessage
    this.playbackGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.playbackGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.playbackNode.port.postMessage({ type: 'stop' });
  }

  /** Silences playbackGain and resolves with frames played backward (for seek estimation). */
  stopReverse(): Promise<number> {
    if (!this.initialized) return Promise.resolve(0);

    this._setRateInstant(0);  // zeros both AudioParam + postMessage
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
