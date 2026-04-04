/**
 * SfizzSynth.ts - Sfizz SFZ player WASM engine for DEViLBOX
 *
 * Features:
 * - SFZ file loading with sample data
 * - Volume, pan, polyphony control
 * - Oversampling quality
 * - Performance controllers (sustain, mod wheel, expression, pitch bend)
 * - Reverb/chorus sends
 * - ~12 parameters
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export const SfizzParam = {
  VOLUME: 0, PAN: 1, POLYPHONY: 2,
  OVERSAMPLING: 3, PRELOAD_SIZE: 4,
  SUSTAIN_PEDAL: 5, MOD_WHEEL: 6,
  EXPRESSION: 7, PITCH_BEND: 8,
  REVERB_SEND: 9, CHORUS_SEND: 10,
  TRANSPOSE: 11,
} as const;

export const SFIZZ_PARAM_NAMES: Record<number, string> = {
  0: 'Volume', 1: 'Pan', 2: 'Polyphony',
  3: 'Oversampling', 4: 'Preload Size',
  5: 'Sustain Pedal', 6: 'Mod Wheel',
  7: 'Expression', 8: 'Pitch Bend',
  9: 'Reverb Send', 10: 'Chorus Send',
  11: 'Transpose',
};

export interface SfizzConfig {
  volume?: number;         // 0-1
  pan?: number;            // -1 to 1
  polyphony?: number;      // 1-256
  oversampling?: number;   // 0-3 (1x/2x/4x/8x)
  preloadSize?: number;    // 1024-65536
  sustainPedal?: number;   // 0/1
  modWheel?: number;       // 0-1
  expression?: number;     // 0-1
  pitchBend?: number;      // -1 to 1
  reverbSend?: number;     // 0-1
  chorusSend?: number;     // 0-1
  transpose?: number;      // -24 to 24
}

export const DEFAULT_SFIZZ: SfizzConfig = {
  volume: 0.8, pan: 0, polyphony: 64,
  oversampling: 0, preloadSize: 8192,
  sustainPedal: 0, modWheel: 0,
  expression: 1.0, pitchBend: 0,
  reverbSend: 0.2, chorusSend: 0,
  transpose: 0,
};

export const SFIZZ_PRESETS: Record<string, SfizzConfig> = {
  'Natural': { ...DEFAULT_SFIZZ },
  'Expressive': { ...DEFAULT_SFIZZ, expression: 0.8, modWheel: 0.5, reverbSend: 0.3 },
  'Staccato': { ...DEFAULT_SFIZZ, sustainPedal: 0, expression: 1.0, reverbSend: 0.1, chorusSend: 0 },
  'Legato': { ...DEFAULT_SFIZZ, sustainPedal: 1, expression: 0.7, reverbSend: 0.3, chorusSend: 0.1 },
  'Ambient': { ...DEFAULT_SFIZZ, reverbSend: 0.7, chorusSend: 0.5, expression: 0.6, modWheel: 0.3 },
  'Orchestral': { ...DEFAULT_SFIZZ, expression: 0.9, modWheel: 0.6, reverbSend: 0.5, chorusSend: 0.2, polyphony: 64 },
  'Chamber': { ...DEFAULT_SFIZZ, expression: 0.75, reverbSend: 0.35, chorusSend: 0.1, polyphony: 32 },
  'Solo Bright': { ...DEFAULT_SFIZZ, expression: 1.0, modWheel: 0.7, reverbSend: 0.2, chorusSend: 0, volume: 0.85 },
};

const CONFIG_KEYS: (keyof SfizzConfig)[] = [
  'volume', 'pan', 'polyphony', 'oversampling', 'preloadSize',
  'sustainPedal', 'modWheel', 'expression', 'pitchBend',
  'reverbSend', 'chorusSend', 'transpose',
];

/**
 * Build the correct worklet message for a given config key/value.
 * The worklet has NO generic 'setParam' handler — each parameter uses
 * a specific named message type (setVolume, setNumVoices, cc, pitchWheel, etc.).
 */
function buildParamMessage(key: keyof SfizzConfig, value: number): Record<string, unknown> | null {
  switch (key) {
    case 'volume':       return { type: 'setVolume', value };
    case 'polyphony':    return { type: 'setNumVoices', value: Math.round(value) };
    case 'oversampling': return { type: 'setOversampling', value: Math.round(value) };
    case 'preloadSize':  return { type: 'setPreloadSize', value: Math.round(value) };
    // MIDI CCs: pan=10, sustain=64, modWheel=1, expression=11, reverbSend=91, chorusSend=93
    case 'pan':          return { type: 'cc', delay: 0, cc: 10, value: Math.round((value + 1) * 0.5 * 127) }; // -1..1 → 0..127
    case 'sustainPedal': return { type: 'cc', delay: 0, cc: 64, value: value >= 0.5 ? 127 : 0 };
    case 'modWheel':     return { type: 'cc', delay: 0, cc: 1,  value: Math.round(value * 127) };
    case 'expression':   return { type: 'cc', delay: 0, cc: 11, value: Math.round(value * 127) };
    case 'reverbSend':   return { type: 'cc', delay: 0, cc: 91, value: Math.round(value * 127) };
    case 'chorusSend':   return { type: 'cc', delay: 0, cc: 93, value: Math.round(value * 127) };
    case 'pitchBend':    return { type: 'pitchWheel', delay: 0, value: Math.round(value * 8191) }; // -1..1 → -8191..8191
    case 'transpose':    return null; // Transpose is handled at note level, not by worklet
    default:             return null;
  }
}

