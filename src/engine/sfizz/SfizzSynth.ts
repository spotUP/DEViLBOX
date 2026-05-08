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
  sfzPreset?: string;      // Name of the SFZ preset to load
}

export const DEFAULT_SFIZZ: SfizzConfig = {
  volume: 0.8, pan: 0, polyphony: 64,
  oversampling: 0, preloadSize: 8192,
  sustainPedal: 0, modWheel: 0,
  expression: 1.0, pitchBend: 0,
  reverbSend: 0.2, chorusSend: 0,
  transpose: 0,
  sfzPreset: 'Sine Pad',
};

export const SFIZZ_PRESETS: Record<string, SfizzConfig> = {
  'Sine Pad': { ...DEFAULT_SFIZZ, sfzPreset: 'Sine Pad' },
  'Saw Lead': { ...DEFAULT_SFIZZ, sfzPreset: 'Saw Lead', volume: 0.7 },
  'Square Lead': { ...DEFAULT_SFIZZ, sfzPreset: 'Square Lead', volume: 0.6 },
  'Triangle Soft': { ...DEFAULT_SFIZZ, sfzPreset: 'Triangle Soft', volume: 0.8 },
  'Noise Texture': { ...DEFAULT_SFIZZ, sfzPreset: 'Noise Texture', volume: 0.4 },
  'Pluck': { ...DEFAULT_SFIZZ, sfzPreset: 'Pluck', volume: 0.75 },
  'Warm Pad': { ...DEFAULT_SFIZZ, sfzPreset: 'Warm Pad', volume: 0.7 },
  'Bass': { ...DEFAULT_SFIZZ, sfzPreset: 'Bass', volume: 0.8 },
};

/** SFZ definitions for each preset — sfizz built-in oscillators + opcodes.
 * sfizz's built-in oscillators are basic — for rich sounds, load real SFZ libraries.
 * These presets use layering, filter envelopes, and detuning to be more interesting. */
