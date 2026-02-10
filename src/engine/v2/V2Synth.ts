import type { V2Config } from '@/types/instrument';
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export class V2Synth implements DevilboxSynth {
  public readonly name: string = 'V2Synth';
  public readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private _initialized: boolean = false;
  private _initPromise: Promise<void>;
  private _pendingNotes: Array<{note: number, vel: number}> = [];
  private _releaseTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private _initialConfig?: V2Config;

  constructor(config?: V2Config) {
    this.output = getDevilboxAudioContext().createGain();
    this._initialConfig = config;
    this._initPromise = this._initialize();
  }

  private async _initialize() {
    // Get native AudioContext
    const nativeCtx = getDevilboxAudioContext();

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

    // Create worklet using native AudioWorkletNode constructor
    this._worklet = new AudioWorkletNode(nativeCtx, 'v2-synth-processor', {
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
          // Apply initial V2 config before flushing notes
          if (this._initialConfig) {
            this._applyV2Config(this._initialConfig);
          }
          // Flush any pending notes that were queued during init
          this._pendingNotes.forEach(n => this._sendMIDI([0x90, n.note, n.vel]));
          this._pendingNotes = [];
          resolve();
        } else if (event.data.type === 'error') {
          console.error('[V2Synth] Worklet error:', event.data.error);
        }
      };

      // Initialize with WASM binary and JS code
      this._worklet!.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode
      });
    });

    // Connect worklet to native GainNode output
    this._worklet.connect(this.output);

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
    const midiNote = typeof note === 'string' ? noteToMidi(note) : note;
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

  public triggerAttackRelease(note: string | number, duration: number, _time?: number, velocity: number = 1) {
    this.triggerAttack(note, undefined, velocity);
    // V2 is polyphonic and stateful, better to send Note Off
    const midiNote = typeof note === 'string' ? noteToMidi(note) : note;
    const d = typeof duration === 'number' ? duration : parseFloat(String(duration));
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

  /** Apply a V2Config, mapping config fields to WASM parameter indices */
  public applyConfig(config: V2Config) {
    if (this._initialized) {
      this._applyV2Config(config);
    } else {
      this._initialConfig = config;
    }
  }

  private _applyV2Config(config: V2Config) {
    // Osc 1 (indices 2-7)
    if (config.osc1) {
      this.setParameter(2, config.osc1.mode);
      this.setParameter(4, config.osc1.transpose + 64);
      this.setParameter(5, config.osc1.detune + 64);
      this.setParameter(6, config.osc1.color);
      this.setParameter(7, config.osc1.level);
    }
    // Osc 2 (indices 8-13)
    if (config.osc2) {
      this.setParameter(8, config.osc2.mode);
      this.setParameter(9, config.osc2.ringMod ? 1 : 0);
      this.setParameter(10, config.osc2.transpose + 64);
      this.setParameter(11, config.osc2.detune + 64);
      this.setParameter(12, config.osc2.color);
      this.setParameter(13, config.osc2.level);
    }
    // Osc 3 (indices 14-19)
    if (config.osc3) {
      this.setParameter(14, config.osc3.mode);
      this.setParameter(15, config.osc3.ringMod ? 1 : 0);
      this.setParameter(16, config.osc3.transpose + 64);
      this.setParameter(17, config.osc3.detune + 64);
      this.setParameter(18, config.osc3.color);
      this.setParameter(19, config.osc3.level);
    }
    // Filter 1 (indices 20-22)
    if (config.filter1) {
      this.setParameter(20, config.filter1.mode);
      this.setParameter(21, config.filter1.cutoff);
      this.setParameter(22, config.filter1.resonance);
    }
    // Filter 2 (indices 23-25)
    if (config.filter2) {
      this.setParameter(23, config.filter2.mode);
      this.setParameter(24, config.filter2.cutoff);
      this.setParameter(25, config.filter2.resonance);
    }
    // Routing (indices 26-27)
    if (config.routing) {
      this.setParameter(26, config.routing.mode);
      this.setParameter(27, config.routing.balance);
    }
    // Amp Envelope (indices 32-37: Attack, Decay, Sustain, SusTime, Release, Amplify)
    if (config.envelope) {
      this.setParameter(32, config.envelope.attack);
      this.setParameter(33, config.envelope.decay);
      this.setParameter(34, config.envelope.sustain);
      this.setParameter(36, config.envelope.release);
    }
    // Envelope 2 (indices 38-43: Attack, Decay, Sustain, SusTime, Release, Amplify)
    if (config.envelope2) {
      this.setParameter(38, config.envelope2.attack);
      this.setParameter(39, config.envelope2.decay);
      this.setParameter(40, config.envelope2.sustain);
      this.setParameter(42, config.envelope2.release);
    }
    // LFO 1 (indices 44-50: Mode, KeySync, EnvMode, Rate, Phase, Polarity, Amplify)
    if (config.lfo1) {
      this.setParameter(47, config.lfo1.rate);
      this.setParameter(50, config.lfo1.depth);
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
