/**
 * V2RealtimeSynth.ts
 * 
 * TypeScript wrapper for the V2 synthesizer WASM module.
 * Provides real-time note-on/off, CC, patch loading, and parameter control.
 */

import type { V2InstrumentConfig, V2GlobalEffects } from '../../types/v2Instrument';
import { v2ConfigToBytes, DEFAULT_V2_GLOBALS } from '../../types/v2Instrument';

export interface V2SynthOptions {
  sampleRate?: number;
}

export class V2RealtimeSynth {
  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private configs: (V2InstrumentConfig | null)[] = Array(16).fill(null);
  private globalEffects: V2GlobalEffects = { ...DEFAULT_V2_GLOBALS };

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /**
   * Initialize the V2 synth WASM module
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInit();
    await this.initPromise;
  }

  private async _doInit(): Promise<void> {
    try {
      // Register the worklet processor
      await this.audioContext.audioWorklet.addModule('/V2Synth.worklet.js');

      // Create worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'v2-synth-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Set up message handler
      this.workletNode.port.onmessage = (e) => this.handleMessage(e.data);

      // Fetch WASM and JS
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch('/V2Synth.wasm'),
        fetch('/V2Synth.js'),
      ]);

      if (!wasmResponse.ok || !jsResponse.ok) {
        throw new Error('Failed to fetch V2Synth WASM or JS');
      }

      const [wasmBinary, jsCode] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text(),
      ]);

      // Initialize worklet
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('V2Synth init timeout')), 10000);
        
        const onMessage = (e: MessageEvent) => {
          if (e.data.type === 'initialized') {
            clearTimeout(timeout);
            this.workletNode!.port.removeEventListener('message', onMessage as unknown as EventListener);
            resolve();
          } else if (e.data.type === 'error') {
            clearTimeout(timeout);
            this.workletNode!.port.removeEventListener('message', onMessage as unknown as EventListener);
            reject(new Error(e.data.error));
          }
        };

        this.workletNode!.port.addEventListener('message', onMessage as unknown as EventListener);
        this.workletNode!.port.postMessage({
          type: 'init',
          sampleRate: this.audioContext.sampleRate,
          wasmBinary: new Uint8Array(wasmBinary),
          jsCode,
        });
      });

      this.initialized = true;
      console.log('[V2RealtimeSynth] Initialized');
    } catch (error) {
      console.error('[V2RealtimeSynth] Init failed:', error);
      throw error;
    }
  }

  private handleMessage(msg: { type: string; [key: string]: unknown }) {
    switch (msg.type) {
      case 'error':
        console.error('[V2RealtimeSynth] Worklet error:', msg.error);
        break;
      case 'patchLoaded':
        console.log('[V2RealtimeSynth] Patch loaded on channel', msg.channel);
        break;
    }
  }

  /**
   * Connect synth output to destination
   */
  connect(destination: AudioNode): void {
    if (this.workletNode) {
      this.workletNode.connect(destination);
    }
  }

