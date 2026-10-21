/**
 * FluidSynthHost.ts - one shared FluidSynth worklet per AudioContext.
 *
 * Every FluidSynth instrument instance is a thin facade bound to one MIDI
 * channel ("slot") of this host. The host owns the single addModule, the
 * WASM/JS fetch, the keepalive and the SoundFont loads, so an imported song
 * with 20 FluidSynth channels runs one synth with one SoundFont copy.
 *
 * Outputs: the worklet runs multi-output. Output s (s < FLUID_GROUPS) carries
 * the dry signal of slot s; output FLUID_GROUPS carries the shared reverb and
 * chorus return. slotOutput(s) is a GainNode fed from output s, so per-channel
 * routing, meters and strip effects keep working downstream of the facade.
 *
 * Lifecycle: acquire() / release() refcount the host. At refcount 0 the host
 * disposes the worklet after FLUID_IDLE_DISPOSE_MS, so a quick re-import
 * reuses the loaded synth.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

/** Dry output groups (= MIDI channels) of the shared synth. */
export const FLUID_GROUPS = 64;
export const FLUID_IDLE_DISPOSE_MS = 2000;

export type FluidSynthMessage = { type: string } & Record<string, unknown>;
type Listener = (data: FluidSynthMessage) => void;

const baseUrl = (): string => import.meta.env.BASE_URL || '/';

/** WASM binary + patched glue code; context-independent, fetched once per page. */
let codePromise: Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> | null = null;

