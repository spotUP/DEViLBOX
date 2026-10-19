import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

/**
 * DeckKeyLock - pitch-shift insert for a DJ deck's AudioBufferSourceNode
 * (audio / stem) playback path, backed by Signalsmith Stretch.
 *
 * The deck's pitch fader moves `playbackRate`, which shifts tempo and pitch
 * together. With Key Lock on, this insert shifts the pitch back by
 * `computeKeyLockShift().pitchCompensate`, so only the tempo change remains.
 *
 * Engine: Signalsmith Stretch 1.3.2 (MIT, Geraint Luff / Signalsmith Audio),
 * the official WASM / AudioWorklet build vendored unmodified in
 * `public/signalsmith-stretch/`. It replaced SoundTouch (time-domain WSOLA),
 * whose splices doubled and dropped drum hits - the "90s jungle timestretch"
 * the owner heard (2026-10-12). Measured on real songs at playbackRate 0.92 /
 * 1.08 against the unstretched source: drum onset-curve correlation 0.78 /
 * 0.81 (SoundTouch 0.40 / 0.49), sustained-note band jitter 1.21-1.36 dB
 * (SoundTouch 1.86-2.36 dB). Tool + numbers: tools/keylock/.
 *
 * Configuration (chosen by measurement, STRETCH_CONFIG): 80 ms blocks with a
 * 20 ms interval sharpen transients over the 120 ms default preset at a
 * lower latency, split computation spreads the FFT work so no render quantum
 * spikes, and a 20 kHz tonality limit treats the whole band as tonal (the
 * 8 kHz default measured 1.5 dB worse in log-spectral distance).
 *
 * Latency: 100 ms at 48 kHz for this configuration, whatever the pitch. The
 * node reports it after each configure and `latencySec()` hands it to the
 * deck's heard position, so phase locks and visuals follow what the listener
 * hears. Bypass is a direct wire with NO added latency - scratch / cue work
 * on an unlocked deck never pays for the stretcher - and the bypassed node
 * idles (public/signalsmith-stretch/idleWhenBypassed.js).
 *
 * The pitch/tempo math lives in `computeKeyLockShift.ts` (single source).
 */

/** Stretcher geometry - see the class comment for why these values. */
export const STRETCH_CONFIG = { blockMs: 80, intervalMs: 20, splitComputation: true } as const;
/** Upper limit of the band the stretcher treats as tonal, Hz. */
export const TONALITY_HZ = 20000;

/** The AudioWorkletNode the official Signalsmith factory returns, with its remote methods. */
interface StretchNode extends AudioWorkletNode {
  configure(config: typeof STRETCH_CONFIG): Promise<unknown>;
  latency(): Promise<number>;
  schedule(change: { active?: boolean; semitones?: number; tonalityHz?: number }): Promise<unknown>;
}
type CreateStretchNode = (ctx: BaseAudioContext, options: AudioWorkletNodeOptions) => Promise<StretchNode>;

export class DeckKeyLock {
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  /** `input` wires here when bypassed; disconnected when active. */
  private bypassGain: Tone.Gain;

  private stretchNode: StretchNode | null = null;
  private isActive = false;
  /** Last pitch compensation asked for, semitones - applied whenever the stretcher engages. */
  private pitchSemis = 0;
  /** True while the signal runs through the stretcher (not the bypass wire). */
  private routedThroughStretch = false;
  /** Processing latency the stretcher reported for STRETCH_CONFIG, seconds. */
  private stretchLatencySec = 0;

  private static moduleLoads = new Map<BaseAudioContext, Promise<CreateStretchNode>>();

  /**
   * Called after every rewire, i.e. whenever latencySec() may have changed:
   * on engage, on bypass, and when the stretcher finishes loading after the
   * caller already engaged. ToneEngine refreshes its delay compensation here.
   */
  public onLatencyChange: (() => void) | null = null;

  constructor() {
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.bypassGain = new Tone.Gain(1);

    // Default: direct wire. input -> bypassGain -> output. The stretcher stays
    // out of the signal path until setActive(true) swaps it in.
    this.input.connect(this.bypassGain);
    this.bypassGain.connect(this.output);

    void this._initStretcher();
  }

