import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';

export class V2Synth extends Tone.ToneAudioNode {
  public readonly name: string = 'V2Synth';
  public readonly input: undefined = undefined;
  public readonly output: Tone.Gain;

  private _worklet: AudioWorkletNode | null = null;
  private _initialized: boolean = false;
  private _initPromise: Promise<void>;
  private _pendingNotes: Array<{note: number, vel: number}> = [];
  private _releaseTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor() {
    super();
    this.output = new Tone.Gain();
    this._initPromise = this._initialize();
  }

  private async _initialize() {
    // Get the TRUE native context from Tone.js
    const toneContext = this.context as any;
    const nativeCtx = toneContext.rawContext || toneContext._context;

    if (!nativeCtx) {
      throw new Error('Could not get native AudioContext from Tone.js');
    }

    // Ensure context is running before loading worklet
    if ((nativeCtx.state as string) !== 'running') {
      try { await nativeCtx.resume(); } catch {}
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
    } catch (e) {
      // Worklet might already be added
    }

    // Fetch WASM binary and JS code in parallel
    const [wasmResponse, jsResponse] = await Promise.all([
      fetch(`${baseUrl}V2Synth.wasm${cacheBuster}`, { cache: 'no-store' }),
      fetch(`${baseUrl}V2Synth.js${cacheBuster}`, { cache: 'no-store' })
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
      .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory')
      .replace(/(_malloc=wasmExports\["\w+"\])/, '$1;Module["_malloc"]=_malloc')
      .replace(/(_free=wasmExports\["\w+"\])/, '$1;Module["_free"]=_free');

    // Create worklet using Tone.js's createAudioWorkletNode (standardized-audio-context)
    this._worklet = toneCreateAudioWorkletNode(nativeCtx, 'v2-synth-processor', {
      outputChannelCount: [2]
    });

    // Wait for ready message with timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('V2Synth initialization timeout after 10s'));
      }, 10000);

      this._worklet!.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          clearTimeout(timeout);
          this._initialized = true;
          // Flush any pending notes that were queued during init
          this._pendingNotes.forEach(n => this._sendMIDI([0x90, n.note, n.vel]));
          this._pendingNotes = [];
          resolve();
        }
      };

      // Initialize with WASM binary and JS code
      this._worklet!.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode
      });
    });

    // Connect worklet to Tone.js output - use the native GainNode
    const nativeOutput = this.output.input as AudioNode;
    this._worklet.connect(nativeOutput);

    // CRITICAL: Connect worklet through a silent keepalive to destination.
    // Without a path to destination, the browser never calls process().
    try {
      const keepalive = nativeCtx.createGain();
      keepalive.gain.value = 0;
      this._worklet.connect(keepalive);
      keepalive.connect(nativeCtx.destination);
    } catch (e) {
      console.warn('[V2Synth] Keepalive connection failed:', e);
    }
  }

  public async ready() {
    return this._initPromise;
  }

  public async ensureInitialized() {
    return this._initPromise;
  }

  public triggerAttack(note: string | number, _time?: number, velocity: number = 1) {
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const vel = Math.floor(velocity * 127);

    if (!this._initialized) {
      // Queue note for when init completes instead of dropping silently
      this._pendingNotes.push({ note: midiNote, vel });
      return;
    }

    // MIDI Note On: 0x90
    this._sendMIDI([0x90, midiNote, vel]);
  }

  public triggerRelease(_time?: number) {
    if (!this._initialized) return;
    // We don't have the current note here, but V2 handles polyphony.
    // Standard trackers send Note Off for the note on that channel.
    // For now, we'll send All Notes Off if needed or handle via explicit note.
  }

  public triggerAttackRelease(note: string | number, duration: Tone.Unit.Time, _time?: number, velocity: number = 1) {
    this.triggerAttack(note, undefined, velocity);
    // V2 is polyphonic and stateful, better to send Note Off
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const d = this.toSeconds(duration);
    const timer = setTimeout(() => {
      this._releaseTimers.delete(timer);
      // Only send if still initialized (not disposed)
      if (this._initialized && this._worklet) {
        this._sendMIDI([0x80, midiNote, 0]);
      }
    }, d * 1000);
    this._releaseTimers.add(timer);
  }

  public setParameter(index: number, value: number) {
    if (this._worklet && this._initialized) {
      this._worklet.port.postMessage({
        type: 'param',
        index,
        value
      });
    }
  }

  private _sendMIDI(msg: number[]) {
    if (this._worklet && this._initialized) {
      this._worklet.port.postMessage({
        type: 'midi',
        msg
      });
    }
  }

  public dispose() {
    // Clear all pending release timers to prevent memory leaks
    this._releaseTimers.forEach(timer => clearTimeout(timer));
    this._releaseTimers.clear();
    this._initialized = false;

    super.dispose();
    if (this._worklet) {
      this._worklet.disconnect();
    }
    this.output.dispose();
    return this;
  }
}
