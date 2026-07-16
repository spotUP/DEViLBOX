/**
 * SunTronicSongEngine.ts — Gate B.2 native whole-song playback engine.
 *
 * Plays a SunTronic V1.3 module natively in the browser (no UADE at runtime).
 * The byte-exact `SunTronicPlayer` + Paula render core (SunTronicNativeRender)
 * runs HERE, on the main thread, producing finished 44100 Hz stereo chunks that
 * are streamed to the SunTronicResampler worklet (ring buffer + 44100 -> ctx-rate
 * SRC). Keeping synthesis on the main thread means ONE copy of the Paula/timbre
 * math (single source of truth) shared with the offline oracle — the worklet
 * re-synthesizes nothing, so it can never drift.
 *
 * NOT a WASMSingletonBase subclass: that base always attempts a wasm fetch
 * (loadWASMAssets: needsWasm = !cache.wasmBinary), which would 404 for a
 * wasm-less engine. This is a lean standalone singleton mirroring the same
 * public surface (getInstance/hasInstance/ready/loadTune/play/stop/pause/output)
 * that NativeEngineRouting dispatches to.
 *
 * This engine is reached ONLY when the user sets the SunTronic engine pref to
 * 'native' (default stays UADE until Gate E locks whole-song fidelity).
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { parseSunTronicV13Score, type SunV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicNativeRenderer, NATIVE_SAMPLE_RATE, type RenderChannels } from './SunTronicNativeRender';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';

/** Per-channel scope window pushed to the visualizer (VU meters + scopes read
 *  the same store). 256 = the store's documented per-channel length. */
const SCOPE_SAMPLES = 256;

/** Companion PCM sidecars, as delivered by the import dialog / project restore. */
export type SunTronicCompanions =
  | Map<string, ArrayBuffer | Uint8Array>
  | Array<{ name: string; data: ArrayBuffer | Uint8Array }>;

const CHUNK = 2048;                                  // 44100-samples per render step
const LOOKAHEAD = Math.floor(NATIVE_SAMPLE_RATE * 0.35); // ~350 ms queued ahead
const PUMP_INTERVAL_MS = 40;
const MAX_CHUNKS_PER_PUMP = 48;                      // runaway guard (~2.2 s cap)

function basename(p: string): string {
  return (p.split('/').pop() ?? p).split('\\').pop() ?? p;
}

/** Resolve companion PCM per sampled slot, in `instrumentNames` order. */
function resolveSlotPcm(
  names: string[],
  companions: SunTronicCompanions | undefined,
): (Int8Array | null)[] {
  const byBase = new Map<string, Int8Array>();
  if (companions) {
    const entries = companions instanceof Map
      ? Array.from(companions.entries()).map(([name, data]) => ({ name, data }))
      : companions;
    for (const { name, data } of entries) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      byBase.set(basename(name).toLowerCase(), new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    }
  }
  return names.map((n) => byBase.get(basename(n).toLowerCase()) ?? null);
}

export class SunTronicSongEngine {
  private static instance: SunTronicSongEngine | null = null;

  private audioContext: AudioContext;
  readonly output: GainNode;
  private workletNode: AudioWorkletNode | null = null;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _disposed = false;

  // Song render state (rebuilt on each loadTune; recreated to restart from top).
  private score: SunV13Score | null = null;
  private slotPcm: (Int8Array | null)[] = [];
  private renderer: SunTronicNativeRenderer | null = null;

  // Per-voice mixer gain (mute/solo/volume from useMixerStore, forwarded via the
  // _gainEngineCache broadcast like Cinter4). Persisted here so a renderer rebuild
  // (startFromTop) re-applies the user's current mute/solo state.
  private readonly voiceGains = [1, 1, 1, 1];

