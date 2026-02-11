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
  private _pluginType: 'instrument' | 'effect' | 'unknown' = 'unknown';

  // Internal tone generator for effect plugins (effects need audio input to process)
  private _inputGain: GainNode | null = null;
  private _activeOscillators: Map<number, { osc: OscillatorNode; gain: GainNode }> = new Map();

  // WAM host state — initialized once per AudioContext
  private static _hostInitPromise: Promise<[string, string]> | null = null;


  /**
   * Initialize the WAM 2.0 host environment for an AudioContext.
   * Registers WamEnv and WamGroup worklet processors.
   * Safe to call multiple times — only runs once.
   */
  public static initializeHost(audioContext: AudioContext): Promise<[string, string]> {
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

  /** Returns the detected plugin type: 'instrument', 'effect', or 'unknown' */
  public get pluginType(): 'instrument' | 'effect' | 'unknown' {
    return this._pluginType;
  }

  /** Returns the WAM descriptor (name, vendor, keywords, etc.) */
  public get descriptor(): any {
    return this._wamInstance?.descriptor || null;
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

      // 5. Detect plugin type BEFORE connecting (needed for routing decision)
      const descriptor = this._wamInstance.descriptor;
      if (descriptor) {
        // WAM 2.0 descriptors may have isInstrument/hasAudioInput booleans
        if (descriptor.isInstrument === true) {
          this._pluginType = 'instrument';
        } else if (descriptor.isInstrument === false) {
          this._pluginType = 'effect';
        } else {
          // Fall back to keyword detection
          const keywords: string[] = descriptor.keywords || [];
          const kwInstrument = keywords.includes('instrument') || keywords.includes('synth') || keywords.includes('synthesizer');
          const kwEffect = keywords.includes('effect') || keywords.includes('fx') || keywords.includes('audio-effect');
          if (kwInstrument) {
            this._pluginType = 'instrument';
          } else if (kwEffect) {
            this._pluginType = 'effect';
          } else {
            // Check descriptor name/description for instrument-related words
            const text = `${descriptor.name || ''} ${descriptor.description || ''}`.toLowerCase();
            if (/synth|instrument|piano|organ|drum/i.test(text)) {
              this._pluginType = 'instrument';
            }
          }
        }
      }
      // Check our own curated registry as authoritative override
      if (this._pluginType === 'unknown' && this._config.moduleUrl) {
        const { WAM_SYNTH_PLUGINS } = await import('@/constants/wamPlugins');
        const entry = WAM_SYNTH_PLUGINS.find(p => this._config.moduleUrl.includes(p.url) || p.url.includes(this._config.moduleUrl));
        if (entry) {
          this._pluginType = entry.type === 'instrument' ? 'instrument' : entry.type === 'effect' ? 'effect' : 'unknown';
        }
      }
      // Last resort heuristic: if still unknown and has audio inputs, likely an effect
      if (this._pluginType === 'unknown' && this._wamNode.numberOfInputs > 0) {
        this._pluginType = 'effect';
      }

      // 6. Connect based on plugin type
      if (this._pluginType === 'effect') {
        // Effect plugins: create an input gain mixer → WAM effect → output
        // Individual oscillators will connect to this mixer on note-on
        this._inputGain = ctx.createGain();
        this._inputGain.gain.value = 1;
        this._inputGain.connect(this._wamNode);
        this._wamNode.connect(this.output);
        console.log('[WAMSynth] Effect plugin detected — internal tone generator enabled');
      } else {
        // Instrument plugins: WAM generates audio directly → output
        this._wamNode.connect(this.output);
      }

      // 7. Restore state if available
      if (this._config.pluginState && this._wamInstance.setState) {
        try {
          await this._wamInstance.setState(this._config.pluginState);
        } catch (stateErr) {
          console.warn('[WAMSynth] Failed to restore plugin state, starting fresh:', stateErr);
          this._config.pluginState = null;
        }
      }

      this._isInitialized = true;

      console.log(`[WAMSynth] Loaded plugin: ${descriptor?.name || 'Unknown'} (type: ${this._pluginType})`,
        descriptor ? descriptor : '');

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
   * Send a MIDI event through the best available delivery method.
   * WAM 2.0 SDK expects Uint8Array for MIDI bytes.
   */
  private _sendMidi(event: number[], time: number): void {
    const bytes = new Uint8Array(event);

    if ((this._wamNode as any)?.scheduleEvents) {
      // WAM 2.0 standard: WamNode.scheduleEvents()
      (this._wamNode as any).scheduleEvents({
        type: 'wam-midi',
        data: { bytes },
        time,
      });
    } else if (this._wamInstance.onMidi) {
      // WAM 1.0 fallback
      this._wamInstance.onMidi(event, time);
    } else if ((this._wamNode as any)?.port) {
      // Direct port message fallback
      (this._wamNode as any).port.postMessage({
        type: 'wam-midi',
        data: { bytes },
        time,
      });
    } else {
      console.warn('[WAMSynth] No MIDI delivery method available on this plugin');
    }
  }

  /**
   * Convert MIDI note to frequency (Hz)
   */
  private _midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Trigger a note attack.
   * For instrument plugins: sends MIDI note-on.
   * For effect plugins: creates an oscillator at the note frequency and feeds it
   * through the effect so you hear the processed tone.
   */
  triggerAttack(frequency: number | string, time?: number, velocity = 1): this {
    if (!this._isInitialized || !this._wamInstance) return this;

    const midiNote = noteToMidi(frequency);
    const vel = Math.round(velocity * 127);
    const triggerTime = time ?? this._audioContext.currentTime;

    this._activeNotes.add(midiNote);

    if (this._pluginType === 'effect' && this._inputGain) {
      // Effect plugin: create a per-note oscillator → inputGain → WAM effect → output
      // Stop existing oscillator for this note if any
      const existing = this._activeOscillators.get(midiNote);
      if (existing) {
        try { existing.osc.stop(); } catch { /* already stopped */ }
        existing.gain.disconnect();
      }

      const osc = this._audioContext.createOscillator();
      const noteGain = this._audioContext.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(this._midiToFreq(midiNote), triggerTime);
      noteGain.gain.setValueAtTime(velocity * 0.3, triggerTime); // Scale down to avoid clipping

      osc.connect(noteGain);
      noteGain.connect(this._inputGain);
      osc.start(triggerTime);

      this._activeOscillators.set(midiNote, { osc, gain: noteGain });
    } else {
      // Instrument plugin: send MIDI
      this._sendMidi([0x90, midiNote, vel], triggerTime);
    }

    return this;
  }

  /**
   * Stop an internal oscillator for effect plugin mode
   */
  private _stopOscillator(midiNote: number, time: number): void {
    const entry = this._activeOscillators.get(midiNote);
    if (!entry) return;
    // Quick fade-out to avoid click
    entry.gain.gain.setValueAtTime(entry.gain.gain.value, time);
    entry.gain.gain.linearRampToValueAtTime(0, time + 0.02);
    try { entry.osc.stop(time + 0.03); } catch { /* already stopped */ }
    this._activeOscillators.delete(midiNote);
  }

  /**
   * Trigger a note release.
   * For instrument plugins: sends MIDI note-off.
   * For effect plugins: stops the internal oscillator for this note.
   */
  triggerRelease(frequency?: number | string, time?: number): this {
    if (!this._isInitialized || !this._wamInstance) return this;

    const triggerTime = time ?? this._audioContext.currentTime;

    if (frequency !== undefined) {
      const midiNote = noteToMidi(frequency);
      this._activeNotes.delete(midiNote);

      if (this._pluginType === 'effect') {
        this._stopOscillator(midiNote, triggerTime);
      } else {
        this._sendMidi([0x80, midiNote, 0], triggerTime);
      }
    } else {
      // Release all
      if (this._pluginType === 'effect') {
        for (const note of this._activeOscillators.keys()) {
          this._stopOscillator(note, triggerTime);
        }
      } else {
        for (const activeNote of this._activeNotes) {
          this._sendMidi([0x80, activeNote, 0], triggerTime);
        }
        this._sendMidi([0xB0, 123, 0], triggerTime);
      }
      this._activeNotes.clear();
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
    if (!this._isInitialized || !this._wamInstance) {
      console.warn('[WAMSynth] createGui: not initialized or no instance');
      return null;
    }

    const inst = this._wamInstance;
    const pluginName = inst.descriptor?.name || inst.constructor?.name || 'unknown';
    console.log(`[WAMSynth] createGui for "${pluginName}": hasMethod=${typeof inst.createGui === 'function'}, guiModuleUrl=${inst._guiModuleUrl || 'none'}`);

    // 1. Try the standard WAM 2.0 createGui()
    if (typeof inst.createGui === 'function') {
      try {
        const gui = await inst.createGui();
        if (gui) {
          console.log(`[WAMSynth] createGui returned element: <${gui.tagName?.toLowerCase()}>`);
          return gui as HTMLElement;
        }
        console.log('[WAMSynth] createGui returned null/undefined');
      } catch (err) {
        console.warn('[WAMSynth] createGui threw:', err);
      }
    }

    // 2. Fallback: try to load gui.js relative to the module URL
    if (this._config.moduleUrl) {
      const baseUrl = this._config.moduleUrl.replace(/\/[^/]*$/, '/');
      const guiCandidates = ['gui.js', 'Gui/index.js', 'gui/index.js'];
      for (const guiFile of guiCandidates) {
        const guiUrl = baseUrl + guiFile;
        try {
          console.log(`[WAMSynth] Trying fallback GUI module: ${guiUrl}`);
          const guiModule = await import(/* @vite-ignore */ guiUrl);
          if (typeof guiModule.createElement === 'function') {
            const gui = await guiModule.createElement(inst);
            if (gui) {
              console.log(`[WAMSynth] Fallback GUI loaded from ${guiFile}: <${gui.tagName?.toLowerCase()}>`);
              return gui as HTMLElement;
            }
          }
        } catch {
          // This candidate doesn't exist, try next
        }
      }
    }

    console.log(`[WAMSynth] No GUI available for "${pluginName}"`);
    return null;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this._releaseTimers.forEach(timer => clearTimeout(timer));
    this._releaseTimers.clear();
    this._activeNotes.clear();
    // Stop all active oscillators (effect mode)
    for (const [, entry] of this._activeOscillators) {
      try { entry.osc.stop(); } catch { /* already stopped */ }
      entry.gain.disconnect();
    }
    this._activeOscillators.clear();
    if (this._inputGain) {
      this._inputGain.disconnect();
    }
    if (this._wamNode) {
      this._wamNode.disconnect();
    }
    if (this._wamInstance?.destroy) {
      this._wamInstance.destroy();
    }
    this.output.disconnect();
  }
}