const SFIZZ_PRESET_SFZ: Record<string, string> = {
  'Sine Pad': `<global> amp_veltrack=80
<group>
<region> sample=*sine
ampeg_attack=0.4 ampeg_decay=2.0 ampeg_sustain=70 ampeg_release=1.2
<region> sample=*sine
ampeg_attack=0.6 ampeg_decay=2.0 ampeg_sustain=60 ampeg_release=1.5
pitch_keycenter=60 transpose=12 volume=-12`,

  'Saw Lead': `<global> amp_veltrack=100
<group>
<region> sample=*saw
ampeg_attack=0.01 ampeg_decay=0.4 ampeg_sustain=60 ampeg_release=0.25
cutoff=3500 resonance=4 fil_type=lpf_2p
fileg_attack=0 fileg_decay=0.3 fileg_sustain=20 fileg_depth=5000
<region> sample=*saw
ampeg_attack=0.01 ampeg_decay=0.4 ampeg_sustain=60 ampeg_release=0.25
cutoff=3500 resonance=4 fil_type=lpf_2p
fileg_attack=0 fileg_decay=0.3 fileg_sustain=20 fileg_depth=5000
tune=15 volume=-6`,

  'Square Lead': `<global> amp_veltrack=100
<group>
<region> sample=*square
ampeg_attack=0.005 ampeg_decay=0.3 ampeg_sustain=55 ampeg_release=0.2
cutoff=2500 resonance=5 fil_type=lpf_2p
fileg_attack=0 fileg_decay=0.2 fileg_sustain=10 fileg_depth=4000
<region> sample=*square
ampeg_attack=0.005 ampeg_decay=0.3 ampeg_sustain=55 ampeg_release=0.2
cutoff=2500 resonance=5 fil_type=lpf_2p
tune=-10 volume=-6`,

  'Triangle Soft': `<global> amp_veltrack=50
<group>
<region> sample=*triangle
ampeg_attack=0.15 ampeg_decay=1.0 ampeg_sustain=85 ampeg_release=0.8
cutoff=5000 resonance=0.5 fil_type=lpf_2p
<region> sample=*sine
ampeg_attack=0.2 ampeg_decay=1.0 ampeg_sustain=80 ampeg_release=1.0
pitch_keycenter=60 transpose=12 volume=-18`,

  'Noise Texture': `<global> amp_veltrack=40
<group>
<region> sample=*noise
ampeg_attack=0.8 ampeg_decay=3.0 ampeg_sustain=20 ampeg_release=2.0
cutoff=1200 resonance=6 fil_type=lpf_2p
fileg_attack=0.5 fileg_decay=2.0 fileg_sustain=0 fileg_depth=3000
<region> sample=*sine
ampeg_attack=1.0 ampeg_decay=2.0 ampeg_sustain=40 ampeg_release=2.0
volume=-12`,

  'Pluck': `<global> amp_veltrack=100
<group>
<region> sample=*saw
ampeg_attack=0.001 ampeg_decay=0.5 ampeg_sustain=0 ampeg_release=0.15
cutoff=8000 resonance=3 fil_type=lpf_2p
fileg_attack=0 fileg_decay=0.12 fileg_sustain=0 fileg_depth=6000
<region> sample=*square
ampeg_attack=0.001 ampeg_decay=0.3 ampeg_sustain=0 ampeg_release=0.1
cutoff=6000 resonance=2 fil_type=lpf_2p
fileg_attack=0 fileg_decay=0.08 fileg_sustain=0 fileg_depth=4000
pitch_keycenter=60 transpose=12 volume=-10`,

  'Warm Pad': `<global> amp_veltrack=50
<group>
<region> sample=*saw
ampeg_attack=0.8 ampeg_decay=2.0 ampeg_sustain=65 ampeg_release=1.5
cutoff=1200 resonance=1.5 fil_type=lpf_2p
<region> sample=*saw
ampeg_attack=0.9 ampeg_decay=2.0 ampeg_sustain=65 ampeg_release=1.5
cutoff=1000 resonance=1 fil_type=lpf_2p
tune=12 volume=-4
<region> sample=*square
ampeg_attack=1.0 ampeg_decay=2.0 ampeg_sustain=60 ampeg_release=1.8
cutoff=800 resonance=0.5 fil_type=lpf_2p
pitch_keycenter=60 transpose=7 volume=-10`,

  'Bass': `<global> amp_veltrack=100
<group>
<region> sample=*saw
ampeg_attack=0.003 ampeg_decay=0.35 ampeg_sustain=45 ampeg_release=0.1
cutoff=1200 resonance=5 fil_type=lpf_2p
fileg_attack=0 fileg_decay=0.08 fileg_sustain=0 fileg_depth=4000
<region> sample=*square
ampeg_attack=0.003 ampeg_decay=0.4 ampeg_sustain=50 ampeg_release=0.1
cutoff=800 resonance=2 fil_type=lpf_2p
pitch_keycenter=60 transpose=-12 volume=-6`,
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
    case 'volume':       return { type: 'setVolume', value: value > 0 ? 20 * Math.log10(value) : -80 }; // 0-1 linear → dB
    case 'polyphony':    return { type: 'setNumVoices', value: Math.round(value) };
    case 'oversampling': return { type: 'setOversampling', value: Math.round(value) };
    case 'preloadSize':  return { type: 'setPreloadSize', value: Math.round(value) };
    // MIDI CCs via sfizz HD API: value is 0.0-1.0 float (NOT 0-127 integer)
    case 'pan':          return { type: 'cc', delay: 0, cc: 10, value: (value + 1) * 0.5 }; // -1..1 → 0..1
    case 'sustainPedal': return { type: 'cc', delay: 0, cc: 64, value: value >= 0.5 ? 1.0 : 0 };
    case 'modWheel':     return { type: 'cc', delay: 0, cc: 1,  value };
    case 'expression':   return { type: 'cc', delay: 0, cc: 11, value };
    case 'reverbSend':   return { type: 'cc', delay: 0, cc: 91, value };
    case 'chorusSend':   return { type: 'cc', delay: 0, cc: 93, value };
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
            `${baseUrl}sfizz/Sfizz.worklet.js?v=${Date.now()}`
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

  private _lastSfzPreset: string | undefined;

  private sendConfig(config: SfizzConfig): void {
    if (!this._worklet || !this.isInitialized) return;
    for (const key of CONFIG_KEYS) {
      const value = config[key];
      if (value !== undefined && value !== this.config[key]) {
        this.config[key] = value as never;
        const msg = buildParamMessage(key, value as number);
        if (msg) this._worklet.port.postMessage(msg);
      }
    }
    // Load new SFZ if preset changed
    if (config.sfzPreset && config.sfzPreset !== this._lastSfzPreset) {
      this._lastSfzPreset = config.sfzPreset;
      const sfz = SFIZZ_PRESET_SFZ[config.sfzPreset];
      if (sfz) this.loadSFZ(sfz, new Map());
    }
  }

  private loadDefaultSFZ(_baseUrl: string): void {
    // Load default preset SFZ using sfizz built-in oscillator (no sample files needed)
    const sfz = SFIZZ_PRESET_SFZ['Sine Pad'];
    if (sfz) {
      this.loadSFZ(sfz, new Map());
    }
  }

  /** Load an SFZ instrument from a FileList (e.g. from <input type="file" webkitdirectory>).
   *  Writes ALL files (SFZ, includes, samples) to MEMFS, then loads via loadSfzFile. */
  async loadSFZFromFiles(files: FileList | File[]): Promise<{ success: boolean; name?: string }> {
    if (!this._worklet) return { success: false };
    const fileArr = Array.from(files);

    // Find the .sfz file
    const sfzFile = fileArr.find(f => f.name.toLowerCase().endsWith('.sfz'));
    if (!sfzFile) return { success: false };

    // Find the base directory (relative to the .sfz file)
    const sfzDir = sfzFile.webkitRelativePath
      ? sfzFile.webkitRelativePath.substring(0, sfzFile.webkitRelativePath.lastIndexOf('/'))
      : '';

    // Write ALL files to MEMFS (SFZ, text includes, samples — everything)
    const memfsFiles: { path: string; data: ArrayBuffer }[] = [];
    for (const file of fileArr) {
      const data = await file.arrayBuffer();
      let relPath = file.webkitRelativePath || file.name;
      if (sfzDir && relPath.startsWith(sfzDir + '/')) {
        relPath = relPath.substring(sfzDir.length + 1);
      }
      memfsFiles.push({ path: `/sfz/${relPath}`, data });
    }

    // Write files to MEMFS
    this._worklet.port.postMessage({ type: 'writeFiles', files: memfsFiles });

    // Load via file path (sfizz resolves #include and default_path relative to the .sfz)
    const sfzName = sfzFile.webkitRelativePath
      ? sfzFile.webkitRelativePath.substring(sfzDir.length + 1)
      : sfzFile.name;
    this._worklet.port.postMessage({ type: 'loadSfzFile', path: `/sfz/${sfzName}` });

    // Mark as custom file load so sendConfig won't overwrite with a built-in preset
    this.config.sfzPreset = '__file__';
    this._lastSfzPreset = '__file__';

    return { success: true, name: sfzFile.name };
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

  private _currentMidiNote = 69;

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
    this._currentMidiNote = note;
    const vel = Math.max(0, Math.min(1, velocity ?? 0.8));
    if (!this.isInitialized || !this._worklet) {
      this.pendingNotes.push({ note, velocity: vel });
      return this;
    }
    this._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet || !this.isInitialized) {
      // Clear pending notes to prevent stuck notes when noteOff arrives before init
      if (frequency !== undefined) {
        const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
        this.pendingNotes = this.pendingNotes.filter(p => p.note !== note);
      } else {
        this.pendingNotes = [];
      }
      return this;
    }
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
      const prev = (this.config as Record<string, number>)[param];
      if (prev === value) return; // Skip unchanged — avoids audio glitches from redundant messages
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

  /**
   * Set oscillator frequency in Hz for tracker effect commands.
   * Converts to sfizz pitch wheel value (-8191..8191).
   */
  setFrequency(hz: number): void {
    if (!this._worklet || !this.isInitialized || hz <= 0) return;
    const currentNoteHz = 440 * Math.pow(2, (this._currentMidiNote - 69) / 12);
    const semitoneOffset = 12 * Math.log2(hz / currentNoteHz);
    // Sfizz pitch wheel: ±2 semitone range by default
    const bendRange = 2;
    const normalized = Math.max(-1, Math.min(1, semitoneOffset / bendRange));
    this._worklet.port.postMessage({ type: 'pitchWheel', delay: 0, value: Math.round(normalized * 8191) });
  }

  setPreset(name: string): void {
    const preset = SFIZZ_PRESETS[name];
    if (preset) {
      this.config = { ...preset };
      this.sendConfig(this.config);
      // Load the SFZ definition for this preset (different oscillator/envelope/filter)
      const sfz = SFIZZ_PRESET_SFZ[name];
      if (sfz) {
        this.loadSFZ(sfz, new Map());
      }
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
    // Handle sfzPreset change (loads different SFZ instrument)
    if (config.sfzPreset) {
      this.setPreset(config.sfzPreset);
    }
    const prev = (this as any).config as Record<string, number | undefined>;
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number' && value !== prev[key]) {
        this.set(key, value);
      }
    }
  }
}