  /**
   * Disconnect synth from all destinations
   */
  disconnect(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
    }
  }

  /**
   * Load a patch configuration to a channel
   */
  loadPatch(channel: number, config: V2InstrumentConfig): void {
    if (!this.initialized || !this.workletNode) {
      console.warn('[V2RealtimeSynth] Cannot load patch - not initialized');
      return;
    }

    if (channel < 0 || channel > 15) {
      console.warn('[V2RealtimeSynth] Invalid channel:', channel);
      return;
    }

    this.configs[channel] = config;
    const patchData = v2ConfigToBytes(config);

    this.workletNode.port.postMessage({
      type: 'loadPatch',
      channel,
      patchData,
    });
  }

  /**
   * Set global effects (reverb, delay, etc.)
   */
  setGlobals(effects: V2GlobalEffects): void {
    if (!this.initialized || !this.workletNode) {
      console.warn('[V2RealtimeSynth] Cannot set globals - not initialized');
      return;
    }

    this.globalEffects = effects;
    const globalsData = this.globalsToBytes(effects);

    this.workletNode.port.postMessage({
      type: 'setGlobals',
      globalsData,
    });
  }

  private globalsToBytes(effects: V2GlobalEffects): Uint8Array {
    const bytes = new Uint8Array(32);
    let i = 0;

    bytes[i++] = effects.reverbTime;
    bytes[i++] = effects.reverbHighCut;
    bytes[i++] = effects.reverbLowCut;
    bytes[i++] = effects.reverbVolume;

    bytes[i++] = effects.delayVolume;
    bytes[i++] = effects.delayFeedback;
    bytes[i++] = effects.delayL;
    bytes[i++] = effects.delayR;
    bytes[i++] = effects.delayModRate;
    bytes[i++] = effects.delayModDepth;
    bytes[i++] = effects.delayModPhase;

    bytes[i++] = effects.lowCut;
    bytes[i++] = effects.highCut;

    // Sum compressor
    const comp = effects.sumCompressor;
    bytes[i++] = ['off', 'peak', 'rms'].indexOf(comp.mode);
    bytes[i++] = comp.stereoLink ? 1 : 0;
    bytes[i++] = comp.autoGain ? 1 : 0;
    bytes[i++] = comp.lookahead;
    bytes[i++] = comp.threshold;
    bytes[i++] = comp.ratio;
    bytes[i++] = comp.attack;
    bytes[i++] = comp.release;
    bytes[i++] = comp.outGain;

    return bytes.slice(0, i);
  }

  /**
   * Send note-on event
   */
  noteOn(channel: number, note: number, velocity: number): void {
    if (!this.initialized || !this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'noteOn',
      channel: channel & 0x0F,
      note: note & 0x7F,
      velocity: velocity & 0x7F,
    });
  }

  /**
   * Send note-off event
   */
  noteOff(channel: number, note: number): void {
    if (!this.initialized || !this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'noteOff',
      channel: channel & 0x0F,
      note: note & 0x7F,
    });
  }

  /**
   * Send control change (CC) event
   */
  controlChange(channel: number, cc: number, value: number): void {
    if (!this.initialized || !this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'controlChange',
      channel: channel & 0x0F,
      cc: cc & 0x7F,
      value: value & 0x7F,
    });
  }

  /**
   * Send pitch bend event
   */
  pitchBend(channel: number, value: number): void {
    if (!this.initialized || !this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'pitchBend',
      channel: channel & 0x0F,
      value: value & 0x3FFF, // 14-bit
    });
  }

  /**
   * Send program change event
   */
  programChange(channel: number, program: number): void {
    if (!this.initialized || !this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'programChange',
      channel: channel & 0x0F,
      program: program & 0x7F,
    });
  }

  /**
   * Stop all notes on a channel
   */
  allNotesOff(channel: number): void {
    if (!this.initialized || !this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'allNotesOff',
      channel: channel & 0x0F,
    });
  }

  /**
   * Stop all notes on all channels
   */
  panic(): void {
    for (let ch = 0; ch < 16; ch++) {
      this.allNotesOff(ch);
    }
  }

  /**
   * Get the current patch config for a channel
   */
  getPatchConfig(channel: number): V2InstrumentConfig | null {
    return this.configs[channel] ?? null;
  }

  /**
   * Get the current global effects config
   */
  getGlobals(): V2GlobalEffects {
    return this.globalEffects;
  }

  /**
   * Check if the synth is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup and release resources
   */
  dispose(): void {
    if (this.workletNode) {
      this.panic();
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.initialized = false;
    this.initPromise = null;
    this.configs = Array(16).fill(null);
  }
}

/**
 * Singleton factory for V2 synth
 */
let synthInstance: V2RealtimeSynth | null = null;

export async function getV2Synth(audioContext: AudioContext): Promise<V2RealtimeSynth> {
  if (!synthInstance) {
    synthInstance = new V2RealtimeSynth(audioContext);
    await synthInstance.init();
  }
  return synthInstance;
}

export function disposeV2Synth(): void {
  if (synthInstance) {
    synthInstance.dispose();
    synthInstance = null;
  }
}
