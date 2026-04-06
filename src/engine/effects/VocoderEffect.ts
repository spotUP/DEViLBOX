/**
 * VocoderEffect — Channel vocoder as a drop-in Tone.js effect.
 *
 * Thin wrapper around VocoderCore that adds the Tone.ToneAudioNode
 * interface (input/output gains, dry/wet mixing) and source switching
 * between the chain audio and a microphone stream.
 *
 * The actual WASM vocoder, parameter routing, and preset list all live
 * in VocoderCore — the same core class is used by VocoderEngine in the
 * DJ view, so behavior is identical.
 *
 * Two source modes:
 *   - 'self' (default): chain audio is the modulator. The effect output
 *     replaces the chain audio with its vocoded version. No mic needed.
 *   - 'mic': a microphone stream is the modulator. The chain audio still
 *     passes through the dry path, so you hear "synth + your-voice-shaped
 *     vocoder layered on top". Mic permission required on first use.
 */

import * as Tone from 'tone';
import {
  VocoderCore,
  VOCODER_CORE_PRESETS,
  type VocoderCarrierType,
} from '@/engine/vocoder/VocoderCore';

export type { VocoderCarrierType };
export type VocoderSource = 'self' | 'mic';

/** Re-exported preset list — same source of truth as the DJ view vocoder. */
export const VOCODER_EFFECT_PRESETS = VOCODER_CORE_PRESETS;

export interface VocoderEffectOptions {
  source?: VocoderSource;
  bands?: number;
  filtersPerBand?: number;
  carrierType?: VocoderCarrierType;
  carrierFreq?: number;
  formantShift?: number;
  reactionTime?: number;
  wet?: number;
}

/** Extract the underlying native GainNode from a Tone.js Gain wrapper. */
function getRawGainNode(node: Tone.Gain): GainNode {
  const n = node as unknown as Record<string, GainNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as GainNode);
}

export class VocoderEffect extends Tone.ToneAudioNode {
  readonly name = 'VocoderEffect';

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Wet/dry split (TS gain nodes — VocoderCore stays at 100% wet internally)
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // Shared core (owns the worklet + WASM + parameter state)
  private core: VocoderCore;

  // Mic source (only used when source === 'mic')
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micPreamp: GainNode | null = null;

  // Connection state
  private workletConnectedToInput = false;
  private workletConnectedToWet = false;

  private _source: VocoderSource;
  private _wet: number;

  constructor(options: Partial<VocoderEffectOptions> = {}) {
    super();

    this._source = options.source ?? 'self';
    this._wet = options.wet ?? 1.0;

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    // Dry: input → dryGain → output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    // Wet: core.node (inserted by initCore) → wetGain → output
    this.wetGain.connect(this.output);

    const rawContext = Tone.getContext().rawContext as AudioContext;
    this.core = new VocoderCore(rawContext, {
      bands: options.bands,
      filtersPerBand: options.filtersPerBand,
      carrierType: options.carrierType,
      carrierFreq: options.carrierFreq,
      formantShift: options.formantShift,
      reactionTime: options.reactionTime,
    });

    this.initCore().catch((err) => {
      console.warn('[VocoderEffect] init failed:', err);
    });
  }

  // ── Parameter setters (delegate to core) ───────────────────────────────

  setSource(source: VocoderSource): void {
    if (this._source === source) return;
    this._source = source;
    if (this.core.isReady) this.rewireSource();
  }

  setCarrierType(type: VocoderCarrierType): void { this.core.setCarrierType(type); }
  setCarrierFreq(hz: number): void { this.core.setCarrierFreq(hz); }
  setFormantShift(s: number): void { this.core.setFormantShift(s); }
  setReactionTime(t: number): void { this.core.setReactionTime(t); }
  setBands(b: number): void { this.core.setBands(b); }
  setFiltersPerBand(f: number): void { this.core.setFiltersPerBand(f); }
  loadPreset(name: string): void { this.core.loadPreset(name); }

  get wet(): number {
    return this._wet;
  }

  set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  // ── Init ───────────────────────────────────────────────────────────────

  private async initCore(): Promise<void> {
    await this.core.init();
    if (!this.core.node) return;

    const rawContext = Tone.getContext().rawContext as AudioContext;
    const rawWet = getRawGainNode(this.wetGain);

    // Wire core output → wet gain
    try { this.core.node.connect(rawWet); this.workletConnectedToWet = true; } catch (err) {
      console.warn('[VocoderEffect] failed to connect core to wet gain:', err);
    }

    this.rewireSource();

    // Keepalive — ensure the worklet keeps processing even if its
    // output isn't currently routed (e.g., wet=0 or graph trimming).
    const keepalive = rawContext.createGain();
    keepalive.gain.value = 0;
    this.core.node.connect(keepalive);
    keepalive.connect(rawContext.destination);
  }

  // ── Source routing ─────────────────────────────────────────────────────

  /**
   * Wire up the worklet's input depending on the current source mode.
   * Self mode: chain audio → worklet
   * Mic mode:  mic stream → worklet (chain audio still flows through dry path)
   */
  private rewireSource(): void {
    if (!this.core.node) return;
    const rawInput = getRawGainNode(this.input);

    // Tear down existing source connections
    if (this.workletConnectedToInput) {
      try { rawInput.disconnect(this.core.node); } catch { /* ok */ }
      this.workletConnectedToInput = false;
    }
    if (this.micPreamp) {
      try { this.micPreamp.disconnect(this.core.node); } catch { /* ok */ }
    }

    if (this._source === 'self') {
      try {
        rawInput.connect(this.core.node);
        this.workletConnectedToInput = true;
      } catch (err) {
        console.warn('[VocoderEffect] failed to connect chain audio to core:', err);
      }
    } else {
      this.acquireMic().catch((err) => {
        console.warn('[VocoderEffect] mic acquisition failed, falling back to self mode:', err);
        this._source = 'self';
        this.rewireSource();
      });
    }
  }

  private async acquireMic(): Promise<void> {
    if (!this.core.node) return;
    const rawContext = Tone.getContext().rawContext as AudioContext;

    if (!this.micStream) {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    }
    if (!this.micSource) {
      this.micSource = rawContext.createMediaStreamSource(this.micStream);
    }
    if (!this.micPreamp) {
      this.micPreamp = rawContext.createGain();
      this.micPreamp.gain.value = 2.0; // built-in mics tend to be quiet
      this.micSource.connect(this.micPreamp);
    }
    try {
      this.micPreamp.connect(this.core.node);
    } catch { /* may already be connected */ }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  dispose(): this {
    void this.workletConnectedToWet;
    this.core.dispose();
    if (this.micPreamp) {
      try { this.micPreamp.disconnect(); } catch { /* ok */ }
      this.micPreamp = null;
    }
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch { /* ok */ }
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.input.dispose();
    this.output.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    return super.dispose();
  }
}
