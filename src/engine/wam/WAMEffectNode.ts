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
import { getDevilboxAudioContext, getNativeAudioNode } from '@/utils/audio-context';
import { WAMSynth } from './WAMSynth';

/** Minimal WAM 2.0 plugin instance interface */
interface WAMInstance {
  audioNode?: AudioNode;
  createAudioNode?: () => Promise<AudioNode>;
  createGui?: () => Promise<HTMLElement>;
  getParameterInfo?: () => Promise<Record<string, WAMParameterInfo>>;
  destroy?: () => void;
  descriptor?: { name?: string };
  initialize?: () => Promise<void>;
}

/** WAM parameter info returned from getParameterInfo() */
interface WAMParameterInfo {
  label?: string;
  type?: string;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
}

/** WAM audio node with parameter control */
interface WAMAudioNode extends AudioNode {
  setParameterValues?: (values: Record<string, { value: number }>) => Promise<void>;
}

export interface WAMEffectNodeOptions {
  moduleUrl: string;
  wet?: number; // 0-1
}

export class WAMEffectNode extends Tone.ToneAudioNode {
  readonly name = 'WAMEffect';

  // Cache imported WAM constructors to avoid re-registering AudioWorklet processors
  private static _wamModuleCache = new Map<string, unknown>();

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Internal routing
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // WAM state
  private _wamInstance: WAMInstance | null = null;
  private _wamNode: WAMAudioNode | null = null;
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

    // Wet output path — connected now so wet audio flows when WAM init connects input → WAM → wetGain
    this.wetGain.connect(this.output);

    // Wet input path deferred until WAM init
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

      // 2. Import the WAM module (cached to avoid re-registering AudioWorklet processors)
      let WAMExport: unknown;
      if (WAMEffectNode._wamModuleCache.has(this._moduleUrl)) {
        WAMExport = WAMEffectNode._wamModuleCache.get(this._moduleUrl);
      } else {
        const mod = await import(/* @vite-ignore */ this._moduleUrl);
        WAMExport = mod.default;
        if (WAMExport) {
          WAMEffectNode._wamModuleCache.set(this._moduleUrl, WAMExport);
        }
      }

      if (!WAMExport || typeof WAMExport !== 'function') {
        throw new Error('Invalid WAM: Default export is not a constructor or factory function');
      }

      // 3. Create WAM instance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const WAMClass = WAMExport as any;
      const isClass = /^class\s/.test(WAMClass.toString());

      if (isClass && typeof WAMClass.createInstance === 'function') {
        this._wamInstance = await WAMClass.createInstance(hostGroupId, ctx);
      } else if (isClass) {
        const wamPlugin = new WAMClass(hostGroupId, ctx);
        if (typeof wamPlugin.initialize === 'function') {
          await wamPlugin.initialize();
        }
        this._wamInstance = wamPlugin;
      } else {
        this._wamInstance = await WAMClass(ctx, hostGroupId);
      }

      // 4. Get audio node
      if (this._wamInstance!.audioNode) {
        this._wamNode = this._wamInstance!.audioNode;
      } else if (typeof this._wamInstance!.createAudioNode === 'function') {
        this._wamNode = await this._wamInstance!.createAudioNode();
      }

      if (!this._wamNode) {
        throw new Error('Failed to create WAM audio node');
      }

      // 5. Connect wet path: input → WAM → wetGain → output
      // Use getNativeAudioNode() to bridge Tone.js/SAC nodes to native WAM AudioNode
      const inputRaw = getNativeAudioNode(this.input);
      const wetRaw = getNativeAudioNode(this.wetGain);

      if (!inputRaw || !wetRaw) {
        throw new Error('Could not unwrap native audio nodes from Tone.js');
      }

      inputRaw.connect(this._wamNode);
      this._wamNode.connect(wetRaw);
      // wetGain → output already connected in constructor via Tone.js connect

      this._isInitialized = true;

      const descriptor = this._wamInstance?.descriptor;
      console.log(`[WAMEffectNode] Loaded: ${descriptor?.name || this._moduleUrl}`);
    } catch (error) {
      console.warn(`[WAMEffectNode] ${this._moduleUrl.split('/').slice(-2, -1)[0] || 'WAM'} failed to load — bypassed (dry passthrough)`);
      // Dry path still works — audio passes through unprocessed
    }
  }

  /**
   * Create native GUI element from the WAM plugin
   */
  async createGui(): Promise<HTMLElement | null> {
    if (!this._wamInstance) return null;

    // 1. Try the standard WAM 2.0 createGui()
    if (typeof this._wamInstance.createGui === 'function') {
      try {
        const gui = await this._wamInstance.createGui();
        if (gui) return gui;
      } catch {
        // Fall through to fallback
      }
    }

    // 2. Fallback: try to load gui.js relative to the module URL
    if (this._moduleUrl) {
      const baseUrl = this._moduleUrl.replace(/\/[^/]*$/, '/');
      const guiCandidates = ['gui.js', 'Gui/index.js', 'gui/index.js'];
      for (const guiFile of guiCandidates) {
        const guiUrl = baseUrl + guiFile;
        try {
          const guiModule = await import(/* @vite-ignore */ guiUrl);
          if (typeof guiModule.createElement === 'function') {
            const gui = await guiModule.createElement(this._wamInstance);
            if (gui) return gui as HTMLElement;
          }
        } catch {
          // This candidate doesn't exist, try next
        }
      }
    }

    return null;
  }

  /**
   * Get WAM parameters for fallback slider UI
   */
  async getParameters(): Promise<Record<string, WAMParameterInfo> | null> {
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
      if (this._wamNode.setParameterValues) {
        await this._wamNode.setParameterValues({ [id]: { value } });
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
  get descriptor(): { name?: string } | null {
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
