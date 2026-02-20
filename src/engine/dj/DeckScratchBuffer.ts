/**
 * DeckScratchBuffer - Ring-buffer capture + reverse playback for DJ scratch.
 *
 * Loads scratch-buffer.worklet.js (two processors sharing module-level ring buffers).
 * One instance per deck. bufferId 0 = Deck A, bufferId 1 = Deck B.
 *
 * Audio chain wiring (call wireIntoChain once after init):
 *   filter ──→ captureNode  (taps audio into ring buffer; output unconnected)
 *   reverseNode ──→ reverseGain ──→ channelGain  (injected into chain when active)
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@/utils/audio-context';

export class DeckScratchBuffer {
  private captureNode!: AudioWorkletNode;
  private reverseNode!: AudioWorkletNode;
  /** GainNode (0 = silent, 1 = active). Wired to channelGain input. */
  reverseGain!: GainNode;

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

    this.reverseNode = new AudioWorkletNode(this.ctx, 'scratch-reverse', {
      ...sharedOpts,
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.reverseGain = this.ctx.createGain();
    this.reverseGain.gain.value = 0;
    this.reverseNode.connect(this.reverseGain);

    this.initialized = true;
  }

  /**
   * Tap filter output into captureNode and wire reverseGain into channelGain.
   * Call once after init().
   */
  wireIntoChain(filter: Tone.Filter, channelGain: Tone.Gain): void {
    if (!this.initialized) return;

    const nativeFilter  = getNativeAudioNode(filter  as unknown as Record<string, unknown>);
    const nativeChannel = getNativeAudioNode(channelGain as unknown as Record<string, unknown>);

    if (!nativeFilter || !nativeChannel) {
      console.warn('[DeckScratchBuffer] Could not get native nodes; reverse scratch disabled');
      return;
    }

    // Tap: filter output → captureNode (capture output not connected to anything)
    nativeFilter.connect(this.captureNode);
    // Inject: reverseNode → reverseGain → channelGain
    this.reverseGain.connect(nativeChannel);
  }

  startReverse(rate: number): void {
    if (!this.initialized) return;
    this.reverseGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.reverseGain.gain.setValueAtTime(1, this.ctx.currentTime);
    this.reverseNode.port.postMessage({
      type: 'start',
      startPos: this.currentWritePos,
      rate: Math.abs(rate),
    });
  }

  setRate(rate: number): void {
    if (!this.initialized) return;
    this.reverseNode.port.postMessage({ type: 'setRate', rate: Math.abs(rate) });
  }

  /** Silences reverseGain and resolves with frames played backward (for seek estimation). */
  stopReverse(): Promise<number> {
    if (!this.initialized) return Promise.resolve(0);

    this.reverseGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.reverseGain.gain.setValueAtTime(0, this.ctx.currentTime);

    return new Promise<number>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === 'stopped') {
          this.reverseNode.port.removeEventListener('message', handler);
          resolve(e.data.framesBack as number);
        }
      };
      this.reverseNode.port.addEventListener('message', handler);
      this.reverseNode.port.postMessage({ type: 'stop' });
    });
  }

  dispose(): void {
    try { this.captureNode?.disconnect(); } catch { /* ignore */ }
    try { this.reverseNode?.disconnect(); } catch { /* ignore */ }
    try { this.reverseGain?.disconnect(); } catch { /* ignore */ }
  }
}