export class SfizzSynthEngine implements DevilboxSynth {
  readonly name = 'SfizzSynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: SfizzConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<SfizzConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_SFIZZ, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!SfizzSynthEngine.isWorkletLoaded) {
        if (!SfizzSynthEngine.workletLoadPromise) {
          SfizzSynthEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}sfizz/Sfizz.worklet.js`
          );
        }
        await SfizzSynthEngine.workletLoadPromise;
        SfizzSynthEngine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}sfizz/Sfizz.wasm`),
        fetch(`${baseUrl}sfizz/Sfizz.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load Sfizz.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load Sfizz.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}sfizz/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
        .replace(/new\s+URL\(([^,]+),\s*([^)]+)\)\.href/g, '($2 + $1)');

      this._worklet = new AudioWorkletNode(rawContext, 'sfizz-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          this.sendConfig(this.config);
          // Auto-load default SFZ so the synth produces sound immediately
          this.loadDefaultSFZ(baseUrl);
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('Sfizz error:', event.data.error);
        }
      };

      this._worklet.port.postMessage({
        type: 'init', wasmBinary, jsCode, sampleRate: rawContext.sampleRate,
      });

      this._worklet.connect(this.output);

      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch { /* keepalive failed */ }

    } catch (error) {
      console.error('Failed to initialize Sfizz:', error);
      throw error;
    }
  }

  private sendConfig(config: SfizzConfig): void {
    if (!this._worklet || !this.isInitialized) return;
    for (const key of CONFIG_KEYS) {
      const value = config[key];
      if (value !== undefined) {
        const msg = buildParamMessage(key, value);
        if (msg) this._worklet.port.postMessage(msg);
      }
    }
  }

  private async loadDefaultSFZ(baseUrl: string): Promise<void> {
    try {
      const [sfzRes, wavRes] = await Promise.all([
        fetch(`${baseUrl}sfizz/default.sfz`),
        fetch(`${baseUrl}sfizz/default_sample.wav`),
      ]);
      if (!sfzRes.ok || !wavRes.ok) return;
      const [sfzContent, wavData] = await Promise.all([
        sfzRes.text(),
        wavRes.arrayBuffer(),
      ]);
      const samples = new Map<string, ArrayBuffer>();
      samples.set('default_sample.wav', wavData);
      this.loadSFZ(sfzContent, samples);
    } catch {
      // No default SFZ available — user must load one manually
    }
  }

  loadSFZ(sfzContent: string, samples: Map<string, ArrayBuffer>): void {
    if (!this._worklet) {
      console.warn('Sfizz: worklet not ready, cannot load SFZ');
      return;
    }
    // Step 1: Write sample files to MEMFS
    if (samples.size > 0) {
      const files: { path: string; data: ArrayBuffer }[] = [];
      for (const [name, data] of samples) {
        files.push({ path: `/${name}`, data });
      }
      this._worklet.port.postMessage({ type: 'writeFiles', files });
    }
    // Step 2: Load SFZ text (references samples already in MEMFS)
    this._worklet.port.postMessage({ type: 'loadSfzString', sfzText: sfzContent, virtualPath: '/loaded.sfz' });
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
    const vel = Math.max(0, Math.min(1, velocity ?? 0.8));
    if (!this.isInitialized || !this._worklet) {
      this.pendingNotes.push({ note, velocity: vel });
      return this;
    }
    this._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet || !this.isInitialized) return this;
    if (frequency !== undefined) {
      const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
      this._worklet.port.postMessage({ type: 'noteOff', note });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }
    return this;
  }

  set(param: string, value: number): void {
    const key = param as keyof SfizzConfig;
    if (CONFIG_KEYS.includes(key)) {
      (this.config as Record<string, number>)[param] = value;
      if (this._worklet && this.isInitialized) {
        const msg = buildParamMessage(key, value);
        if (msg) this._worklet.port.postMessage(msg);
      }
    }
  }

  get(param: string): number | undefined {
    return (this.config as Record<string, number | undefined>)[param];
  }

  setPreset(name: string): void {
    const preset = SFIZZ_PRESETS[name];
    if (preset) {
      this.config = { ...preset };
      this.sendConfig(this.config);
    }
  }

  dispose(): void {
    if (this._worklet) {
      this._worklet.port.postMessage({ type: 'dispose' });
      this._worklet.disconnect();
      this._worklet = null;
    }
    this.isInitialized = false;
  }
}

export class SfizzSynthImpl extends SfizzSynthEngine {
  async init(): Promise<void> {
    return this.ensureInitialized();
  }

  applyConfig(config: Partial<SfizzConfig>): void {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number') {
        this.set(key, value);
      }
    }
  }
}
