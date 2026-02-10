/**
 * WAMSynth.ts - Web Audio Module (WAM) wrapper for DEViLBOX
 * Implements DevilboxSynth interface — uses native Web Audio directly, no Tone.js base class.
 *
 * Host initialization follows the WAM 2.0 SDK pattern:
 *   1. Register WamEnv + WamGroup worklet processors (once per AudioContext)
 *   2. Use WAMPlugin.createInstance(hostGroupId, audioContext) to instantiate
 * Reference: /Reference Code/wam-sdk-master/
 */

import type { DevilboxSynth } from '@/types/synth';
import type { WAMConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

// ── WAM 2.0 SDK inline (from wam-sdk-master/src/) ──────────────────────

const WAM_API_VERSION = '2.0.0-alpha.6';

/**
 * Stringify a function and register it as an AudioWorklet module via Blob URL.
 * Equivalent to wam-sdk addFunctionModule.js
 */
const addFunctionModule = (
  audioWorklet: AudioWorklet,
  processorFunction: (...args: any[]) => void,
  ...injection: any[]
): Promise<void> => {
  const text = `(${processorFunction.toString()})(${injection.map((s) => JSON.stringify(s)).join(', ')});`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  return audioWorklet.addModule(url);
};

/**
 * Registers globalThis.webAudioModules (WamEnv) in the AudioWorklet scope.
 * Equivalent to wam-sdk WamEnv.js — this function is serialized to a string
 * and executed inside the worklet, so it must be fully self-contained.
 */
const initializeWamEnv = (apiVersion: string) => {
  const audioWorkletGlobalScope = globalThis as any;
  if (audioWorkletGlobalScope.AudioWorkletProcessor
    && audioWorkletGlobalScope.webAudioModules) return;

  const moduleScopes = new Map();
  const groups = new Map();

  class WamEnv {
    get apiVersion() { return apiVersion; }
    getModuleScope(moduleId: string) {
      if (!moduleScopes.has(moduleId)) moduleScopes.set(moduleId, {});
      return moduleScopes.get(moduleId);
    }
    getGroup(groupId: string, groupKey: string) {
      const group = groups.get(groupId);
      if (group.validate(groupKey)) return group;
      else throw new Error('Invalid key');
    }
    addGroup(group: any) {
      if (!groups.has(group.groupId)) groups.set(group.groupId, group);
    }
    removeGroup(group: any) { groups.delete(group.groupId); }
    addWam(wam: any) { groups.get(wam.groupId)?.addWam(wam); }
    removeWam(wam: any) { groups.get(wam.groupId)?.removeWam(wam); }
    connectEvents(groupId: string, fromId: string, toId: string, output = 0) {
      groups.get(groupId)?.connectEvents(fromId, toId, output);
    }
    disconnectEvents(groupId: string, fromId: string, toId?: string, output?: number) {
      groups.get(groupId)?.disconnectEvents(fromId, toId, output);
    }
    emitEvents(from: any, ...events: any[]) {
      groups.get(from.groupId)?.emitEvents(from, ...events);
    }
  }

  if (audioWorkletGlobalScope.AudioWorkletProcessor) {
    if (!audioWorkletGlobalScope.webAudioModules) {
      audioWorkletGlobalScope.webAudioModules = new WamEnv();
    }
  }
};

/**
 * Registers a WamGroup in the AudioWorklet scope.
 * Equivalent to wam-sdk WamGroup.js — serialized and executed in the worklet.
 */
const initializeWamGroup = (groupId: string, groupKey: string) => {
  const audioWorkletGlobalScope = globalThis as any;

  class WamGroup {
    _groupId: string;
    _validate: (key: string) => boolean;
    _processors = new Map();
    _eventGraph = new Map();
    constructor(gId: string, gKey: string) {
      this._groupId = gId;
      this._validate = (key: string) => key === gKey;
    }
    get groupId() { return this._groupId; }
    get processors() { return this._processors; }
    get eventGraph() { return this._eventGraph; }
    validate(key: string) { return this._validate(key); }
    addWam(wam: any) { this._processors.set(wam.instanceId, wam); }
    removeWam(wam: any) {
      if (this._eventGraph.has(wam)) this._eventGraph.delete(wam);
      this._eventGraph.forEach((outputMap: any[]) => {
        outputMap.forEach((set: Set<any>) => { if (set) set.delete(wam); });
      });
      this._processors.delete(wam.instanceId);
    }
    connectEvents(fromId: string, toId: string, output = 0) {
      const from = this._processors.get(fromId);
      const to = this._processors.get(toId);
      let outputMap: any[];
      if (this._eventGraph.has(from)) { outputMap = this._eventGraph.get(from); }
      else { outputMap = []; this._eventGraph.set(from, outputMap); }
      if (outputMap[output]) { outputMap[output].add(to); }
      else { const set = new Set(); set.add(to); outputMap[output] = set; }
    }
    disconnectEvents(fromId: string, toId?: string, output?: number) {
      const from = this._processors.get(fromId);
      if (!this._eventGraph.has(from)) return;
      const outputMap = this._eventGraph.get(from);
      if (typeof toId === 'undefined') {
        outputMap.forEach((set: Set<any>) => { if (set) set.clear(); });
        return;
      }
      const to = this._processors.get(toId);
      if (typeof output === 'undefined') {
        outputMap.forEach((set: Set<any>) => { if (set) set.delete(to); });
        return;
      }
      if (!outputMap[output]) return;
      outputMap[output].delete(to);
    }
    emitEvents(from: any, ...events: any[]) {
      if (!this._eventGraph.has(from)) return;
      this._eventGraph.get(from).forEach((set: Set<any>) => {
        if (set) set.forEach((wam: any) => wam.scheduleEvents(...events));
      });
    }
  }

  if (audioWorkletGlobalScope.AudioWorkletProcessor) {
    audioWorkletGlobalScope.webAudioModules.addGroup(new WamGroup(groupId, groupKey));
  }
};

// ── WAMSynth ────────────────────────────────────────────────────────────

/**
 * WAMSynth - Host for Web Audio Modules
 * Implements DevilboxSynth: uses native Web Audio AudioNode output, no Tone.js base class.
 */
export class WAMSynth implements DevilboxSynth {
  readonly name = 'WAMSynth';
  readonly output: GainNode;

  private _wamInstance: any = null;
  private _wamNode: AudioNode | null = null;
  private _config: WAMConfig;
  private _isInitialized = false;
  private _initPromise: Promise<void>;
  private _releaseTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private _activeNotes: Set<number> = new Set();
  private _audioContext: AudioContext;

  // WAM host state — initialized once per AudioContext
  private static _hostInitPromise: Promise<[string, string]> | null = null;


  /**
   * Initialize the WAM 2.0 host environment for an AudioContext.
   * Registers WamEnv and WamGroup worklet processors.
   * Safe to call multiple times — only runs once.
   */
  private static initializeHost(audioContext: AudioContext): Promise<[string, string]> {
    if (WAMSynth._hostInitPromise) return WAMSynth._hostInitPromise;

    const hostGroupId = `devilbox-host-${performance.now()}`;
    const hostGroupKey = performance.now().toString();

    WAMSynth._hostInitPromise = (async () => {
      await addFunctionModule(audioContext.audioWorklet, initializeWamEnv as any, WAM_API_VERSION);
      await addFunctionModule(audioContext.audioWorklet, initializeWamGroup as any, hostGroupId, hostGroupKey);

      console.log(`[WAMSynth] WAM host initialized (groupId: ${hostGroupId})`);
      return [hostGroupId, hostGroupKey] as [string, string];
    })();

    return WAMSynth._hostInitPromise;
  }

  constructor(config: WAMConfig) {
    this._audioContext = getDevilboxAudioContext();
    this.output = this._audioContext.createGain();
    this.output.gain.value = 1;
    this._config = config;
    this._initPromise = this._initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  /**
   * Initialize the WAM plugin
   */
  private async _initialize(): Promise<void> {
    if (!this._config.moduleUrl) {
      console.warn('[WAMSynth] No module URL provided');
      return;
    }

    try {
      console.log(`[WAMSynth] Initializing module from URL: ${this._config.moduleUrl}`);
      const ctx = this._audioContext;

      // 1. Initialize WAM host (registers worklet processors, runs once)
      const [hostGroupId] = await WAMSynth.initializeHost(ctx);

      // 2. Import the WAM module
      console.log(`[WAMSynth] Importing module: ${this._config.moduleUrl}`);
      const { default: WAMExport } = await import(/* @vite-ignore */ this._config.moduleUrl);

      if (!WAMExport || typeof WAMExport !== 'function') {
        throw new Error('Invalid WAM: Default export is not a constructor or factory function');
      }

      // 3. Create WAM instance using the SDK-standard pattern
      const isClass = /^class\s/.test(WAMExport.toString());

      if (isClass && typeof WAMExport.createInstance === 'function') {
        // WAM 2.0 standard: static createInstance(groupId, audioContext)
        this._wamInstance = await WAMExport.createInstance(hostGroupId, ctx);
      } else if (isClass) {
        // Class without static createInstance — manual sequence
        const wamPlugin = new WAMExport(hostGroupId, ctx);
        if (typeof wamPlugin.initialize === 'function') {
          await wamPlugin.initialize();
        }
        this._wamInstance = wamPlugin;
      } else {
        // Legacy factory function pattern
        this._wamInstance = await WAMExport(ctx, hostGroupId);
      }

      // 4. Get the audio node (createInstance sets it via initialize → createAudioNode)
      if (this._wamInstance.audioNode) {
        this._wamNode = this._wamInstance.audioNode;
      } else if (typeof this._wamInstance.createAudioNode === 'function') {
        this._wamNode = await this._wamInstance.createAudioNode();
      }

      if (!this._wamNode) {
        throw new Error('Failed to create WAM audio node');
      }

      // 5. Connect WAM node → native GainNode output
      this._wamNode.connect(this.output);

      // 6. Restore state if available
      if (this._config.pluginState && this._wamInstance.setState) {
        try {
          await this._wamInstance.setState(this._config.pluginState);
        } catch (stateErr) {
          console.warn('[WAMSynth] Failed to restore plugin state, starting fresh:', stateErr);
          this._config.pluginState = null;
        }
      }

      this._isInitialized = true;
      console.log(`[WAMSynth] Loaded plugin: ${this._wamInstance.descriptor?.name || 'Unknown'}`);

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      let userMessage: string;

      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::ERR_')) {
        userMessage = `Network error loading WAM module. Check that the URL is correct and accessible: ${this._config.moduleUrl}`;
      } else if (msg.includes('CORS') || msg.includes('cross-origin') || msg.includes('has been blocked')) {
        userMessage = `CORS policy blocked loading this WAM module. The server hosting the plugin must allow cross-origin requests. URL: ${this._config.moduleUrl}`;
      } else if (msg.includes('not a valid JavaScript MIME type') || msg.includes('SyntaxError') || msg.includes('Unexpected token')) {
        userMessage = `Invalid module format. The URL does not point to a valid WAM 2.0 JavaScript module. Ensure the URL points to the plugin's index.js entry point.`;
      } else {
        userMessage = `WAM initialization failed: ${msg}`;
      }

      console.error('[WAMSynth] Initialization failed:', error);
      throw new Error(userMessage);
    }
  }

  /**
   * Send a MIDI event through the best available delivery method
   */
  private _sendMidi(event: number[], time: number): void {
    if (this._wamInstance.onMidi) {
      this._wamInstance.onMidi(event, time);
    } else if ((this._wamNode as any)?.scheduleEvents) {
      (this._wamNode as any).scheduleEvents({
        type: 'wam-midi',
        data: { bytes: event },
        time,
      });
    } else if ((this._wamNode as any)?.port) {
      (this._wamNode as any).port.postMessage({
        type: 'wam-midi',
        data: { bytes: event },
        time,
      });
    }
  }

  /**
   * Trigger a note attack
   */
  triggerAttack(frequency: number | string, time?: number, velocity = 1): this {
    if (!this._isInitialized || !this._wamInstance) return this;

    const midiNote = noteToMidi(frequency);
    const vel = Math.round(velocity * 127);
    const triggerTime = time ?? this._audioContext.currentTime;

    this._activeNotes.add(midiNote);
    this._sendMidi([0x90, midiNote, vel], triggerTime);

    return this;
  }

  /**
   * Trigger a note release
   */
  triggerRelease(frequency?: number | string, time?: number): this {
    if (!this._isInitialized || !this._wamInstance) return this;

    const triggerTime = time ?? this._audioContext.currentTime;

    if (frequency !== undefined) {
      const midiNote = noteToMidi(frequency);
      this._activeNotes.delete(midiNote);
      this._sendMidi([0x80, midiNote, 0], triggerTime);
    } else {
      // Release all tracked notes individually, then CC#123 as safety net
      for (const activeNote of this._activeNotes) {
        this._sendMidi([0x80, activeNote, 0], triggerTime);
      }
      this._activeNotes.clear();
      this._sendMidi([0xB0, 123, 0], triggerTime);
    }

    return this;
  }

  /**
   * Trigger attack then release after duration
   */
  triggerAttackRelease(
    note: number | string,
    duration: number,
    time?: number,
    velocity: number = 1
  ): this {
    this.triggerAttack(note, time, velocity);

    const releaseTime = (time ?? this._audioContext.currentTime) + duration;

    const timer = setTimeout(() => {
      this._releaseTimers.delete(timer);
      if (this._isInitialized && this._wamInstance) {
        this.triggerRelease(note, releaseTime);
      }
    }, duration * 1000);
    this._releaseTimers.add(timer);

    return this;
  }

  /**
   * Release all active notes
   */
  releaseAll(time?: number): this {
    return this.triggerRelease(undefined, time);
  }

  /**
   * Update plugin state
   */
  async setPluginState(state: any): Promise<void> {
    if (this._isInitialized && this._wamInstance?.setState) {
      try {
        await this._wamInstance.setState(state);
        this._config.pluginState = state;
        this._config.pluginStateTimestamp = Date.now();
      } catch (err) {
        console.warn('[WAMSynth] Failed to set plugin state:', err);
      }
    } else {
      this._config.pluginState = state;
    }
  }

  /**
   * Get current plugin state
   */
  async getPluginState(): Promise<any> {
    if (this._isInitialized && this._wamInstance?.getState) {
      const state = await this._wamInstance.getState();
      return { state, timestamp: Date.now(), version: 1 };
    }
    return this._config.pluginState;
  }

  /**
   * Set a parameter value
   * @param id Parameter ID (string or index)
   * @param value Normalized value (0-1)
   */
  async setParameter(id: string | number, value: number): Promise<void> {
    if (!this._isInitialized || !this._wamInstance) return;

    if (this._wamInstance.setParameterValues) {
      // WAM 2.0 standard
      const paramId = typeof id === 'number' ? id.toString() : id;
      await this._wamInstance.setParameterValues({ [paramId]: { id: paramId, value } });
    }
  }

  /**
   * Get all parameters
   */
  async getParameters(): Promise<any> {
    if (!this._isInitialized || !this._wamInstance) return {};

    if (this._wamInstance.getParameterInfo) {
      return await this._wamInstance.getParameterInfo();
    }
    return {};
  }

  /**
   * Create the native plugin GUI
   */
  async createGui(): Promise<HTMLElement | null> {
    if (!this._isInitialized || !this._wamInstance) return null;

    if (this._wamInstance.createGui) {
      return await this._wamInstance.createGui();
    }
    return null;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this._releaseTimers.forEach(timer => clearTimeout(timer));
    this._releaseTimers.clear();
    this._activeNotes.clear();
    if (this._wamNode) {
      this._wamNode.disconnect();
    }
    if (this._wamInstance?.destroy) {
      this._wamInstance.destroy();
    }
    this.output.disconnect();
  }
}
