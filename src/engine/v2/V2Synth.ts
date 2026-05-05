import type { V2Config } from '@/types/instrument';
import { DEFAULT_V2 } from '@/types/instrument';
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { v2ConfigToBytes, v2ConfigToInstrument, DEFAULT_V2_INSTRUMENT } from '@/types/v2Instrument';

export class V2Synth implements DevilboxSynth {
  public readonly name: string = 'V2Synth';
  public readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private _initialized: boolean = false;
  private _initPromise: Promise<void>;
  private _pendingNotes: Array<{note: number, vel: number}> = [];
  private _activeNotes: Map<number, number> = new Map(); // note → velocity
  private _releaseTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private _config: V2Config;

  constructor(config?: V2Config) {
    this._config = config ? structuredClone(config) : structuredClone(DEFAULT_V2);
    this.output = getDevilboxAudioContext().createGain();
    this._initPromise = this._initialize();
  }

  private async _initialize() {
    // Get native AudioContext
    const nativeCtx = getDevilboxAudioContext();

    // Ensure context is running before loading worklet
    if ((nativeCtx.state as string) !== 'running') {
      try { await nativeCtx.resume(); } catch { /* context may not be resumable yet */ }
      if ((nativeCtx.state as string) !== 'running') {
        // Wait up to 5s for context to start
        await Promise.race([
          new Promise<void>((resolve) => {
            const check = () => {
              if ((nativeCtx.state as string) === 'running') resolve();
              else setTimeout(check, 100);
            };
            setTimeout(check, 100);
          }),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('AudioContext not running after 5s')), 5000))
        ]);
      }
    }

    // Add worklet if not already added
    const baseUrl = import.meta.env.BASE_URL || '/';
    const cacheBuster = `?v=${Date.now()}`;
    try {
      await nativeCtx.audioWorklet.addModule(`${baseUrl}V2Synth.worklet.js${cacheBuster}`);
    } catch {
      // Worklet might already be added
    }

    // Fetch WASM binary and JS code in parallel
    const [wasmResponse, jsResponse] = await Promise.all([
      fetch(`${baseUrl}v2/V2Synth.wasm${cacheBuster}`, { cache: 'no-store' }),
      fetch(`${baseUrl}v2/V2Synth.js${cacheBuster}`, { cache: 'no-store' })
    ]);

    if (!wasmResponse.ok) {
      throw new Error(`Failed to load V2Synth.wasm: ${wasmResponse.status}`);
    }
    if (!jsResponse.ok) {
      throw new Error(`Failed to load V2Synth.js: ${jsResponse.status}`);
    }

    const [wasmBinary, jsCodeRaw] = await Promise.all([
      wasmResponse.arrayBuffer(),
      jsResponse.text()
    ]);

    // Preprocess JS code for AudioWorklet new Function() compatibility:
    // 1. Replace import.meta.url (not available in Function constructor scope)
    // 2. Remove ES module export statement (invalid syntax in Function body)
    // 3. Strip Node.js-specific dynamic import block (fails in worklet context)
    // 4. Expose wasmMemory, _malloc, _free on Module (Emscripten keeps them internal)
    // 5. Polyfill URL class (not available in AudioWorklet's WorkletGlobalScope)
    const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
    const jsCode = urlPolyfill + jsCodeRaw
      .replace(/import\.meta\.url/g, `"${baseUrl}"`)
      .replace(/export\s+default\s+\w+;?\s*$/, '')
      .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
      .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
      .replace(/(_malloc=wasmExports\["\w+"\])/, '$1;Module["_malloc"]=_malloc')
      .replace(/(_free=wasmExports\["\w+"\])/, '$1;Module["_free"]=_free');

    // Create worklet using native AudioWorkletNode constructor
    this._worklet = new AudioWorkletNode(nativeCtx, 'v2-synth-processor', {
      outputChannelCount: [2]
    });

    // CRITICAL: Connect worklet to destination BEFORE sending init message.
    // Chrome's AudioWorklet thread only delivers port messages when the worklet
    // has a path to the audio destination (process() must be callable).
    // Without this connection, postMessage is queued but never delivered — deadlock.
    this._worklet.connect(this.output);
    try {
      const keepalive = nativeCtx.createGain();
      keepalive.gain.value = 0;
      this._worklet.connect(keepalive);
      keepalive.connect(nativeCtx.destination);
    } catch (e) {
      console.warn('[V2Synth] Keepalive connection failed:', e);
    }

    // Wait for ready message with timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('V2Synth initialization timeout after 10s'));
      }, 10000);

      this._worklet!.port.onmessage = (event) => {
        if (event.data.type === 'ready' || event.data.type === 'initialized') {
          clearTimeout(timeout);
          this._initialized = true;
          // Load default patch on channel 0 so the synth produces audio immediately.
          const patchData = v2ConfigToBytes(DEFAULT_V2_INSTRUMENT);
          this._worklet!.port.postMessage({ type: 'loadPatch', channel: 0, patchData });
          // V2 default sound has chanvol=0 routed via CC7 (volume).
          // Send CC7=127 on all channels so output is audible immediately.
          for (let ch = 0; ch < 16; ch++) {
            this._worklet!.port.postMessage({ type: 'controlChange', channel: ch, cc: 7, value: 127 });
          }
          // Flush any pending notes that were queued during init
          this._pendingNotes.forEach(n => this._noteOn(0, n.note, n.vel));
          this._pendingNotes = [];
          resolve();
        } else if (event.data.type === 'error') {
          console.error('[V2Synth] Worklet error:', event.data.error);
        }
      };

      // Initialize with WASM binary, JS code, and sample rate
      console.log('[V2Synth] Sending init to worklet, wasmBinary size:', wasmBinary.byteLength, 'jsCode length:', jsCode.length);
      this._worklet!.port.postMessage({
        type: 'init',
        sampleRate: nativeCtx.sampleRate,
        wasmBinary: new Uint8Array(wasmBinary),
        jsCode
      });
    });

  }

  public async ready() {
    return this._initPromise;
  }

  public async ensureInitialized() {
    return this._initPromise;
  }

  public triggerAttack(note: string | number, _time?: number, velocity: number = 1) {
    const midiNote = typeof note === 'string' ? noteToMidi(note) : note;
    const vel = Math.floor(velocity * 127);

    if (!this._initialized) {
      // Queue note for when init completes instead of dropping silently
      this._pendingNotes.push({ note: midiNote, vel });
      return;
    }

    this._noteOn(0, midiNote, vel);
  }

  public triggerRelease(noteOrTime?: string | number) {
    if (!this._initialized || !this._worklet) return;
    if (typeof noteOrTime === 'string') {
      const midiNote = noteToMidi(noteOrTime);
      this._activeNotes.delete(midiNote);
      this._noteOff(0, midiNote);
    } else {
      this._activeNotes.clear();
      this._worklet!.port.postMessage({ type: 'allNotesOff', channel: 0 });
    }
  }

  public releaseAll(): void {
    if (!this._initialized || !this._worklet) return;
    this._activeNotes.clear();
    this._worklet.port.postMessage({ type: 'allNotesOff', channel: 0 });
  }

  public triggerAttackRelease(note: string | number, duration: number, _time?: number, velocity: number = 1) {
    this.triggerAttack(note, undefined, velocity);
    const midiNote = typeof note === 'string' ? noteToMidi(note) : note;
    const d = typeof duration === 'number' ? duration : parseFloat(String(duration));
    const timer = setTimeout(() => {
      this._releaseTimers.delete(timer);
      if (this._initialized && this._worklet) {
        this._activeNotes.delete(midiNote);
        this._worklet.port.postMessage({ type: 'noteOff', channel: 0, note: midiNote });
      }
    }, d * 1000);
    this._releaseTimers.add(timer);
  }

  public setParameter(_index: number, _value: number) {
    // V2 parameters are set via loadPatch/setGlobals — individual param index not supported
  }

  /** Apply a V2Config, mapping config fields to WASM parameter indices */
  public applyConfig(config: V2Config) {
    this._config = structuredClone(config);
    if (this._initialized) {
      this._applyV2Config(config);
    }
  }

  private _applyV2Config(config: V2Config) {
    if (!this._worklet) return;
    const inst = v2ConfigToInstrument(config);
    const patchData = v2ConfigToBytes(inst);
    this._worklet.port.postMessage({ type: 'loadPatch', channel: 0, patchData });
    // V2 reads patch data at noteOn — retrigger active notes so knob changes are immediate
    if (this._activeNotes.size > 0) {
      this._worklet.port.postMessage({ type: 'allNotesOff', channel: 0 });
      for (const [note, velocity] of this._activeNotes) {
        this._worklet.port.postMessage({ type: 'noteOn', channel: 0, note, velocity });
      }
    }
  }

  private _noteOn(channel: number, note: number, velocity: number) {
    if (this._worklet && this._initialized) {
      this._activeNotes.set(note, velocity);
      this._worklet.port.postMessage({ type: 'noteOn', channel, note, velocity });
    }
  }

  private _noteOff(channel: number, note: number) {
    if (this._worklet && this._initialized) {
      this._activeNotes.delete(note);
      this._worklet.port.postMessage({ type: 'noteOff', channel, note });
    }
  }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.setValueAtTime(value, this.output.context.currentTime);
        if (this._worklet && this._initialized) {
          this._worklet.port.postMessage({ type: 'controlChange', channel: 0, cc: 7, value: Math.round(value * 127) });
        }
        break;
      default: {
        // Support dot-notation: e.g. 'osc1.mode', 'filter1.cutoff'
        const parts = param.split('.');
        if (parts.length === 2) {
          const [section, key] = parts;
          const obj = (this._config as unknown as Record<string, unknown>)[section];
          if (obj && typeof obj === 'object') {
            (obj as Record<string, unknown>)[key] = value;
            // Re-send full patch to WASM
            this._applyV2Config(this._config);
          }
        }
        break;
      }
    }
  }

  get(param: string): number | undefined {
    switch (param) {
      case 'volume': return this.output.gain.value;
      default: return undefined;
    }
  }

  public dispose(): void {
    // Clear all pending release timers to prevent memory leaks
    this._releaseTimers.forEach(timer => clearTimeout(timer));
    this._releaseTimers.clear();
    this._initialized = false;

    if (this._worklet) {
      this._worklet.disconnect();
    }
    this.output.disconnect();
  }
}
