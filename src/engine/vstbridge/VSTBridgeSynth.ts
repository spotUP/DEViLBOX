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

  constructor(descriptor: VSTBridgeDescriptor, _config?: InstrumentConfig) {
    this._descriptor = descriptor;
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

      // Load worklet + fetch WASM
      const { wasmBinary, jsCode } = await ensureVSTBridgeLoaded(rawContext, this._descriptor);

      // Create worklet node
      const { workletNode, readyPromise } = createVSTBridgeNode(
        rawContext,
        this._descriptor,
        wasmBinary,
        jsCode,
        this.output
      );

      this._worklet = workletNode;

      // Listen for param metadata and other messages
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
        }
        // Forward to the ready handler set by createVSTBridgeNode
        if (originalOnMessage) originalOnMessage.call(workletNode.port, event);
      };

      // Wait for WASM ready
      await readyPromise;
      this._isReady = true;

      // Query parameter metadata from WASM
      this._worklet.port.postMessage({ type: 'getParams' });

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

    if (this._worklet && this._isReady) {
      this._worklet.port.postMessage({ type: 'noteOn', note: midiNote, velocity: vel });
    } else {
      this._pendingNotes.push({ note: midiNote, velocity: vel });
    }
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
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

  /** Set a WASM parameter by numeric ID directly */
  setParameter(paramId: number, value: number): void {
    if (!this._worklet) return;
    this._paramValues.set(paramId, value);
    this._worklet.port.postMessage({ type: 'parameter', paramId, value });
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
