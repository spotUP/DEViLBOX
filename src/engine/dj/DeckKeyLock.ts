import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

/**
 * DeckKeyLock — SoundTouch-backed pitch-shift insert for a DJ deck's
 * AudioBufferSourceNode (WAV) playback path.
 *
 * Wraps `public/soundtouch/SoundTouch.wasm` (Olli Parviainen's SoundTouch,
 * LGPL-2.1+) as a Tone-compatible insert node. Bypasses by default; attach to
 * the deck's signal chain once and call `setActive(true/false)` as Key Lock
 * toggles. When active, the node compensates for the `playbackRate`-driven
 * pitch shift so only tempo changes audibly.
 *
 * Latency: ~91 ms at 48 kHz (SoundTouch's WSOLA window; 81-95 ms across
 * +-3 semitones). The worklet reports it for the current setting and
 * `latencySec()` hands it to the deck's heard position, so phase locks and
 * visuals follow what the listener hears. Bypass swaps to a direct wire so
 * there's NO added latency when Key Lock is off — important for scratch / cue
 * work where any lag is audible.
 *
 * Per CLAUDE.md regression policy, the pitch/tempo decoupling math lives in
 * `computeKeyLockShift.ts` so the invariant is unit-testable without a
 * real AudioContext.
 */
export class DeckKeyLock {
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  /** `input` wires here when bypassed; disconnected when active. */
  private bypassGain: Tone.Gain;

  /** Raw AudioWorkletNode hosting the SoundTouch WASM processor. */
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private isActive = false;
  /** Pending setter messages queued before WASM loaded. */
  private pendingPitchSemis = 0;
  /** True while the signal runs through the worklet (not the bypass wire). */
  private routedThroughWorklet = false;
  /** Processing latency the worklet last reported, seconds. */
  private reportedLatencySec = 0;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor() {
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.bypassGain = new Tone.Gain(1);

    // Default: direct wire. input → bypassGain → output. Worklet stays out of
    // the signal path until setActive(true) swaps it in.
    this.input.connect(this.bypassGain);
    this.bypassGain.connect(this.output);

    void this._initWorklet();
  }

  /**
   * Engage or disengage the pitch-shift insert.
   *
   * On `true`: disconnect the direct wire, route input → worklet → output,
   *            apply the last-set pitch compensation.
   * On `false`: flush the worklet FIFO, disconnect it, restore the direct
   *             wire. Zero tail, zero lingering latency.
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
    this.pendingPitchSemis = semitones;
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({
        type: 'parameter',
        key: 'pitchSemis',
        value: semitones,
      });
    }
  }

  /** Flush the SoundTouch FIFO. Call before setActive(false) to prevent any
   *  lingering echo when the worklet is removed from the chain. */
  clearBuffer(): void {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'clear' }); } catch { /* */ }
    }
  }

  /**
   * Seconds the key-locked signal lags its input: the worklet's reported
   * processing latency while the signal runs through it, 0 on the bypass wire.
   */
  latencySec(): number {
    return this.routedThroughWorklet ? this.reportedLatencySec : 0;
  }

  get active(): boolean { return this.isActive; }
  get ready(): boolean { return this.isWasmReady; }

  dispose(): void {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    try { this.bypassGain.dispose(); } catch { /* */ }
    try { this.input.dispose(); } catch { /* */ }
    try { this.output.dispose(); } catch { /* */ }
  }

  private rewire(): void {
    // Disconnect everything between input and output, then re-wire per the
    // new isActive state. Web Audio handles mid-stream disconnect cleanly
    // (glitch-free via 0-gain crossfade on modern browsers).
    try { this.input.disconnect(); } catch { /* */ }
    try { this.bypassGain.disconnect(); } catch { /* */ }
    const rawInput = getNativeAudioNode(this.input);
    const rawOutput = getNativeAudioNode(this.output);

    if (this.isActive && this.workletNode && this.isWasmReady && rawInput && rawOutput) {
      // ACTIVE: input → worklet → output.
      try { this.workletNode.disconnect(); } catch { /* */ }
      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawOutput);
      this.routedThroughWorklet = true;
      // Re-apply last-set pitch in case we came back from a flushed state.
      this.setPitchSemiTones(this.pendingPitchSemis);
    } else {
      // BYPASSED: input → bypassGain → output. Flush worklet buffer if loaded.
      this.routedThroughWorklet = false;
      if (this.workletNode) {
        try { this.workletNode.disconnect(); } catch { /* */ }
        this.clearBuffer();
      }
      this.input.connect(this.bypassGain);
      this.bypassGain.connect(this.output);
    }
  }

  /** Messages from the SoundTouch worklet: ready, the processing latency, errors. */
  private _onWorkletMessage(data: { type?: string; seconds?: unknown; error?: unknown }): void {
    if (data.type === 'ready') {
      this.isWasmReady = true;
      // Re-apply any queued pitch in case user engaged key-lock before WASM was up.
      if (this.pendingPitchSemis !== 0) {
        this.workletNode?.port.postMessage({
          type: 'parameter',
          key: 'pitchSemis',
          value: this.pendingPitchSemis,
        });
      }
      // If the caller already engaged us, perform the rewire now.
      if (this.isActive) this.rewire();
    } else if (data.type === 'latency') {
      const sec = Number(data.seconds);
      if (Number.isFinite(sec) && sec >= 0) this.reportedLatencySec = sec;
    } else if (data.type === 'error') {
      console.error('[DeckKeyLock] WASM worklet error:', data.error);
    }
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await DeckKeyLock.ensureInitialized(rawCtx);

      if (!DeckKeyLock.wasmBinary || !DeckKeyLock.jsCode) {
        console.error('[DeckKeyLock] WASM not available, staying on passthrough');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawCtx, 'soundtouch-keylock-processor');

      this.workletNode.port.onmessage = (event: MessageEvent) => this._onWorkletMessage(event.data);

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: DeckKeyLock.wasmBinary,
        jsCode: DeckKeyLock.jsCode,
      });

    } catch (err) {
      console.error('[DeckKeyLock] Worklet init failed, staying on passthrough:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}soundtouch/SoundTouch.wasm`),
        fetch(`${base}soundtouch/SoundTouch.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      // Strip UMD's node-specific `if (typeof exports === "object"…)` tail —
      // AudioWorkletGlobalScope lacks `exports` and the factory fails to resolve.
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}soundtouch/SoundTouch.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }
}
