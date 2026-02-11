/**
 * WAMEffectNode.ts - Wraps a WAM 2.0 effect plugin as a Tone.ToneAudioNode
 *
 * Follows the same dry/wet pattern as MoogFilterEffect, SpringReverbEffect, etc.
 *   input → dryGain ────────────────→ output
 *   input → [WAM audioNode] → wetGain → output
 *
 * Dry path connects immediately (audio passes through while WAM loads async).
 * Wet path connects after WAM init completes (seamless fade-in).
 */

import * as Tone from 'tone';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { WAMSynth } from './WAMSynth';

export interface WAMEffectNodeOptions {
  moduleUrl: string;
  wet?: number; // 0-1
}

export class WAMEffectNode extends Tone.ToneAudioNode {
  readonly name = 'WAMEffect';

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Internal routing
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // WAM state
  private _wamInstance: any = null;
  private _wamNode: AudioNode | null = null;
  private _moduleUrl: string;
  private _audioContext: AudioContext;
  private _initPromise: Promise<void>;
  private _isInitialized = false;

  constructor(options: WAMEffectNodeOptions) {
    super();

    this._moduleUrl = options.moduleUrl;
    this._audioContext = getDevilboxAudioContext();

    const wet = options.wet ?? 1.0;

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Dry/wet mixing
    this.dryGain = new Tone.Gain(1 - wet);
    this.wetGain = new Tone.Gain(wet);

    // Dry path — connects immediately so audio passes through while WAM loads
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path deferred until WAM init
    this._initPromise = this._initialize();
  }

  /**
   * Wait for WAM initialization to complete
   */
  async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Initialize the WAM effect plugin
   */
  private async _initialize(): Promise<void> {
    if (!this._moduleUrl) {
      console.warn('[WAMEffectNode] No module URL provided');
      return;
    }

    try {
      const ctx = this._audioContext;

      // 1. Initialize WAM host (reuses WAMSynth's static host init)
      const [hostGroupId] = await WAMSynth.initializeHost(ctx);

      // 2. Import the WAM module
      const { default: WAMExport } = await import(/* @vite-ignore */ this._moduleUrl);

      if (!WAMExport || typeof WAMExport !== 'function') {
        throw new Error('Invalid WAM: Default export is not a constructor or factory function');
      }

      // 3. Create WAM instance
      const isClass = /^class\s/.test(WAMExport.toString());

      if (isClass && typeof WAMExport.createInstance === 'function') {
        this._wamInstance = await WAMExport.createInstance(hostGroupId, ctx);
      } else if (isClass) {
        const wamPlugin = new WAMExport(hostGroupId, ctx);
        if (typeof wamPlugin.initialize === 'function') {
          await wamPlugin.initialize();
        }
        this._wamInstance = wamPlugin;
      } else {
        this._wamInstance = await WAMExport(ctx, hostGroupId);
      }

      // 4. Get audio node
      if (this._wamInstance.audioNode) {
        this._wamNode = this._wamInstance.audioNode;
      } else if (typeof this._wamInstance.createAudioNode === 'function') {
        this._wamNode = await this._wamInstance.createAudioNode();
      }

      if (!this._wamNode) {
        throw new Error('Failed to create WAM audio node');
      }

      // 5. Connect wet path: input → WAM → wetGain → output
      // Use Tone.js connect for input (Tone.Gain → native AudioNode)
      // and native connect for WAM → wetGain → output
      const inputRaw = (this.input as any)._gainNode as GainNode;
      const wetRaw = (this.wetGain as any)._gainNode as GainNode;
      const outRaw = (this.output as any)._gainNode as GainNode;

      inputRaw.connect(this._wamNode);
      this._wamNode.connect(wetRaw);
      wetRaw.connect(outRaw);

      this._isInitialized = true;

      const descriptor = this._wamInstance?.descriptor;
      console.log(`[WAMEffectNode] Loaded: ${descriptor?.name || this._moduleUrl}`);
    } catch (error) {
      console.error('[WAMEffectNode] Initialization failed:', error);
      // Dry path still works — audio passes through unprocessed
    }
  }

  /**
   * Create native GUI element from the WAM plugin
   */
  async createGui(): Promise<HTMLElement | null> {
    if (!this._wamInstance || typeof this._wamInstance.createGui !== 'function') return null;
    try {
      return await this._wamInstance.createGui();
    } catch {
      return null;
    }
  }

  /**
   * Get WAM parameters for fallback slider UI
   */
  async getParameters(): Promise<Record<string, any> | null> {
    if (!this._wamInstance) return null;
    try {
      if (typeof this._wamInstance.getParameterInfo === 'function') {
        return await this._wamInstance.getParameterInfo();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Set a WAM parameter
   */
  async setParameter(id: string, value: number): Promise<void> {
    if (!this._wamInstance || !this._wamNode) return;
    try {
      if ((this._wamNode as any).setParameterValues) {
        await (this._wamNode as any).setParameterValues({ [id]: { value } });
      }
    } catch {
      // Silently ignore parameter set failures
    }
  }

  /**
   * Set wet/dry mix
   */
  setWet(wet: number): void {
    const w = Math.max(0, Math.min(1, wet));
    this.wetGain.gain.value = w;
    this.dryGain.gain.value = 1 - w;
  }

  /**
   * Get the WAM descriptor
   */
  get descriptor(): any {
    return this._wamInstance?.descriptor || null;
  }

  dispose(): this {
    try {
      if (this._wamNode) {
        this._wamNode.disconnect();
        if (this._wamInstance && typeof this._wamInstance.destroy === 'function') {
          this._wamInstance.destroy();
        }
      }
    } catch {
      // Ignore disposal errors
    }

    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();

    return super.dispose();
  }
}