  // Pump bookkeeping (44100-sample domain).
  private pump: ReturnType<typeof setInterval> | null = null;
  private generated = 0;   // total samples rendered + queued to the worklet
  private consumed = 0;    // total samples the worklet has pulled (from feedback)
  private playing = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._initPromise = new Promise((resolve) => { this._resolveInit = resolve; });
    void this.initialize();
  }

  static getInstance(): SunTronicSongEngine {
    const ctx = getDevilboxAudioContext();
    if (
      !SunTronicSongEngine.instance ||
      SunTronicSongEngine.instance._disposed ||
      SunTronicSongEngine.instance.audioContext !== ctx
    ) {
      if (SunTronicSongEngine.instance && !SunTronicSongEngine.instance._disposed) {
        SunTronicSongEngine.instance.dispose();
      }
      SunTronicSongEngine.instance = new SunTronicSongEngine();
    }
    return SunTronicSongEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SunTronicSongEngine.instance && !SunTronicSongEngine.instance._disposed;
  }

  ready(): Promise<void> { return this._initPromise; }

  private async initialize(): Promise<void> {
    try {
      const base = import.meta.env.BASE_URL || '/';
      await this.audioContext.audioWorklet.addModule(`${base}suntronic/SunTronicResampler.worklet.js`);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'suntronic-resampler', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });
      this.workletNode.port.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'ready') {
          this._resolveInit?.();
          this._resolveInit = null;
        } else if (d.type === 'consumed') {
          this.consumed = d.samples | 0;
        } else if (d.type === 'underrun') {
          // Pump fell behind (background tab / GC stall) — the next pump tick
          // tops the ring back up. Logged, not fatal.
          console.warn('[SunTronicSongEngine] worklet underrun — ring ran dry');
        }
      };
      this.workletNode.connect(this.output);
      this.workletNode.port.postMessage({ type: 'init' });
    } catch (err) {
      console.error('[SunTronicSongEngine] init failed:', err);
      this._resolveInit?.();
      this._resolveInit = null;
    }
  }

  /**
   * Load a raw SunTronic V1.3 module (the `sunTronicSongFileData` bytes) and its
   * companion PCM sidecars, then start streaming playback. Sequencer-driven:
   * playback begins here (play() just re-asserts it), matching Cinter4Engine.
   */
  async loadTune(moduleData: ArrayBuffer | Uint8Array, companions?: SunTronicCompanions): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SunTronicSongEngine not initialized');

    const bytes = moduleData instanceof Uint8Array ? moduleData : new Uint8Array(moduleData);
    this.score = parseSunTronicV13Score(bytes);
    this.slotPcm = resolveSlotPcm(this.score.instrumentNames, companions);
    this.startFromTop();
  }

  /** (Re)build the renderer at song start and refill the worklet ring. */
  private startFromTop(): void {
    if (!this.score || !this.workletNode) return;
    this.stopPump();
    this.workletNode.port.postMessage({ type: 'reset' });
    this.renderer = new SunTronicNativeRenderer(this.score, this.slotPcm);
    // Re-apply the user's mute/solo/volume to the fresh renderer.
    for (let ch = 0; ch < 4; ch++) this.renderer.setVoiceGain(ch, this.voiceGains[ch]);
    // Wire the per-channel oscilloscope/VU visualizer (4 Paula voices), matching
    // the display pan (voices 0,3 hard-left, 1,2 hard-right — the Paula law).
    useOscilloscopeStore.getState().setChipInfo(
      4, 0, ['SunTronic 0', 'SunTronic 1', 'SunTronic 2', 'SunTronic 3']);
    this.generated = 0;
    this.consumed = 0;
    // Prefill the lookahead so the ring has audio before transport starts.
    this.produceUntilLookahead();
    this.workletNode.port.postMessage({ type: 'play' });
    this.playing = true;
    this.startPump();
  }

  /** Render + post chunks until ~LOOKAHEAD samples are queued ahead of playback. */
  private produceUntilLookahead(): void {
    if (!this.renderer || !this.workletNode) return;
    let chunks = 0;
    let lastCh: RenderChannels['ch'] | null = null;
    while (this.generated - this.consumed < LOOKAHEAD && chunks < MAX_CHUNKS_PER_PUMP) {
      const left = new Float32Array(CHUNK);
      const right = new Float32Array(CHUNK);
      // Capture the per-voice mono buffers for the visualizer (fresh so inactive
      // voices read 0). Cheap vs the render itself; only the LAST chunk is shown.
      const ch: RenderChannels['ch'] = [
        new Float32Array(CHUNK), new Float32Array(CHUNK),
        new Float32Array(CHUNK), new Float32Array(CHUNK),
      ];
      this.renderer.renderInto(left, right, { ch });
      lastCh = ch;
      this.workletNode.port.postMessage(
        { type: 'chunk', left, right },
        [left.buffer, right.buffer],
      );
      this.generated += CHUNK;
      chunks++;
    }
    // Push one scope window per pump tick (~40 ms → ~25 fps) — VU meters, track
    // scopes, and channel visualizers all read useOscilloscopeStore.
    if (lastCh) this.pushScope(lastCh);
  }

  /** Convert the first SCOPE_SAMPLES of each voice buffer to Int16 and publish. */
  private pushScope(ch: RenderChannels['ch']): void {
    const out: (Int16Array | null)[] = [];
    for (let v = 0; v < 4; v++) {
      const src = ch[v];
      const dst = new Int16Array(SCOPE_SAMPLES);
      for (let i = 0; i < SCOPE_SAMPLES; i++) {
        const s = src[i];
        dst[i] = s >= 1 ? 32767 : s <= -1 ? -32768 : Math.round(s * 32767);
      }
      out.push(dst);
    }
    useOscilloscopeStore.getState().updateChannelData(out);
  }

  /** Mixer forwarding (mute/solo/volume) — registered in useMixerStore's
   *  _gainEngineCache like Cinter4. gain 0 = muted. Applies live to the current
   *  renderer AND persists for the next renderer rebuild. */
  setChannelGain(channel: number, gain: number): void {
    if (channel < 0 || channel >= 4) return;
    this.voiceGains[channel] = gain < 0 ? 0 : gain;
    this.renderer?.setVoiceGain(channel, this.voiceGains[channel]);
  }

  private startPump(): void {
    if (this.pump) return;
    this.pump = setInterval(() => {
      if (this.playing) this.produceUntilLookahead();
    }, PUMP_INTERVAL_MS);
  }

  private stopPump(): void {
    if (this.pump) { clearInterval(this.pump); this.pump = null; }
  }

  play(): void {
    // Sequencer format: loadTune already started playback. If stopped, restart
    // from the top (the renderer/ring were reset on stop).
    if (this.playing) return;
    if (this.score) this.startFromTop();
  }

  stop(): void {
    this.playing = false;
    this.stopPump();
    this.workletNode?.port.postMessage({ type: 'reset' });
    this.renderer = null;
    this.generated = 0;
    this.consumed = 0;
    useOscilloscopeStore.getState().clear();
  }

  pause(): void {
    // No true pause: halt the pump + mute the worklet, keep the renderer so a
    // subsequent play() would need a restart (v1 — refine to true pause later).
    this.playing = false;
    this.stopPump();
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  dispose(): void {
    this._disposed = true;
    this.playing = false;
    this.stopPump();
    try { this.workletNode?.port.postMessage({ type: 'dispose' }); } catch { /* port closed */ }
    try { this.workletNode?.disconnect(); } catch { /* already disconnected */ }
    this.workletNode = null;
    this.renderer = null;
    if (SunTronicSongEngine.instance === this) SunTronicSongEngine.instance = null;
  }
}
