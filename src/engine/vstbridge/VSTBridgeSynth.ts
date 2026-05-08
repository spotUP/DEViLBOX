/**
 * VSTBridgeSynth.ts - Generic DevilboxSynth for any conforming WASM synth
 *
 * A single implementation that works for ANY synth registered in the VSTBridge
 * registry. Loads WASM via vstbridge-loader, creates an AudioWorkletNode with
 * the generic VSTBridge.worklet.js, and routes note/param/command messages.
 *
 * Synth-specific details come from the VSTBridgeDescriptor — no subclassing needed.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { InstrumentConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { ensureVSTBridgeLoaded, createVSTBridgeNode } from './vstbridge-loader';
import type { VSTBridgeDescriptor, VSTBridgeParam } from './synth-registry';

export class VSTBridgeSynth implements DevilboxSynth {
  readonly name: string;
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private _descriptor: VSTBridgeDescriptor;
  private _isReady = false;
  private _initPromise: Promise<void>;
  private _params: VSTBridgeParam[] = [];
  private _paramValues = new Map<number, number>();
  private _pendingNotes: Array<{ note: number; velocity: number }> = [];
  private _initialConfig: InstrumentConfig | undefined;
  private _currentMidiNote: number = 69;

  constructor(descriptor: VSTBridgeDescriptor, config?: InstrumentConfig) {
    this._descriptor = descriptor;
    this._initialConfig = config;
    this.name = `VSTBridge:${descriptor.id}`;

    const ctx = getDevilboxAudioContext();
    this.output = ctx.createGain();

    // Apply volume offset if specified
    if (descriptor.volumeOffsetDb) {
      const linearGain = Math.pow(10, descriptor.volumeOffsetDb / 20);
      this.output.gain.value = linearGain;
    }

    this._initPromise = this._initialize();
  }

  /** Wait for WASM init to complete */
  async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  /** Get parameter metadata (available after init) */
  getParams(): VSTBridgeParam[] {
    return this._params;
  }

  /** Get the synth descriptor */
  getDescriptor(): VSTBridgeDescriptor {
    return this._descriptor;
  }

  private async _initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      console.log(`[VSTBridgeSynth] Initializing ${this._descriptor.id}...`);

      // Load worklet + fetch WASM
      const { wasmBinary, jsCode } = await ensureVSTBridgeLoaded(rawContext, this._descriptor);
      console.log(`[VSTBridgeSynth] ${this._descriptor.id}: WASM loaded (${wasmBinary.byteLength} bytes, JS ${jsCode.length} chars)`);

      // Create worklet node
      const { workletNode, readyPromise } = createVSTBridgeNode(
        rawContext,
        this._descriptor,
        wasmBinary,
        jsCode,
        this.output
      );

      this._worklet = workletNode;

      // Promise that resolves once the worklet sends back param metadata
      const paramsReceived = new Promise<void>((resolve) => {
        const originalOnMessage = workletNode.port.onmessage;
        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'params') {
            this._params = event.data.params;
            // Initialize param values from defaults
            for (const p of this._params) {
              if (!this._paramValues.has(p.id)) {
                this._paramValues.set(p.id, p.defaultValue);
              }
            }
            resolve();
          }
          // Forward to the ready handler set by createVSTBridgeNode
          if (originalOnMessage) originalOnMessage.call(workletNode.port, event);
        };
      });

      // Wait for WASM ready
      await readyPromise;
      this._isReady = true;
      console.log(`[VSTBridgeSynth] ${this._descriptor.id}: WASM ready, querying params...`);

      // Query parameter metadata from WASM, then wait for the response
      this._worklet.port.postMessage({ type: 'getParams' });
      await Promise.race([paramsReceived, new Promise<void>((r) => setTimeout(r, 3000))]);
      console.log(`[VSTBridgeSynth] ${this._descriptor.id}: Init complete, ${this._params.length} params, ${this._pendingNotes.length} pending notes`);

      // Apply stored initial config if available
      if (this._initialConfig && this._descriptor.configKey) {
        const synthConfig = (this._initialConfig as unknown as Record<string, unknown>)[this._descriptor.configKey];
        if (synthConfig && typeof synthConfig === 'object') {
          this.applyConfig(synthConfig as Record<string, number>);
        }
      }

      // Process any pending notes
      for (const { note, velocity } of this._pendingNotes) {
        this._worklet.port.postMessage({ type: 'noteOn', note, velocity });
      }
      this._pendingNotes = [];
    } catch (error) {
      console.error(`[VSTBridgeSynth] Failed to init ${this._descriptor.id}:`, error);
    }
  }

  triggerAttack(frequency: number | string, _time?: number, velocity = 1): this {
    const midiNote = noteToMidi(frequency);
    const vel = Math.round(velocity * 127);
    this._currentMidiNote = midiNote;

    if (this._worklet && this._isReady) {
      this._worklet.port.postMessage({ type: 'noteOn', note: midiNote, velocity: vel });
    } else {
      this._pendingNotes.push({ note: midiNote, velocity: vel });
    }
    return this;
  }

  triggerRelease(frequency?: number | string, time?: number): this {
    void time;
    if (!this._worklet) return this;

    if (frequency !== undefined) {
      const midiNote = noteToMidi(frequency);
      this._worklet.port.postMessage({ type: 'noteOff', note: midiNote });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }
    return this;
  }

  triggerAttackRelease(
    frequency: number | string,
    duration: number,
    _time?: number,
    velocity = 1
  ): this {
    this.triggerAttack(frequency, _time, velocity);
    setTimeout(() => this.triggerRelease(frequency), duration * 1000);
    return this;
  }

  /**
   * Set a parameter by name or numeric ID.
   * Name lookup matches against WASM parameter metadata.
   */
  set(param: string, value: number): void {
    if (!this._worklet) return;

    let paramId: number;
    if (/^\d+$/.test(param)) {
      paramId = parseInt(param, 10);
    } else {
      const found = this._params.find(
        (p) => p.name === param || p.name.toLowerCase() === param.toLowerCase()
      );
      if (!found) {
        console.warn(`[VSTBridgeSynth] Unknown param '${param}' for ${this._descriptor.id}`);
        return;
      }
      paramId = found.id;
    }

    this._paramValues.set(paramId, value);
    this._worklet.port.postMessage({ type: 'parameter', paramId, value });
  }

  /** Get a cached parameter value */
  get(param: string): number | undefined {
    let paramId: number;
    if (/^\d+$/.test(param)) {
      paramId = parseInt(param, 10);
    } else {
      const found = this._params.find(
        (p) => p.name === param || p.name.toLowerCase() === param.toLowerCase()
      );
      if (!found) return undefined;
      paramId = found.id;
    }
    return this._paramValues.get(paramId);
  }

  /**
   * Get all automatable parameters from the WASM plugin metadata.
   */
  getAutomatableParams(): Array<{ id: string; name: string; min: number; max: number; section?: string }> {
    return this._params.map((p) => ({
      id: `${this._descriptor.id}.${p.name}`,
      name: p.name,
      min: p.min ?? 0,
      max: p.max ?? 1,
      section: undefined,
    }));
  }

  /** Set a WASM parameter by numeric ID directly */
  setParameter(paramId: number, value: number): void {
    if (!this._worklet) return;
    this._paramValues.set(paramId, value);
    this._worklet.port.postMessage({ type: 'parameter', paramId, value });
  }

  /**
   * Apply a config object to the WASM synth.
   * Uses the descriptor's paramMapping (explicit config-key → WASM-param-ID table)
   * to translate UI config into setParameter() calls.
   * Falls back to WASM name matching when no mapping is available.
   */
  applyConfig(config: Record<string, unknown>): void {
    if (!this._worklet || !this._isReady) return;

    const mapping = this._descriptor.paramMapping;

    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== 'number') continue;

      // Try explicit mapping first (fast, exact)
      if (mapping && key in mapping) {
        this.setParameter(mapping[key], value);
        continue;
      }

      // Fallback: try to match against WASM parameter metadata by name
      if (this._params.length > 0) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const found = this._params.find((p) => {
          const normalizedName = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return normalizedName === normalizedKey;
        });
        if (found) {
          this.setParameter(found.id, value);
        }
      }
    }
  }

  /** Get a WASM parameter by numeric ID */
  getParameter(paramId: number): number | undefined {
    return this._paramValues.get(paramId);
  }

  /** Send MIDI CC */
  controlChange(cc: number, value: number): void {
    this._worklet?.port.postMessage({ type: 'controlChange', cc, value });
  }

  /** Send pitch bend (14-bit, 8192 = center) */
  pitchBend(value: number): void {
    this._worklet?.port.postMessage({ type: 'pitchBend', value });
  }

  /**
   * Set oscillator frequency in Hz for tracker effect commands.
   * Converts to MIDI pitch bend (±2 semitone range = standard).
   */
  setFrequency(hz: number): void {
    if (!this._worklet || hz <= 0) return;
    const currentNoteHz = 440 * Math.pow(2, (this._currentMidiNote - 69) / 12);
    const semitoneOffset = 12 * Math.log2(hz / currentNoteHz);
    // Standard MIDI pitch bend range is ±2 semitones
    const bendRange = 2;
    const normalized = Math.max(-1, Math.min(1, semitoneOffset / bendRange));
    const midiValue = Math.round(8192 + normalized * 8191);
    this.pitchBend(midiValue);
  }

  /** Send program change */
  programChange(program: number): void {
    this._worklet?.port.postMessage({ type: 'programChange', program });
  }

  /**
   * Send an extension command to the WASM synth.
   * Routes through handleCommand() on the C++ side.
   * Returns a promise that resolves with whether the command was handled.
   */
  async sendCommand(commandType: string, data?: Uint8Array): Promise<boolean> {
    if (!this._worklet || !this._isReady) return false;

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2000);

      const handler = (event: MessageEvent) => {
        if (event.data.type === 'commandResult' && event.data.commandType === commandType) {
          clearTimeout(timeout);
          this._worklet?.port.removeEventListener('message', handler);
          resolve(event.data.handled);
        }
      };

      this._worklet!.port.addEventListener('message', handler);
      this._worklet!.port.postMessage({
        type: 'command',
        commandType,
        data: data ? Array.from(data) : [],
      });
    });
  }

  /** Volume offset for normalization (in dB) */
  setVolumeOffset(db: number): void {
    const linearGain = Math.pow(10, db / 20);
    this.output.gain.value = linearGain;
  }

  dispose(): void {
    this._worklet?.port.postMessage({ type: 'allNotesOff' });
    this._worklet?.port.postMessage({ type: 'dispose' });
    this._worklet?.disconnect();
    this._worklet = null;
    this.output.disconnect();
  }
}