  /**
   * Engage or disengage the pitch-shift insert.
   *
   * On `true`: route input -> stretcher -> output, starting from a reset
   *            stretcher at the last-set pitch compensation.
   * On `false`: restore the direct wire and idle the stretcher.
   */
  setActive(active: boolean): void {
    if (this.isActive === active) return;
    this.isActive = active;
    this.rewire();
  }

  /**
   * Set pitch compensation in semitones. Called by DeckEngine.setPitch when
   * Key Lock is on; value is -semitones (cancels the playbackRate pitch).
   */
  setPitchSemiTones(semitones: number): void {
    this.pitchSemis = semitones;
    if (this.routedThroughStretch && this.stretchNode) {
      void this.stretchNode.schedule({ semitones });
    }
  }

  /**
   * Seconds the key-locked signal lags its input: the stretcher's reported
   * latency while the signal runs through it, 0 on the bypass wire.
   */
  latencySec(): number {
    return this.routedThroughStretch ? this.stretchLatencySec : 0;
  }

  get active(): boolean { return this.isActive; }
  get ready(): boolean { return this.stretchNode !== null; }

  dispose(): void {
    if (this.stretchNode) {
      try { void this.stretchNode.schedule({ active: false }); } catch { /* */ }
      try { this.stretchNode.disconnect(); } catch { /* */ }
      this.stretchNode = null;
    }
    try { this.bypassGain.dispose(); } catch { /* */ }
    try { this.input.dispose(); } catch { /* */ }
    try { this.output.dispose(); } catch { /* */ }
  }

  private rewire(): void {
    try { this.input.disconnect(); } catch { /* */ }
    try { this.bypassGain.disconnect(); } catch { /* */ }
    const rawInput = getNativeAudioNode(this.input);
    const rawOutput = getNativeAudioNode(this.output);
    const node = this.stretchNode;

    if (this.isActive && node && rawInput && rawOutput) {
      try { node.disconnect(); } catch { /* */ }
      // Reset first: nothing from the previous engage (an old track position)
      // may come out of the stretcher's buffers. Port messages run in order.
      void node.configure(STRETCH_CONFIG);
      void node.schedule({ active: true, semitones: this.pitchSemis, tonalityHz: TONALITY_HZ });
      rawInput.connect(node);
      node.connect(rawOutput);
      this.routedThroughStretch = true;
    } else {
      this.routedThroughStretch = false;
      if (node) {
        try { node.disconnect(); } catch { /* */ }
        void node.schedule({ active: false });
      }
      this.input.connect(this.bypassGain);
      this.bypassGain.connect(this.output);
    }
    this.onLatencyChange?.();
  }

  private async _initStretcher(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      const create = await DeckKeyLock.loadModule(rawCtx);
      const node = await create(rawCtx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      await node.configure(STRETCH_CONFIG);
      const latency = await node.latency();
      if (Number.isFinite(latency) && latency >= 0) this.stretchLatencySec = latency;
      this.stretchNode = node;
      // If the caller engaged Key Lock while the stretcher was loading, route now.
      if (this.isActive) this.rewire();
    } catch (err) {
      console.error('[DeckKeyLock] Stretcher init failed, staying on the bypass wire:', err);
    }
  }

  /**
   * Register the worklet once per context and return the official main-thread
   * factory. The factory finds the processor already registered, so it never
   * falls back to its blob-URL copy of the module.
   */
  private static loadModule(ctx: BaseAudioContext): Promise<CreateStretchNode> {
    let p = this.moduleLoads.get(ctx);
    if (!p) {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      // Resolve against the document: a relative BASE_URL (Electron './') would
      // otherwise resolve against this bundled chunk for the dynamic import.
      const url = (file: string) => new URL(`${base}signalsmith-stretch/${file}`, document.baseURI).href;
      p = (async () => {
        await ctx.audioWorklet.addModule(url('DeckKeyLock.worklet.js'));
        const mod = await import(/* @vite-ignore */ url('SignalsmithStretch.mjs')) as { default: CreateStretchNode };
        return mod.default;
      })();
      p.catch(() => this.moduleLoads.delete(ctx));
      this.moduleLoads.set(ctx, p);
    }
    return p;
  }
}