function loadFluidSynthCode(): Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> {
  if (!codePromise) {
    codePromise = (async () => {
      const base = baseUrl();
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${base}fluidsynth/FluidSynth.wasm`),
        fetch(`${base}fluidsynth/FluidSynth.js`),
      ]);
      if (!wasmResponse.ok) throw new Error(`Failed to load FluidSynth.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load FluidSynth.js: ${jsResponse.status}`);
      const [wasmBinary, jsCodeRaw] = await Promise.all([wasmResponse.arrayBuffer(), jsResponse.text()]);
      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${base}fluidsynth/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
        .replace(/new\s+URL\(([^,]+),\s*([^)]+)\)\.href/g, '($2 + $1)');
      return { wasmBinary, jsCode };
    })();
    // A failed fetch must not poison every later host.
    codePromise.catch(() => { codePromise = null; });
  }
  return codePromise;
}

/** addModule is per AudioContext. */
const workletModules = new WeakMap<BaseAudioContext, Promise<void>>();
const hosts = new Map<BaseAudioContext, FluidSynthHost>();

export class FluidSynthHost {
  /** Get (or create) the host for ctx and take a reference. */
  static acquire(ctx: BaseAudioContext = getDevilboxAudioContext()): FluidSynthHost {
    let host = hosts.get(ctx);
    if (!host) {
      host = new FluidSynthHost(ctx);
      hosts.set(ctx, host);
    }
    host.addRef();
    return host;
  }

  /** Test hook: the live host for ctx, without taking a reference. */
  static peek(ctx: BaseAudioContext): FluidSynthHost | undefined {
    return hosts.get(ctx);
  }

  readonly ctx: BaseAudioContext;
  /** Resolves when the worklet is initialised. */
  readonly ready: Promise<void>;
  /** Resolves when the first SoundFont is in (or none could load). Notes before it are silent. */
  readonly sfReady: Promise<void>;
  /** Shared reverb/chorus return (worklet output FLUID_GROUPS). */
  readonly fxReturn: GainNode;

  private node: AudioWorkletNode | null = null;
  private keepalive: GainNode | null = null;
  private refs = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private sfLoaded = false;
  private resolveSf!: () => void;
  /** Messages posted before the first SoundFont is in: the worklet drops them before init, and notes are silent before a font. */
  private queue: Array<{ msg: FluidSynthMessage; transfer?: Transferable[] }> = [];
  private readonly slotRefs = new Array<number>(FLUID_GROUPS).fill(0);
  private readonly slotGains = new Array<GainNode | null>(FLUID_GROUPS).fill(null);
  private readonly listeners = new Set<Listener>();
  private fxDestination: AudioNode | null = null;

  private constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.fxReturn = ctx.createGain();
    this.sfReady = new Promise<void>((resolve) => { this.resolveSf = resolve; });
    this.ready = this.initialize();
    // ready rejecting must not hold sfReady forever.
    this.ready.catch(() => this.resolveSf());
  }

  get refCount(): number { return this.refs; }
  get isDisposed(): boolean { return this.disposed; }

  private addRef(): void {
    this.refs++;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /** Drop a reference; at 0 the worklet is disposed after FLUID_IDLE_DISPOSE_MS unless re-acquired. */
  release(): void {
    if (this.refs <= 0) return;
    this.refs--;
    if (this.refs === 0 && !this.idleTimer) {
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        if (this.refs === 0) this.dispose();
      }, FLUID_IDLE_DISPOSE_MS);
    }
  }

  private async initialize(): Promise<void> {
    const ctx = this.ctx;
    let mod = workletModules.get(ctx);
    if (!mod) {
      mod = ctx.audioWorklet.addModule(`${baseUrl()}fluidsynth/FluidSynth.worklet.js`);
      workletModules.set(ctx, mod);
      mod.catch(() => workletModules.delete(ctx));
    }
    await mod;
    const { wasmBinary, jsCode } = await loadFluidSynthCode();
    if (this.disposed) throw new Error('FluidSynthHost disposed during init');

    const node = new AudioWorkletNode(ctx, 'fluidsynth-processor', {
      numberOfInputs: 0,
      numberOfOutputs: FLUID_GROUPS + 1,
      outputChannelCount: new Array(FLUID_GROUPS + 1).fill(2),
    });
    this.node = node;

    const ready = new Promise<void>((resolve, reject) => {
      node.port.onmessage = (event: MessageEvent) => {
        const data = event.data as FluidSynthMessage;
        if (data.type === 'ready') {
          resolve();
          void this.loadDefaultSoundFont();
        } else if (data.type === 'error') {
          console.error('FluidSynth error:', data.message || data.error);
          reject(new Error(String(data.message || data.error)));
          // Do not hold sfReady forever when no SoundFont can load.
          this.markSoundFontIn();
        } else if (data.type === 'sf2Loaded') {
          this.markSoundFontIn();
        }
        for (const l of this.listeners) l(data);
      };
    });

    // Copy: the cached binary must survive for the next host.
    node.port.postMessage({
      type: 'init', wasmBinary: wasmBinary.slice(0), jsCode, sampleRate: ctx.sampleRate,
      multi: true, audioGroups: FLUID_GROUPS, midiChannels: FLUID_GROUPS,
    });

    node.connect(this.fxReturn, FLUID_GROUPS, 0);
    for (let s = 0; s < FLUID_GROUPS; s++) {
      const gain = this.slotGains[s];
      if (gain) node.connect(gain, s, 0);
    }
    if (this.fxDestination) this.fxReturn.connect(this.fxDestination);

    try {
      const keepalive = ctx.createGain();
      keepalive.gain.value = 0;
      node.connect(keepalive, FLUID_GROUPS, 0);
      keepalive.connect(ctx.destination);
      this.keepalive = keepalive;
    } catch { /* keepalive failed */ }

    await ready;
  }

  private markSoundFontIn(): void {
    if (this.sfLoaded) return;
    this.sfLoaded = true;
    const queued = this.queue;
    this.queue = [];
    for (const { msg, transfer } of queued) this.node?.port.postMessage(msg, transfer ?? []);
    this.resolveSf();
  }

  private async loadDefaultSoundFont(): Promise<void> {
    try {
      const res = await fetch(`${baseUrl()}fluidsynth/default.sf2`);
      if (!res.ok) { this.markSoundFontIn(); return; }
      this.loadSoundFont(await res.arrayBuffer(), 'default.sf2');
    } catch {
      // No default SoundFont: the user loads one by hand.
      this.markSoundFontIn();
    }
  }

  /** Load a SoundFont into the shared synth (newest font wins; channel presets re-resolve). */
  loadSoundFont(data: ArrayBuffer | Uint8Array, filename = 'soundfont.sf2'): void {
    if (!this.node || this.disposed) {
      console.warn('FluidSynth: host not ready, cannot load SoundFont');
      return;
    }
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const buf = u8.buffer.byteLength === u8.length ? u8.buffer : u8.slice().buffer;
    // loadSF2 bypasses the queue: the worklet itself defers it until init.
    this.node.port.postMessage({ type: 'loadSF2', data: new Uint8Array(buf), filename }, [buf]);
  }

  /** Post a message to the worklet; held until the first SoundFont is in. */
  post(msg: FluidSynthMessage, transfer?: Transferable[]): void {
    if (this.disposed) return;
    if (!this.sfLoaded || !this.node) {
      this.queue.push({ msg, transfer });
      return;
    }
    this.node.port.postMessage(msg, transfer ?? []);
  }

  /** Drop queued messages matching pred (e.g. a note released before the font arrived). */
  dropQueued(pred: (msg: FluidSynthMessage) => boolean): void {
    this.queue = this.queue.filter((q) => !pred(q.msg));
  }

  /** Subscribe to worklet replies (presetName, channelBank, ...). Returns the unsubscribe. */
  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Route the shared reverb/chorus return; idempotent. */
  connectFxReturn(destination: AudioNode): void {
    if (this.fxDestination === destination) return;
    if (this.fxDestination) {
      try { this.fxReturn.disconnect(this.fxDestination); } catch { /* not connected */ }
    }
    this.fxDestination = destination;
    this.fxReturn.connect(destination);
  }

  /**
   * Take the lowest free slot and set its channel type. Above FLUID_GROUPS
   * slots the audio of two instruments merges into one strip, so warn.
   */
  allocSlot(drum: boolean): number {
    let slot = this.slotRefs.findIndex((n) => n === 0);
    if (slot < 0) {
      slot = this.slotRefs.reduce((best, n, i) => (n < this.slotRefs[best] ? i : best), 0);
      console.warn(`[FluidSynthHost] all ${FLUID_GROUPS} slots in use; sharing slot ${slot}`);
    }
    this.slotRefs[slot]++;
    this.post({ type: 'setChannelType', channel: slot, channelType: drum ? 1 : 0 });
    return slot;
  }

  freeSlot(slot: number): void {
    if (slot < 0 || slot >= FLUID_GROUPS || this.slotRefs[slot] === 0) return;
    this.slotRefs[slot]--;
    if (this.slotRefs[slot] === 0) {
      this.post({ type: 'allSoundsOff', channel: slot });
    }
  }

  /** Number of holders of slot (test hook). */
  slotUsers(slot: number): number {
    return this.slotRefs[slot] ?? 0;
  }

  /** The dry output of slot as a GainNode (created once, reused across holders). */
  slotOutput(slot: number): GainNode {
    let gain = this.slotGains[slot];
    if (!gain) {
      gain = this.ctx.createGain();
      this.slotGains[slot] = gain;
      this.node?.connect(gain, slot, 0);
    }
    return gain;
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (hosts.get(this.ctx) === this) hosts.delete(this.ctx);
    if (this.node) {
      this.node.port.postMessage({ type: 'dispose' });
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = null;
    }
    try { this.keepalive?.disconnect(); } catch { /* already gone */ }
    try { this.fxReturn.disconnect(); } catch { /* already gone */ }
    for (const g of this.slotGains) { try { g?.disconnect(); } catch { /* already gone */ } }
    this.queue = [];
    this.listeners.clear();
    this.resolveSf();
  }
}
